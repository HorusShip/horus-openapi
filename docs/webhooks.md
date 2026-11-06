# Webhooks

Horus sends a signed JSON event to your HTTPS endpoint when something happens in your account: a sale
comes in, an order is bought, tracking uploads, a buyer account is signed out, a listing goes live or fails,
a buyer sends a message, your desktop goes offline.

- Manage endpoints in **Settings → API → Event webhooks**, or through the API (`/webhooks`, scopes
  `webhooks:read` / `webhooks:write`), the SDKs or the CLI (`horus webhooks list`, `horus webhooks create`, …).
- The list of event types is at `GET /event_types`. Typed payload schemas for each one are in the
  [OpenAPI document](https://horusship.com/api/v1/openapi.json)'s `webhooks` section (e.g. `SaleShippedEvent`).

## Create an endpoint

```sh
curl -X POST https://horusship.com/api/v1/webhooks \
  -H "Authorization: Bearer $HORUS_API_KEY" -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/horus","events":["sale.*","desktop.offline"],"description":"ops"}'
```

The response includes the endpoint's signing **`secret`** (`whsec_…`). Store it with your app's secrets.
You can reveal it again later with `GET /webhooks/{id}/secret`.

Then send a test: `POST /webhooks/{id}/test` delivers a `webhook.test` event right away and returns your
endpoint's response.

### Choosing events

`events` takes exact types (`sale.shipped`), area wildcards (`sale.*`) or `*`. An empty list means every
event. Unknown names are rejected.

| Area | Events |
|---|---|
| sale | `created`, `purchased`, `purchase_failed`, `shipped`, `delivered`, `cancelled`, `source_cancelled`, `held`, `refunded` |
| listing | `created` (live on eBay), `failed`, `ended`, `repriced`, `out_of_stock`, `back_in_stock`, `relisted` |
| account | `session_lost`, `session_restored`, `login_failed`, `recovered` |
| job | `succeeded`, `failed` |
| return | `requested`, `processing`, `label_sent`, `declined`, `completed` |
| message | `received` |
| lead | `assigned` |
| sourcing | `candidate_found` |
| ebay_account | `token_expired`, `reconnected` |
| desktop | `online`, `offline` |
| webhook | `test` (always delivered by the test button, whatever the filter) |

Endpoints must be public `http(s)` URLs. Loopback, private (RFC 1918), link-local, CGNAT and
`.internal`/`.local` hosts are refused, and DNS is re-checked before every attempt. Each account can have up to 20 endpoints.

## The request

```http
POST /horus HTTP/1.1
Content-Type: application/json
User-Agent: Horus-Webhooks/2 (+https://horusship.com/docs/webhooks)
webhook-id: evt_mh5xk2a0q9c1f3d2e8b7a6c5
webhook-timestamp: 1762516800
webhook-signature: v1,K5oZfzN95Z9UVu1EsfQmfVNQhnkZ2pj9o9NDN/H/pI4=
X-Horus-Event: sale.shipped
X-Horus-Delivery: cm3abc…

{
  "id": "evt_mh5xk2a0q9c1f3d2e8b7a6c5",
  "object": "event",
  "type": "sale.shipped",
  "created": "2026-11-07T12:00:00.000Z",
  "api_version": "2026-11-06",
  "data": { "sale": { "object": "sale", "id": "cm3…", "status": "SHIPPED", "tracking": { "number": "1Z…" }, … } }
}
```

`data` holds the resource in the same shape the API returns it (`{ "sale": … }`, `{ "listing": … }`,
`{ "account": … }`, `{ "job": … }`), plus a few event-specific fields: `listing.repriced` adds
`previous_price` and `price`, `listing.failed` adds `error`, and `sale.cancelled` adds `reason`.

## Responding

- Return any **2xx within 10 seconds**. Anything else (3xx, 4xx, 5xx, a timeout or a connection error) is a
  failure and the delivery is retried. Redirects aren't followed.
- Do slow work after you respond. Put the event on a queue.

## Delivery guarantees

- **At least once.** Retries and replays can deliver an event more than once, so dedupe on `id` (the same as
  the `webhook-id` header).
- **Unordered.** Use `created`, or re-fetch the resource, instead of trusting arrival order.
- **Retries**: 30 s, 2 min, 10 min, 30 min, 1 h, 3 h, 6 h, 12 h (±20 % jitter). That's 9 attempts over about 23
  hours. After that the delivery is `failed`.
- **Auto-disable**: an endpoint that fails every delivery for **3 days** is switched off and you're notified
  (Discord error webhook and the mobile app). Fix it, re-enable it (`POST /webhooks/{id}/enable` or the
  toggle), then replay what you missed.

## Delivery log and replay

Every delivery is kept for 30 days with its status, attempts, latency and the first 1 KB of your response.

| Do | Call |
|---|---|
| List deliveries (filter `status`, `event_type`, dates) | `GET /webhooks/{id}/deliveries` |
| See the exact request, response and attempts | `GET /webhooks/{id}/deliveries/{delivery_id}` |
| Re-send one now | `POST /webhooks/{id}/deliveries/{delivery_id}/redeliver` |
| Re-send a time range | `POST /webhooks/{id}/replay` `{ "since": "…", "until": "…" }` (≤30 days, ≤1000 events per call; skips events the endpoint already got unless `only_undelivered: false`) |
| Browse stored events | `GET /events`, `GET /events/{id}` |

Events are stored while at least one of your endpoints (enabled or disabled) subscribes to them, so a
replay can cover the time an endpoint was switched off.

## Verifying signatures

Signatures follow [Standard Webhooks](https://www.standardwebhooks.com), so any of its libraries work.
The signed content is `"{webhook-id}.{webhook-timestamp}.{raw body}"`, signed with HMAC-SHA256 keyed with
the **base64-decoded part of your secret after `whsec_`**, then base64-encoded and prefixed with `v1,`.

- Verify the **raw** request body, before any JSON parsing.
- Reject timestamps more than 5 minutes from now.
- The header can carry several space-separated signatures (one per valid secret during a rotation).
  Accept the request if any of them matches.

### With the SDKs

```ts
import { verifyWebhook, WebhookVerificationError } from "@horusship/sdk";
import express from "express";

const app = express();

app.post("/horus", express.raw({ type: "application/json" }), (req, res) => {
  let event;
  try {
    // Typed: narrow on event.type (e.g. "sale.shipped" → event.data.sale)
    event = verifyWebhook(req.body, req.headers, process.env.HORUS_WEBHOOK_SECRET!);
  } catch (err) {
    if (err instanceof WebhookVerificationError) return res.sendStatus(400);
    throw err;
  }
  res.sendStatus(204);
  void handle(event); // dedupe on event.id
});
```

```python
from horus import Horus, WebhookVerificationError

client = Horus()

def horus_webhook(request):  # any framework: you need the raw body and the headers
    try:
        event = client.webhooks.verify(request.body, request.headers, os.environ["HORUS_WEBHOOK_SECRET"])
    except WebhookVerificationError:
        return Response(status=400)
    enqueue(event)  # typed model: event.type, event.data.sale...; dedupe on event.id
    return Response(status=204)
```

Both also accept a list of secrets (useful during a rotation) and the legacy v1 signature.

### With `standardwebhooks`

```ts
import { Webhook } from "standardwebhooks";
const wh = new Webhook(process.env.HORUS_WEBHOOK_SECRET!);
const event = wh.verify(rawBody, {
  "webhook-id": req.header("webhook-id")!,
  "webhook-timestamp": req.header("webhook-timestamp")!,
  "webhook-signature": req.header("webhook-signature")!,
});
```

### Without a dependency

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyHorus(secret: string, h: { id: string; timestamp: string; signature: string }, rawBody: string): boolean {
  const ts = Number(h.timestamp);
  if (!Number.isInteger(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${h.id}.${h.timestamp}.${rawBody}`).digest();
  return h.signature.split(" ").some((part) => {
    const [v, sig] = part.split(",");
    const got = Buffer.from(sig ?? "", "base64");
    return v === "v1" && got.length === expected.length && timingSafeEqual(got, expected);
  });
}
```

```python
import base64, hashlib, hmac, time

def verify_horus(secret: str, msg_id: str, timestamp: str, signature: str, raw_body: bytes) -> bool:
    if abs(time.time() - int(timestamp)) > 300:
        return False
    key = base64.b64decode(secret.removeprefix("whsec_"))
    signed = f"{msg_id}.{timestamp}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
    return any(part.startswith("v1,") and hmac.compare_digest(part[3:], expected)
               for part in signature.split(" "))
```

## Rotating the secret

`POST /webhooks/{id}/rotate_secret` `{ "overlap_hours": 24 }` returns the new secret. For the overlap window
(default 24 h, at most 7 days, `0` = immediately) every delivery is signed with both the new and the old
secret, so deploy the new one any time in that window and nothing is rejected.

## Endpoints created before webhooks v2

Older endpoints keep `payload_format: "v1"`: the old body `{ "id", "event", "data", "createdAt" }` and the old
`X-Horus-Signature: sha256=<hex HMAC-SHA256 of the body, keyed with the raw secret>` header, with the
Standard Webhooks headers added on top. Old event names were migrated (`order.placed` → `sale.purchased`,
`order.failed` → `sale.purchase_failed`, `sale.updated` → `sale.*`). Switch to the v2 body with
`PATCH /webhooks/{id}` `{ "payload_format": "v2" }` once your handler is updated.
