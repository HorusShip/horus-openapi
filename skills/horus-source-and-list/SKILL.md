---
name: horus-source-and-list
description: Find profitable products and list them on eBay with Horus. Use when the user wants to list ASINs or Amazon URLs (one, a pasted batch, or a CSV), bulk list, list bundles, check what a product would sell for or earn, browse sourcing candidates or the community feed, crawl seed sellers, reverse-search a product, or see why listings failed and retry them.
---

# Sourcing → listing

Uses `horus-operator` conventions. Scopes: `listings:write`, `sourcing:write`, `ebay:read`,
`accounts:read`, `settings:read`. Listing throughput is the business metric, so batch generously
and keep failures visible.

## Preconditions (check once per session)

1. **Listing group**: `groups_listings_list`. Use the one the user names, or create one with
   `groups_listings_create` `{ name }` after asking.
2. **eBay account(s)**: `ebay_accounts_list`. Every target account needs `is_active`,
   `health.policies_ok` and `health.ship_from_ok`. If not, use `horus-account-health` first.
   Listing to an unhealthy account just produces FAILED listings.
3. **Buyer accounts** that will fulfil (optional `source_account_ids`): `accounts_list`
   `platform=AMAZON` with `session_valid=true`. Without them, sales on these listings can't
   auto-buy.
4. **Defaults**: `settings_get` → `settings.listing.markup_percent` (default markup) and the fee fields in its `orders` section.

## Evaluate before listing

- **Price and profit**: `listings_pricing_preview` `{ cost, advantage_pct?, ad_rate_pct? }` →
  eBay `price`, `estimated_profit`, `breakeven`. Use the source price as `cost`.
- **Input check**: `listings_validate` `{ items }`. Per-line parse, bundle detection, and whether a
  Studio template exists. Fix or drop lines with `error`.
- **Brand safety**: if you know the brand, `blacklist_check` `{ brands: [...] }`. `blocked: true`
  means it will fail (VeRO or the user's blacklist), so don't list it.
- Rules of thumb (say these out loud when you skip something): no parent/variation ASINs (they
  fail), nothing under $3, and avoid `vero_blocked` / `vero_risk` items.

## Create listings

`listings_create` with:

```json
{ "group_id": "…", "ebay_account_ids": ["…"], "items": ["B07ABC1234", "https://www.amazon.com/dp/B09XYZ5678", "B07ABC1234;2, B09XYZ5678;1"],
  "source": "AMAZON_US", "source_account_ids": ["…"], "advantage_pct": 70 }
```

- `items`: ASINs, Amazon product URLs, or bundles (`ASIN;qty, ASIN;qty`). Up to **2000 per call**, and up to
  20 eBay accounts per call. One listing is created per item per eBay account.
- Leave out `advantage_pct` to use the user's default. Leave out `studio_template_id` for the default
  template, or pass `null` for no Studio image.
- Confirm the batch first: how many items, which eBay accounts, and the markup.
- Send an `Idempotency-Key` derived from the batch (for example `list-<group>-<sha1 of sorted items>`) so a
  retried request doesn't double-list.
- CLI: `horus listings create` with the body fields as flags (`horus listings create --help`), or send
  the JSON body as-is with `horus api POST /listings --data '<json>'`.

The response is **202** `listing_batch`: `listings[]` (PENDING) and `skipped[]` with `reason`
`duplicate` (already active on that eBay account, which is fine) or `invalid` (show the `message`).

## Watch them land

- Poll `listings_list` with `ids=<up to 100 comma-separated>` every 30–60 s until each is `LISTED`
  or `FAILED`. Big batches take a while: the worker publishes steadily, and eBay rate-limits per account.
  Don't poll faster than every 30 s.
- With webhooks set up, `listing.created` (live) and `listing.failed` (with `error`) are better
  than polling.
- Report: N listed, M failed (grouped by reason), K skipped as duplicates.

## Failed listings

`listings_list` `status=FAILED` (narrow with `created_after`). The REST listing has **no failure
reason field**, so get it from the `listing.failed` event (`events_list` `type=listing.failed`,
`data.error`) or from `notifications_list` (kind `error`). Typical causes and fixes:

| Cause | Fix |
|---|---|
| VeRO / blacklisted brand | Don't retry. `blacklist_brands_list` shows the user's own list. |
| Parent (variation) ASIN | List a child ASIN instead. |
| Price under $3, product unavailable | Drop it. |
| eBay policies / location / token | `horus-account-health`, then `listings_retry`. |
| Temporary eBay or scrape error | `listings_retry` once. |

Retry only after the cause is fixed. Retry is per listing (`listings_retry`, 202).

## Sourcing (finding products)

- **My candidates**: `sourcing_candidates_list` `status=NEW` `sort=margin` (or `roi`)
  `min_margin_pct=…`. Each has `source.item_id` (the ASIN), `estimate.profit/margin_pct/roi_pct`,
  `match.overall` (prefer ≥ 0.8), and `vero_blocked`. To list: `listings_create` with the ASINs, then
  `sourcing_candidates_markListed`. To reject: `sourcing_candidates_blacklist`.
- **Community feed**: `sourcing_feed_list` (`sort=composite` is a good default, plus `max_saturation`,
  `prime_only`). FREE plan: items are 48 h old and `claims_remaining_today` limits claims
  (`409 daily_claim_limit`). `sourcing_feed_claimAndList` claims and lists in one call (202). Use
  `sourcing_feed_claim` to claim only, or `sourcing_feed_hide` to hide. Prefer low `saturation` and `claim_count`.
- **Crawl seed sellers**: `sourcing_seeds_list`, `sourcing_seeds_create` `{ seller_username }`,
  `sourcing_crawls_create` (202, runs on desktop or extension), progress via `sourcing_stats_get`.
- **One eBay item → source match**: `sourcing_candidates_create` (202). **One Amazon product → eBay
  sellers**: `sourcing_reverseSearches_create` `{ asin, image_url }`.
- **Thresholds**: `sourcing_config_get` / `sourcing_config_update` (min margin, match score, margin
  brackets). Change them only when asked.

For the margin math and a worked example, see [references/margin.md](references/margin.md).

## After listing

- Reprice: `listings_update` `{ price }` or `{ advantage_pct }`. This changes the live eBay price, so confirm first.
- End: `listings_end` (keeps the offer for `listings_relist`). Delete: `listings_delete` (ends on eBay
  and removes it; refused while an order is in flight). Both need confirmation.
- Non-Amazon products (Walmart, Target, Best Buy, AliExpress): `listings_prescans_create` `{ url }`
  checks the product (title, price, stock). `listings_create` only takes Amazon ASINs and URLs today,
  so list those from the Horus app.
