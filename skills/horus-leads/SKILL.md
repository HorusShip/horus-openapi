---
name: horus-leads
description: Work through the Horus leads inbox, the products assigned to the operator each day to list on eBay. Use when the user says "do my leads", "list today's leads", "what leads do I have", "clear my leads", or gets a lead.assigned notification. Lists to-do leads, evaluates each one's margin, claims the good ones and lists them, and dismisses the rest with the user's approval.
---

# Working leads

Uses `horus-operator` conventions and the listing procedure from `horus-source-and-list`. Scopes:
`leads:write`, `listings:write`, `ebay:read`, `accounts:read`.

Leads are products picked for this operator. Call them "leads" and nothing else. Don't speculate
about where they come from.

## 1. Load the to-do list

`leads_list` `status=ASSIGNED` `limit=100` (page with `cursor` if `has_more`). CLI:
`horus leads list --status ASSIGNED --json`.

Each lead has `asin`, `amazon.{title, price, in_stock}`, `ebay.{title, price}`, `spread` (eBay price
− Amazon price), `image_url`, `assigned_at`.

## 2. Evaluate

For each lead, sort it into a bucket:

| Bucket | Rule (default, adjust to what the user says) |
|---|---|
| **List** | `asin` present, `amazon.in_stock` not false, and `listings_pricing_preview` `{ cost: amazon.price.amount }` gives `estimated_profit` ≥ $2 and ≥ 10% of the price |
| **Check** | Missing price or stock, a thin margin, or a brand that might be VeRO (`blacklist_check`) |
| **Dismiss** | No ASIN, out of stock, negative profit, or `blacklist_check` blocked |

`spread` is a quick first filter, but it ignores fees. Use the pricing preview for the decision.
Call the preview once per distinct price, not once per lead. Leads with the same price give the same preview.

Show the user a compact table: title, Amazon price, eBay price, estimated profit, bucket. Ask
which to list (the default is all of **List**).

## 3. Claim and list

1. `leads_claim` `{ ids: [...] }` → `{ asins }`. Claiming moves them to CLAIMED, is safe to repeat, and ignores
   unknown ids.
2. `listings_create` with those `asins` as `items`, into the user's listing group and eBay account(s)
   (see the preconditions in `horus-source-and-list`). Use the idempotency key
   `leads-<date>-<sha1 of sorted ids>`.
3. Watch for LISTED / FAILED as in `horus-source-and-list` and report the results.

If listing fails for a claimed lead, it stays CLAIMED. Note it in the report, and the user can
retry the listing (`listings_retry`).

## 4. Dismiss (with approval)

`leads_dismiss` per lead, only for leads the user agreed to drop. There is no "undismiss", so list
them first and get a yes.

## 5. Summary

"12 leads: listed 8 (all live), 2 failed (VeRO brand), dismissed 2 (out of stock)." Include the
estimated total profit of what was listed if you computed it.

## Automating

A webhook on `lead.assigned` (`horus-webhooks`) can trigger this skill. Keep a human in the loop
for the dismiss step unless the user explicitly asks for full auto-listing with fixed thresholds.
