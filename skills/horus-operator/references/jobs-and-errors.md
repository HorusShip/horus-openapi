# Desktop jobs, errors, idempotency, rate limits

## Operations that run on Horus Desktop (202)

| Operation | Job kind | Typical time |
|---|---|---|
| `accounts_verify`, `accounts_verifyBulk` | VERIFY_SESSION | 10–60 s |
| `accounts_signIn`, `accounts_signInBulk` | LOGIN | 1–3 min (Amazon, Walmart only) |
| `accounts_recover` | RECOVER_ACCOUNT | 1–5 min (Amazon only, needs email OTP) |
| `accounts_addCard` | ADD_CARD | 1–3 min (Walmart only) |
| `accounts_scrapeOrders`, `sourceOrders_scan` | SCRAPE_ORDER_LIST | 1–5 min |
| `accounts_scrapeOrder`, `sourceOrders_refresh` (`kind: detail`) | SCRAPE_ORDER_DETAIL | 30 s–2 min |
| `accounts_pollTracking`, `sourceOrders_refresh` (`kind: tracking`) | POLL_TRACKING | 30 s–2 min |
| `returns_initiate` | REFUND_ORDER | minutes; may end in a manual-return alert |
| `sales_linkSourceOrder` | LINK_AMAZON_ORDER | 30 s–2 min |
| `accounts_jobs_create` | any (advanced; prefer the named actions) | — |

Not job-shaped but asynchronous too:

- `listings_create`, `listings_retry`, `sourcing_feed_claimAndList`: 202, then poll the listings (`listings_list` with `ids=`).
- `ebayOrders_fulfill`: 202 with a `fulfillment`, so follow `sale_id` with `sales_get`. If the desktop is
  offline the sale is created **HELD** (no 503) and resumes when it reconnects.
- `sourcing_crawls_create`, `sourcing_candidates_create`, `sourcing_reverseSearches_create`: run on the
  desktop or extension. Watch with `sourcing_stats_get` or `sourcing_candidates_list`.
- `messages_sync`: background backfill from eBay. List the threads again after a few minutes.
- `webhooks_replay`: queues the deliveries.

Polling pattern (any surface):

```
job = <the 202 response>
repeat every 5–10 s, at most ~5 min:
    job = jobs_get(id=job.id)
    if job.status in (SUCCEEDED, FAILED, CANCELLED): break
```

Prefer events when a webhook is set up: `job.succeeded` / `job.failed` carry the job.

`desktop_offline` (503) means no Horus Desktop is connected for this user, so nothing was queued. Check
`desktop_status_get`. `online: false` means the user has to open the app (it can't be started remotely).
`account_automation_ready: false` while online means the app's browser engine is still starting or
updating (`engine_status`, `engine_detail`). Wait a minute.

## Error shape

```json
{ "error": { "type": "conflict", "code": "listing_has_active_order", "message": "…", "details": {…}, "request_id": "req_…" } }
```

`type` → HTTP: invalid_request 400/422, authentication 401, permission 403, not_found 404,
conflict 409, rate_limited 429, unavailable 503, internal 500.

## Codes you may see

Auth and permission: `missing_credentials`, `invalid_api_key`, `invalid_access_token`,
`account_not_linked` (the person never signed in to horusship.com), `discord_link_required` (no entitled
Discord on the account), `account_suspended`, `insufficient_scope` (`details.required`),
`interactive_session_required` (only a browser session can do this, e.g. API keys).

Input: `validation_failed` (`details.issues[]`), `invalid_idempotency_key`, `too_many_ids` (≤100),
`invalid_source_order_id`, `invalid_seller_username`, `unrecognized_platform`,
`platform_not_supported` (e.g. sign-in for Target/Best Buy/AliExpress: do it in the desktop app),
`website_required`, `group_website_mismatch`, `proxy_invalid`, `proxy_not_allowed`,
`confirmation_mismatch`, `card_missing`, `asset_too_large`, `asset_rejected`,
`tracktaco_api_key_required`.

State conflicts (409): `account_exists`, `account_in_use` (live listings depend on it),
`group_exists`, `group_in_use`, `inbox_exists`, `listing_has_active_order`, `listing_not_live`,
`sale_not_pending`, `sale_not_purchased`, `sale_not_held`, `hold_not_releasable`, `sale_exists`,
`sale_already_refunded`, `return_already_initiated`, `return_already_refunded`,
`recovery_in_progress`, `job_running`, `job_finished`, `ebay_account_has_active_items`,
`business_policies_not_eligible`, `daily_claim_limit`, `feed_item_not_matched`,
`cannot_reply_to_system_message`, `duplicate_webhook_type`, `idempotency_conflict`,
`idempotency_in_progress`.

Unavailable (503): `desktop_offline`, `ebay_unavailable`, `ebay_request_failed`,
`ebay_upload_failed` (tracking stored but eBay refused it), `ebay_rejected_label`, `reply_failed`,
`fulfillment_failed`, `oauth_not_configured`, `render_failed`.

Treat any other code by its `type` and show the user the `message`.

## Idempotency

- Header `Idempotency-Key: <1–255 printable ASCII>` on POST / PATCH / DELETE. The first response
  is stored for **24 h**. A repeat with the same key and the same body returns the stored response
  (header `Idempotent-Replayed: true`) without doing the work again.
- Same key, different body → `409 idempotency_conflict`. Concurrent duplicate → `409
  idempotency_in_progress`. Wait 2–5 s and retry with the same key.
- A 5xx response releases the key, so a retry with the same key really runs again.
- Use one key per **intended action**, not per HTTP attempt. Make keys deterministic when you can:
  `list-<batch-hash>`, `ship-<sale_id>-<tracking>`, `reply-<thread_id>-<sha of body>`.

## Rate limits

Per credential, fixed one-minute window: **600 reads/min**, **120 writes/min**. Each response has
`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` (seconds). A 429 has `Retry-After`. Wait that
long and resume. For bulk work, prefer the bulk operations (`accounts_verifyBulk`,
`accounts_signInBulk`, `listings_create` with up to 2000 items, `leads_claim` with many ids).
