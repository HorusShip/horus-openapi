# Horus object model

Every object has `object` (its type) and `id`. Fields are snake_case. Money is
`{ amount, currency }`. Someone else's object is always a 404.

## The flow

```
 sourcing / leads ──► listing (PENDING → LISTED on eBay)
                          │  eBay buyer orders
                          ▼
                       sale (PENDING) ──► desktop checkout with a buyer account
                          │                  │
                          │                  ▼
                          │             source order (scraped from the store)
                          ▼
                 PURCHASED ──► tracking uploaded ──► SHIPPED ──► DELIVERED ──► PAID
                          │
                          └─► return (open → processing → completed / declined) → REFUNDED
```

## Accounts and setup

| Object | Key fields | Notes |
|---|---|---|
| `profile` (`account_get`) | `plan` (FREE/PAID), `identities` | `account_usage_get` has counts and the sourcing daily cap. |
| `account`, a buyer account | `platform`, `website`, `email`, `group_id`, `session_valid` (true / false / null = unchecked), `session_checked_at`, `is_prime`, `inbox_id`, `card` (last4 etc.), `proxy` | One per website + email. Lives in an account group. |
| `group` | `type` TASK (listing group) / ACCOUNT / PROXY, `website`, `item_count` | Listings are created into a listing group. A buyer-account group has one website. |
| `ebay_account` | `is_active`, `missing_scopes`, `onboarding_required` + `onboarding_url`, `health.{policies_ok, ship_from_ok, is_active, onboarding_required}`, `risk.level` ok/warn/danger, `policies`, `merchant_location_key` | Must be healthy to list and to upload tracking. |
| `inbox` | `connection_type` imap / gmail_api / outlook_graph, `active`, `oauth_expires_at` | Where Horus reads one-time codes for buyer-account sign-in and recovery. |
| `proxy` | `status` OK/FAILED/UNTESTED, `latency_ms` | Assigned per buyer account. |
| `desktop_status` | `paired`, `online`, `last_seen_at`, `version`, `engine_status`, `account_automation_ready`, `held_sale_count` | The single most important health signal. |
| `settings` | `listing.*` (markup, stock, refresh), `orders.*` (min ROI, auto-cancel, fees, tracking provider, fulfillment, password_reset), `returns.*`, `protection.*`, `notifications.*` | One document: `settings_get` / `settings_update` (send only changed fields). |

## Listings

`listing`: `status`, `title`, `price`, `cost`, `advantage_pct` (markup %), `source.{platform, item_id
(ASIN), url, account_id}`, `ebay.{account_id, listing_id, sku, url}`, `group_id`, `is_bundle`,
`items[]` (bundle parts with `in_stock`), `delisted_at`.

| Status | Meaning |
|---|---|
| `PENDING` | Queued; the worker scrapes the source and publishes to eBay (usually seconds to minutes; large batches longer). |
| `LISTED` | Live on eBay. |
| `FAILED` | Couldn't publish (VeRO/blacklisted brand, parent ASIN, price < $3, eBay policies/location/token, eBay rejection). Fix the cause, then `listings_retry`. |
| `DELISTED` | Ended (`listings_end`, out of stock, price monitor). `listings_relist` republishes. |
| `PURCHASED` / `SHIPPED` / `COMPLETED` | Mirror the sale on that listing. |
| `CANCELLED` | Cancelled before publishing; can be retried. |

A `listing_batch` (from `listings_create`) has `listings[]` (each PENDING) and `skipped[]`
(`invalid` input or `duplicate`, meaning it's already active on that eBay account).

## Sales

`sale`: `status`, `sold_at`, `ebay_order_id`, `buyer_username`, `sku`, `product_name`, `quantity`,
`amounts.{sale_price, product_cost, marketplace_fee, ad_fee, shipping_cost, profit,
estimated_profit, source_total…}`, `source.{platform, order_id, account_id, purchased_at,
cancelled_at}`, `fulfillment.{desktop_status, held, hold_reason, releasable, manually_fulfilled,
failures, last_failure_at}`, `tracking.{number, carrier, shipped_at, delivered}`,
`return.{status, requested_at, refunded_at}`, `funds_available_at`. `sales_get` adds `bundle` and
`source_orders[]`.

| Status | Meaning | Usual next step |
|---|---|---|
| `PENDING` | Not bought at the source yet. Normal for a few minutes. Also where source-cancelled and price-exceeded sales go back to while Horus retries. | Wait, unless `held` or `needs_manual_fulfillment`. |
| `PURCHASED` | Bought; waiting for the source's tracking. | Tracking normally arrives within 1–3 days and uploads itself. |
| `SHIPPED` | Tracking is on eBay. | Nothing. |
| `DELIVERED`, `PAID` | Done (PAID means eBay paid out and profit is final). | Nothing. |
| `CANCELLED` | eBay order cancelled. | Nothing. |
| `REFUNDED` | Buyer refunded. | Make sure the source refund happened too. |

`fulfillment.desktop_status`: `QUEUED` / `IN_PROGRESS` / `HELD` / `SUCCEEDED` / `FAILED` for desktop
checkout. `held: true` + `releasable: true` = held only because the desktop was offline.

## Source orders

`source_order`: `platform`, `source_order_id`, `status`, `cancelled`, `amounts`, `tracking.{number,
carrier, delivered}`, `sale` (the matched sale, or null = unmatched), `detailed`, `last_scraped_at`.
Unmatched orders (`matched=false`) are purchases Horus can't tie to a sale. They're worth a look.

## Returns and messages

`return`: `status` open / manual_review / processing / completed / declined, `sale_id`, `reason`,
`eligible_until` (last day to return at the source), `auto_skip_reason` (why auto-return didn't run),
`label_url`, `rma_code`, `refund_amount`.

`message_thread`: `other_party`, `subject`, `unread_count`, `is_vero`, `listing_id`. `message`: `direction`
inbound/outbound, `sender_type`, `body`, `read`, `replied`, `vero.{is_vero, brand, action}`.

## Sourcing and leads

`lead`: `status` ASSIGNED (to-do) / CLAIMED / DISMISSED, `asin`, `amazon.{title, price, in_stock}`,
`ebay.{title, price}`, `spread` (eBay price minus Amazon price).

`sourcing_candidate`: `status` NEW / LISTED / BLACKLISTED / IGNORED / CLAIMED, `ebay.*` (the eBay item that
was found), `source.*` (the matched product: platform, item_id = ASIN, price, prime, in_stock), `match.overall`
(0–1 similarity), `estimate.{profit, margin_pct, roi_pct}`, `vero_blocked`.

`sourcing_feed_item`: the shared feed with `saturation`, `claim_count`, `vero_risk`, `is_fresh`. The FREE plan
sees items older than 48 h and has `claims_remaining_today`.

## Jobs and events

`job`: `kind`, `status`, `account_id`, `result`, `error`, `attempts`. `event`: `type`, `created`, `data`
(the resource in the same shape the API returns). Events are stored for 30 days while a webhook
subscribes to them (`events_list`).
