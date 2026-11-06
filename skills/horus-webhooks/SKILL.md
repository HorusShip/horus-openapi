---
name: horus-webhooks
description: Set up and manage Horus webhooks, which send signed HTTP callbacks when sales, listings, accounts, jobs, returns, messages, leads or the desktop change. Use when the user wants notifications or automations ("tell me when a sale comes in", "auto-reply to messages", "alert me if the desktop goes offline"), wants to create, test, debug, replay or rotate a webhook endpoint, verify webhook signatures, or build a handler.
---

# Webhooks

Uses `horus-operator` conventions. Scopes: `webhooks:write` (`webhooks:read` to inspect).

## Create an endpoint

1. Decide the events. The full catalogue is in [references/events.md](references/events.md) (or call
   `eventTypes_list`). Subscribe narrowly: exact names (`sale.held`), area wildcards (`sale.*`) or
   `*`. An empty list means everything. Good starter sets:

| Goal | Events |
|---|---|
| Ops alerts | `desktop.offline`, `ebay_account.token_expired`, `account.session_lost`, `account.login_failed`, `sale.held`, `sale.purchase_failed`, `sale.source_cancelled` |
| Sales feed | `sale.created`, `sale.purchased`, `sale.shipped`, `sale.refunded` |
| Listing pipeline | `listing.created`, `listing.failed`, `listing.out_of_stock`, `listing.ended` |
| Support bot | `message.received`, `return.requested` |
| Job follow-up (instead of polling) | `job.succeeded`, `job.failed` |
| Lead automation | `lead.assigned` |

2. `webhooks_create` `{ url, events, description }`. The URL must be public `https://` (private,
   loopback, link-local and `.local` hosts are refused, and there's a limit of 20 endpoints per account). The response includes
   **`secret`** (`whsec_…`). Hand it to the user to store in their app's secret store. Don't write it into
   chat logs or files you commit. It can be shown again with `webhooks_secret_get`.
3. `webhooks_test` sends a `webhook.test` immediately and returns the delivery with the endpoint's
   response. A 2xx means it's wired up.

CLI: `horus webhooks create --url https://… --events sale.held,desktop.offline --json`.

## What arrives

```http
POST <url>
webhook-id: evt_…            webhook-timestamp: 1762516800
webhook-signature: v1,<base64>   X-Horus-Event: sale.shipped
{ "id": "evt_…", "object": "event", "type": "sale.shipped", "created": "…", "api_version": "2026-11-06",
  "data": { "sale": { … same shape as GET /sales/{id} … } } }
```

The handler must:

- **Verify the signature on the raw body** before parsing (Standard Webhooks: HMAC-SHA256 over
  `"{webhook-id}.{webhook-timestamp}.{body}"`, keyed with the base64-decoded part after `whsec_`).
  Reject timestamps more than 5 min off. Accept if any of the space-separated `v1,` signatures matches
  (there are two during a secret rotation). Use the SDK (TypeScript `verifyWebhook(rawBody, headers, secret)` from `@horusship/sdk`, Python
  `client.webhooks.verify(raw_body, headers, secret)`), any
  `standardwebhooks` library, or `scripts/verify_signature.py` / `scripts/verify-signature.mjs` from this skill.
- **Answer 2xx within 10 s**, then do the work asynchronously. Anything else is retried (30 s, 2 min, 10 min,
  30 min, 1 h, 3 h, 6 h, 12 h). Redirects aren't followed.
- **Dedupe on `id`**, because delivery is at least once. **Don't rely on order.** Use `created`, or re-fetch the
  resource (`sales_get` etc.) before acting on it.

## Debug and recover

| Problem | Do |
|---|---|
| "Nothing arrives" | `webhooks_get` → `status`, `events`, `last_status`, `failure_count`. `webhooks_deliveries_list` `status=failed` → `webhooks_deliveries_get` shows the exact request, response and `attempt_log`. |
| Endpoint was down | Fix it, then `webhooks_replay` `{ since, until? }` (≤30 days, ≤1000 events per call, skips already-delivered ones by default). One delivery only: `webhooks_deliveries_redeliver`. |
| `status: auto_disabled` (3 days of failures) | Fix the endpoint, `webhooks_enable`, then replay from `disabled_at`/`failing_since`. |
| Signature fails | Is the body raw (not re-serialized JSON)? Is it the right secret? Old endpoints may be `payload_format: v1` (legacy body + `X-Horus-Signature`). Switch with `webhooks_update` `{ payload_format: "v2" }` after updating the handler. |
| Secret leaked | `webhooks_rotateSecret` `{ overlap_hours: 24 }` → new secret, and the old one keeps working for 24 h. `overlap_hours: 0` cuts it off immediately (confirm first). |
| What happened while I wasn't subscribed? | `events_list` (`type`, `created_after`). Events are kept for 30 days while some endpoint subscribes to them. |

Deleting an endpoint (`webhooks_delete`) also deletes its delivery log. Confirm first.

## Simple automations

Patterns (full runnable versions are in the SDK repo's `docs/examples/`):

- **Alert relay**: on `desktop.offline`, `sale.held` or `ebay_account.token_expired`, post a message to the user's
  chat. Re-fetch before alerting, because the condition may already be cleared (`desktop.online` arrived).
- **Auto-reply draft**: on `message.received` from a buyer (`data.message.sender_type`, not `is_vero`), look up the sale (via
  `listing_id` → `listings_get` → SKU → `sales_list` `q=`) and draft a reply.
  Send automatically only for templates the user approved (e.g. tracking requests on SHIPPED sales), and queue the rest
  for review. Use the idempotency key `reply-<message id>` so replays never double-send.
- **Listing tracker**: on `listing.failed`, collect `data.error` by reason and summarize daily.
- **Job follow-up**: kick off `accounts_verifyBulk`, then wait for `job.succeeded` / `job.failed` instead of polling.

Never auto-run money-moving actions (cancel, buy, refund, end listings) from a webhook unless the user
explicitly configured that rule.
