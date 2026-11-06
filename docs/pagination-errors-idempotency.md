# Pagination, errors, idempotency and rate limits

## Pagination

List endpoints are cursor-paginated and return newest first:

```json
{ "object": "list", "data": [ … ], "has_more": true, "next_cursor": "eyJ…" }
```

- `limit`: 1–100, default 25.
- `cursor`: pass the previous page's `next_cursor`. Stop when `has_more` is `false`.
- Filters are ordinary query parameters, for example `GET /sales?status=PURCHASED&sold_before=2026-11-04T00:00:00Z`,
  `GET /listings?status=FAILED&created_after=…`, `GET /listings?ids=a,b,c` (≤100 ids). Filter on the
  server instead of fetching everything.

```ts
// TypeScript SDK: iterate every page
for await (const listing of horus.listings.list({ status: "LISTED" })) { … }
```

```python
# Python SDK: list() returns the first page; iterating it walks every page
page = client.listings.list(status="LISTED", limit=100)
for listing in page:
    ...
```

```sh
# CLI: one page per call; pass --cursor <next_cursor> for the next
horus listings list --status LISTED --limit 100 --json
```

A few lists aren't paged because the source returns one ranked set: `GET /ebay_orders` (live from eBay),
`GET /sourcing/feed`, `GET /studio/templates`, `GET /event_types`, `GET /notifications` (last 7 days, at most
30). They return `has_more: false`.

## Errors

Every error has the same shape:

```json
{ "error": { "type": "conflict", "code": "listing_has_active_order",
             "message": "This listing has an order in flight.", "details": { … }, "request_id": "req_…" } }
```

| `type` | HTTP | What to do |
|---|---|---|
| `invalid_request` | 400 / 422 | Fix the request. `validation_failed` lists `details.issues[]` (`path`, `message`). |
| `authentication` | 401 | Fix the credential. See [Authentication](authentication.md). |
| `permission` | 403 | Usually `insufficient_scope` (`details.required`). |
| `not_found` | 404 | Wrong id, or it belongs to another user (you always get 404, never 403). |
| `conflict` | 409 | The object's state doesn't allow this right now (`sale_not_pending`, `job_running`, `account_in_use`…), or an idempotency conflict. |
| `rate_limited` | 429 | Wait `Retry-After` seconds. |
| `unavailable` | 503 | A dependency is down: `desktop_offline` (your Horus Desktop isn't running), `ebay_unavailable`, `ebay_upload_failed`… |
| `internal` | 500 | Our bug. Retry once and contact support with the `request_id`. |

Branch on `code`, which is stable. `message` is for people and may change. Every response carries a
`Request-Id` header, so include it when you contact support.

### Desktop jobs and `202`

Operations that run in a browser on your machine (sign-in, session checks, order scraping,
source-store returns, linking an order) return **202 Accepted** with a `job`:

```json
{ "object": "job", "id": "cm_job…", "kind": "VERIFY_SESSION", "status": "QUEUED", "account_id": "…", "result": null, "error": null, … }
```

Follow it with `GET /jobs/{id}` until `status` is `SUCCEEDED`, `FAILED` or `CANCELLED`, or subscribe to
the `job.succeeded` / `job.failed` webhooks. The SDKs poll for you: `await horus.jobs.wait(job)` in TypeScript, `client.jobs.wait(job, timeout=300)` in Python. If no Horus
Desktop is connected you get `503 desktop_offline` and nothing is queued.

## Idempotency

Every `POST`, `PATCH` and `DELETE` accepts an `Idempotency-Key` header (1–255 printable ASCII
characters). The first request with a key runs, and its response is stored for **24 hours**. Sending the
same key again:

- with the same body → you get the stored response (header `Idempotent-Replayed: true`) and nothing runs twice;
- with a different body → `409 idempotency_conflict`;
- while the first is still running → `409 idempotency_in_progress` (retry in a moment).

A 5xx response isn't stored, so retrying with the same key really retries.

Use one key per **intended action**, not per HTTP attempt. Make the key deterministic when you can, so
that a crashed and restarted script reuses it:

```sh
curl -X POST https://horusship.com/api/v1/sales/$SALE/ship \
  -H "Authorization: Bearer $HORUS_API_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: ship-$SALE-1Z999AA10123456784" \
  -d '{"tracking_number":"1Z999AA10123456784","carrier":"UPS"}'
```

The SDKs add a random key to every write and reuse it across their automatic retries. Pass your own
(`{ idempotencyKey: "…" }` in TypeScript, `idempotency_key="…"` in Python) to make it deterministic.

## Rate limits

Per credential, per minute: **600 reads** (GET) and **120 writes**. Every response has:

| Header | Meaning |
|---|---|
| `RateLimit-Limit` | Requests allowed in this window |
| `RateLimit-Remaining` | Left in this window |
| `RateLimit-Reset` | Seconds until the window resets |

Over the limit you get `429 rate_limited` with `Retry-After`. The SDKs wait and retry automatically.
For bulk work, use the bulk endpoints: `POST /listings` takes up to 2000 items, `POST /accounts/verify` and
`POST /accounts/sign_in` take many accounts, and `POST /leads/claim` takes many ids.
