---
name: horus-fulfillment
description: Handle the Horus sales lifecycle from eBay order to delivered. Use when a sale is stuck, pending, held, failed to purchase, source-cancelled, missing tracking or late to ship; when the user wants to fulfil an eBay order now, link an order they placed themselves, mark a sale shipped or add tracking, cancel a sale, or understand a sale's status. Tells you when to wait and when to act.
---

# Fulfillment

Uses `horus-operator` conventions. Scopes: `sales:write`, `accounts:read`, `desktop:read`
(`returns:write` for refunds, which are covered in `horus-returns-messages`).

**Money moves here.** Buying, cancelling and shipping are visible to buyers and eBay. Confirm every
write with the user, and use one `Idempotency-Key` per action (for example `ship-<sale_id>-<tracking>`).

## 1. Look before acting

`sales_get` `{ id }` (or find it with `sales_list` `q=<eBay order id, SKU or title>`). Read:
`status`, `fulfillment.{desktop_status, held, hold_reason, releasable, failures, last_failure_at}`,
`source.{order_id, account_id, purchased_at, cancelled_at}`, `tracking.*`, `source_orders[]`, `sold_at`.

Also check `desktop_status_get` if anything is pending or held.

## 2. Wait or act?

| State | Normal? | Action |
|---|---|---|
| PENDING, < 30 min old, not held | Yes. Checkout is queued or running. | Wait. |
| PENDING, `desktop_status` QUEUED / IN_PROGRESS for > 30 min | No | Check the desktop is online and its buyer account is signed in (`accounts_get` `source.account_id`). Fix those (`horus-account-health`). |
| PENDING, recent failures, not held | Often a price or stock retry. Horus retries for up to `settings.orders.auto_cancel_hours` and then cancels the eBay order. | Wait. **Don't buy it yourself while auto-retry is still running**, because you could end up with two source orders. |
| `held: true`, `releasable: true` | Held because the desktop was offline | Desktop online again? Horus releases it within about a minute. To do it now: `sales_release` (confirm: it starts a real purchase). Still offline → `503 desktop_offline`, so the user has to open the app. |
| `held: true`, `releasable: false` (`hold_not_releasable`) | Needs a person (payment challenge, account problem, price, address) | Read `hold_reason`, then §3. |
| `needs_manual_fulfillment` (`sales_list` filter) | Source cancelled the order, or checkout failed for good | §3. |
| PURCHASED, < 3 days | Yes | Wait. Tracking is polled and uploaded automatically. |
| PURCHASED, ≥ 3 days, no tracking | No. eBay late-shipment risk. | §4. |
| SHIPPED / DELIVERED / PAID | Yes | Nothing. |

## 3. Getting a stuck sale bought

Options, in order of preference. Explain them and let the user choose:

1. **Fix the cause and let Horus retry**: account signed out, card declined, proxy dead
   (`horus-account-health`). Then, if the sale is releasable, `sales_release`.
2. **The user buys it themselves**, then tells Horus:
   - Amazon order: `sales_linkSourceOrder` `{ source_order_id: "111-…", account_id? }` → 202 job. The
     desktop confirms the order and records its cost, and tracking then flows automatically.
     Non-Amazon ids fail with `422 invalid_source_order_id`.
   - Any store, with tracking in hand: `sales_ship` `{ tracking_number, carrier }` uploads it to eBay
     and marks the sale SHIPPED. Use the number the user wants buyers to see. Horus never puts raw
     Amazon tracking on eBay, so don't do it either unless the user insists.
3. **Fulfil an eBay order that has no sale yet**: `ebayOrders_list` (live from eBay, only orders whose
   listing Horus can fulfil) → `ebayOrders_fulfill` `{ account_id?, ebay_account_id? }` → 202
   `fulfillment` (`sale_id`, `queued`, `held`). This **buys at the source**, so confirm the item, price and account.
   `409 sale_exists` means Horus already has a sale for that order, so use options 1–2.
4. **Cancel**: `sales_cancel` cancels a **PENDING** sale and its eBay order (`ebay_order_cancelled`
   tells you whether eBay took it). Get explicit confirmation. A seller cancellation for "out of stock" can
   count against eBay seller standards. Only PENDING sales can be cancelled (`409 sale_not_pending`).

`sales_delete` `pending_only=true` (the app's "Remove") drops Horus's record without touching eBay,
so Horus stops retrying or auto-cancelling. Only use it when the user is fulfilling entirely outside
Horus. Plain `sales_delete` deletes any sale record. Avoid it.

## 4. Purchased but no tracking

1. `sourceOrders_list` `{ sale_id }`. If there's a matched source order, call `sourceOrders_refresh`
   `{ kind: "tracking" }` (202 job). New tracking uploads to eBay automatically for a PURCHASED sale.
2. No matched source order: `sourceOrders_scan` `{ account_id: sale.source.account_id }` (202) reads the
   account's order history and matches it. Then repeat step 1.
3. Still nothing after the job: the store hasn't shipped. If the user has tracking from elsewhere,
   use `sales_ship` with it. Otherwise tell them the order's status on the store (`sourceOrders_get` → `status`).
4. `sales_ship` without `tracking_number` only marks the sale shipped in Horus (no eBay upload).
   Use it only if the user already added tracking on eBay. `503 ebay_upload_failed` means eBay refused the
   number. It's stored, so check the carrier and number and retry, or reconnect the eBay account.

## 5. Source-cancelled sales

`sale.source_cancelled` / `source.cancelled_at` set → the sale goes back to PENDING and shows in
`needs_manual_fulfillment`. Re-buy (§3 option 2 or a fresh desktop checkout once the cause is fixed) or
cancel (§3 option 4). Unmatched or cancelled source orders: `sourceOrders_list` `cancelled=true` / `matched=false`.

## 6. Report

Per sale: what state it was in, what you did, the job ids, and what happens next ("tracking will
upload when Amazon ships; I'll check again tomorrow").

Events that let you skip polling: `sale.purchased`, `sale.purchase_failed`, `sale.held`,
`sale.shipped`, `sale.source_cancelled`, `sale.cancelled`, `job.succeeded`, `job.failed`.
