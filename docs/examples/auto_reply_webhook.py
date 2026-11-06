"""Webhook handler that answers "where is my order?" buyer messages with the tracking number.

    pip install horus-sdk
    HORUS_API_KEY=ak_... HORUS_WEBHOOK_SECRET=whsec_... python auto_reply_webhook.py   # drafts only
    AUTO_SEND=1 ... python auto_reply_webhook.py                                      # actually replies

Point a webhook at it (public HTTPS, e.g. through a tunnel) subscribed to ``message.received``:

    horus webhooks create --url https://<host>/horus --events message.received --json

It verifies the signature, answers 204 at once, dedupes on the event id, and only replies when the
message is a tracking question about a sale that has shipped (or been bought). Everything else is
printed for a human. Replies use the idempotency key ``reply-<message id>``, so a redelivered or
replayed event never sends twice. Standard library server only, to keep the example small.

Scopes: messages:write, listings:read, sales:read.
"""
from __future__ import annotations

import os
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Optional

from horus import Horus, WebhookVerificationError
from horus.types import MessageReceivedEvent, Sale, WebhookEvent

client = Horus()
SECRET = os.environ.get("HORUS_WEBHOOK_SECRET", "")
AUTO_SEND = os.environ.get("AUTO_SEND") == "1"
PORT = int(os.environ.get("PORT", "8787"))
TRACKING_QUESTION = re.compile(r"\b(where|track|tracking|shipp?ed|ship|arriv|deliver|status|order)\b", re.I)

seen: set[str] = set()  # use a database in production: delivery is at least once
seen_lock = threading.Lock()


def find_sale(listing_id: Optional[str], buyer: Optional[str]) -> Optional[Sale]:
    """The sale this message is about: listing -> its eBay SKU -> sales with that SKU from this buyer."""
    if not listing_id:
        return None
    listing = client.listings.get(listing_id)
    if not listing.ebay.sku:
        return None
    sales = client.sales.list(q=listing.ebay.sku, limit=20).data
    mine = [s for s in sales if not buyer or s.buyer_username == buyer]
    return mine[0] if mine else None  # newest first


def draft_for(sale: Sale, buyer: str) -> Optional[str]:
    name = buyer or "there"
    if sale.status in ("SHIPPED", "DELIVERED") and sale.tracking.number:
        carrier = f" with {sale.tracking.carrier}" if sale.tracking.carrier else ""
        return (f"Hi {name}, thanks for your order! It has shipped{carrier}. Tracking number: {sale.tracking.number}. "
                "It can take a day for the tracking to update. Let me know if anything looks off.")
    if sale.status == "PURCHASED":
        return (f"Hi {name}, thanks for your patience! Your order has been dispatched, and the tracking number "
                "will appear on your eBay order as soon as the carrier scans it, usually within 1-2 business days.")
    return None  # PENDING, cancelled, refunded...: a human should answer


def handle(event: WebhookEvent) -> None:
    if not isinstance(event, MessageReceivedEvent):  # event.type == "message.received"
        return
    msg = event.data.message
    if msg.is_vero or not msg.thread_id:
        print(f"[skip] {'VeRO notice' if msg.is_vero else 'no thread'}: {msg.subject}")
        return
    if not TRACKING_QUESTION.search(f"{msg.subject} {msg.body}"):
        print(f"[review] not a tracking question from {msg.sender}: {msg.body[:120]}")
        return
    sale = find_sale(msg.listing_id, msg.sender)
    draft = draft_for(sale, msg.sender or "") if sale else None
    if not draft:
        print(f"[review] no shipped sale found for {msg.sender} (listing {msg.listing_id or '?'})")
        return
    if not AUTO_SEND:
        print(f"[draft] thread {msg.thread_id}\n{draft}\n")
        return
    client.messages.threads.reply(msg.thread_id, body=draft, idempotency_key=f"reply-{msg.id}")
    client.messages.threads.mark_read(msg.thread_id)
    print(f"[sent] thread {msg.thread_id} (sale {sale.id if sale else '?'})")


class Handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802 (http.server naming)
        raw = self.rfile.read(int(self.headers.get("Content-Length", "0")))  # raw body, before JSON parsing
        try:
            event = client.webhooks.verify(raw, dict(self.headers.items()), SECRET)
        except WebhookVerificationError:
            self.send_response(400)
            self.end_headers()
            return
        self.send_response(204)  # acknowledge within 10 s, work afterwards
        self.end_headers()
        with seen_lock:
            if event.id in seen:
                return
            seen.add(event.id)
        threading.Thread(target=self._work, args=(event,), daemon=True).start()

    @staticmethod
    def _work(event: WebhookEvent) -> None:
        try:
            handle(event)
        except Exception as err:  # keep the server alive; the event is in the delivery log for replay
            print(f"[error] {event.id}: {err!r}")


if __name__ == "__main__":
    print(f"listening on :{PORT} ({'AUTO_SEND on' if AUTO_SEND else 'drafts only'})")
    ThreadingHTTPServer(("", PORT), Handler).serve_forever()
