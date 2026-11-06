/**
 * Webhook handler that answers "where is my order?" buyer messages with the tracking number.
 *
 *   npm install @horusship/sdk
 *   HORUS_API_KEY=ak_… HORUS_WEBHOOK_SECRET=whsec_… npx tsx auto-reply-webhook.ts      # drafts only
 *   AUTO_SEND=1 … npx tsx auto-reply-webhook.ts                                        # actually replies
 *
 * Point a webhook at it (public HTTPS, e.g. through a tunnel) subscribed to `message.received`:
 *   horus webhooks create --url https://<host>/horus --events message.received --json
 *
 * It verifies the signature, answers 204 at once, dedupes on the event id, and only replies when the
 * message is a tracking question about a sale that has shipped (or been bought). Everything else is
 * printed for a human. Replies use the Idempotency-Key `reply-<message id>`, so a redelivered or
 * replayed event never sends twice.
 *
 * Scopes: messages:write, listings:read, sales:read.
 */
import { createServer } from "node:http";
import { Horus, verifyWebhook, WebhookVerificationError, type HorusEvent, type Sale } from "@horusship/sdk";

const horus = new Horus();
const SECRET = process.env.HORUS_WEBHOOK_SECRET ?? "";
const AUTO_SEND = process.env.AUTO_SEND === "1";
const PORT = Number(process.env.PORT ?? 8787);
const TRACKING_QUESTION = /\b(where|track|tracking|shipp?ed|ship|arriv|deliver|status|order)\b/i;

const seen = new Set<string>(); // use a database in production: delivery is at least once

/** The sale this message is about: listing → its eBay SKU → sales with that SKU from this buyer. */
async function findSale(listingId: string | null, buyer: string | null): Promise<Sale | null> {
    if (!listingId) return null;
    const listing = await horus.listings.get(listingId);
    if (!listing.ebay.sku) return null;
    const sales = await horus.sales.list({ q: listing.ebay.sku, limit: 20 });
    const mine = sales.data.filter((s) => !buyer || s.buyer_username === buyer);
    return mine[0] ?? null; // newest first
}

function draftFor(sale: Sale, buyer: string): string | null {
    const name = buyer || "there";
    if ((sale.status === "SHIPPED" || sale.status === "DELIVERED") && sale.tracking.number) {
        const carrier = sale.tracking.carrier ? ` with ${sale.tracking.carrier}` : "";
        return `Hi ${name}, thanks for your order! It has shipped${carrier}. Tracking number: ${sale.tracking.number}. ` +
            "It can take a day for the tracking to update. Let me know if anything looks off.";
    }
    if (sale.status === "PURCHASED") {
        return `Hi ${name}, thanks for your patience! Your order has been dispatched, and the tracking number ` +
            "will appear on your eBay order as soon as the carrier scans it, usually within 1–2 business days.";
    }
    return null; // PENDING, cancelled, refunded…: a human should answer
}

async function handle(event: HorusEvent): Promise<void> {
    if (event.type !== "message.received") return;
    const msg = event.data.message;
    if (msg.is_vero || !msg.thread_id) return console.log(`[skip] ${msg.is_vero ? "VeRO notice" : "no thread"}: ${msg.subject}`);
    if (!TRACKING_QUESTION.test(`${msg.subject} ${msg.body}`)) return console.log(`[review] not a tracking question from ${msg.sender}: ${msg.body.slice(0, 120)}`);

    const sale = await findSale(msg.listing_id, msg.sender);
    const draft = sale ? draftFor(sale, msg.sender ?? "") : null;
    if (!draft) return console.log(`[review] no shipped sale found for ${msg.sender} (listing ${msg.listing_id ?? "?"})`);

    if (!AUTO_SEND) return console.log(`[draft] thread ${msg.thread_id}\n${draft}\n`);
    await horus.messages.threads.reply(msg.thread_id, { body: draft }, { idempotencyKey: `reply-${msg.id}` });
    await horus.messages.threads.markRead(msg.thread_id);
    console.log(`[sent] thread ${msg.thread_id} (sale ${sale?.id})`);
}

createServer((req, res) => {
    if (req.method !== "POST") { res.writeHead(405).end(); return; }
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
        let event: HorusEvent;
        try {
            event = verifyWebhook(Buffer.concat(chunks), req.headers, SECRET); // raw body, before JSON parsing
        } catch (err) {
            res.writeHead(err instanceof WebhookVerificationError ? 400 : 500).end();
            return;
        }
        res.writeHead(204).end(); // acknowledge within 10 s, work afterwards
        if (seen.has(event.id)) return;
        seen.add(event.id);
        handle(event).catch((err: unknown) => console.error(`[error] ${event.id}:`, err));
    });
}).listen(PORT, () => console.log(`listening on :${PORT} (${AUTO_SEND ? "AUTO_SEND on" : "drafts only"})`));
