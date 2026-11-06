# Horus operations

Generated from the OpenAPI document (version 2026-11-06, 176 operations) by
`skills/scripts/generate-references.mjs`. Do not edit by hand.

Columns: **MCP tool** (call it directly), **CLI** (`horus <words> --json`), **HTTP**, **scopes**,
**async**: `202` = returns a job / batch to follow; `desktop` = needs Horus Desktop online (`503 desktop_offline`).

## Profile and usage

| MCP tool | CLI | HTTP | Scopes | Async | Summary |
|---|---|---|---|---|---|
| `account_get` | `account get` | `GET /account` | account:read |  | Your Horus profile and plan |
| `account_delete` | `account delete` | `DELETE /account` | account:write |  | Permanently delete your Horus account and everything in it |
| `account_usage_get` | `account usage get` | `GET /account/usage` | account:read |  | Usage counters and quotas |

## Desktop jobs

| MCP tool | CLI | HTTP | Scopes | Async | Summary |
|---|---|---|---|---|---|
| `jobs_list` | `jobs list` | `GET /jobs` | accounts:read |  | List desktop jobs |
| `jobs_get` | `jobs get` | `GET /jobs/{id}` | accounts:read |  | Get a job's status and result |
| `jobs_cancel` | `jobs cancel` | `POST /jobs/{id}/cancel` | accounts:write |  | Cancel a job that hasn't started |

## Buyer accounts

| MCP tool | CLI | HTTP | Scopes | Async | Summary |
|---|---|---|---|---|---|
| `accounts_verify` | `accounts verify` | `POST /accounts/{id}/verify` | accounts:write | 202, desktop | Check whether the account is still signed in |
| `accounts_signIn` | `accounts sign-in` | `POST /accounts/{id}/sign_in` | accounts:write | 202, desktop | Sign the account in on your desktop |
| `accounts_recover` | `accounts recover` | `POST /accounts/{id}/recover` | accounts:write | 202, desktop | Clear Amazon's forced password reset |
| `accounts_addCard` | `accounts add-card` | `POST /accounts/{id}/add_card` | accounts:write | 202, desktop | Add the saved card to the retailer account |
| `accounts_scrapeOrders` | `accounts scrape-orders` | `POST /accounts/{id}/scrape_orders` | accounts:write | 202, desktop | Read the account's order history |
| `accounts_scrapeOrder` | `accounts scrape-order` | `POST /accounts/{id}/scrape_order` | accounts:write | 202, desktop | Read one order's full detail (items, totals, ship-to, tracking) |
| `accounts_pollTracking` | `accounts poll-tracking` | `POST /accounts/{id}/poll_tracking` | accounts:write | 202, desktop | Re-read an order's tracking number, carrier and ETA |
| `accounts_verifyBulk` | `accounts verify-bulk` | `POST /accounts/verify` | accounts:write | 202, desktop | Verify many accounts' sessions at once |
| `accounts_signInBulk` | `accounts sign-in-bulk` | `POST /accounts/sign_in` | accounts:write | 202, desktop | Sign many accounts in at once |
| `accounts_jobs_create` | `accounts jobs create` | `POST /accounts/{id}/jobs` | accounts:write | 202, desktop | Queue a raw job on the account (advanced) |
| `accounts_list` | `accounts list` | `GET /accounts` | accounts:read |  | List buyer accounts |
| `accounts_create` | `accounts create` | `POST /accounts` | accounts:write |  | Add a buyer account |
| `accounts_get` | `accounts get` | `GET /accounts/{id}` | accounts:read |  | Get a buyer account |
| `accounts_update` | `accounts update` | `PATCH /accounts/{id}` | accounts:write |  | Update a buyer account |
| `accounts_delete` | `accounts delete` | `DELETE /accounts/{id}` | accounts:write |  | Delete a buyer account |
| `accounts_bulkCreate` | `accounts bulk-create` | `POST /accounts/bulk` | accounts:write |  | Add up to 500 buyer accounts to one group |
| `accounts_card_update` | `accounts card update` | `PUT /accounts/{id}/card` | accounts:write |  | Save the account's checkout card |
| `accounts_card_delete` | `accounts card delete` | `DELETE /accounts/{id}/card` | accounts:write |  | Remove the account's saved card |

## Analytics

| MCP tool | CLI | HTTP | Scopes | Async | Summary |
|---|---|---|---|---|---|
| `analytics_dashboard` | `analytics dashboard` | `GET /analytics/dashboard` | analytics:read |  | Dashboard totals and daily charts |
| `analytics_skuProfit` | `analytics sku-profit` | `GET /analytics/sku_profit` | analytics:read |  | Profit per SKU over the last N days |
| `analytics_traffic` | `analytics traffic` | `GET /analytics/traffic` | analytics:read |  | eBay listing traffic (impressions, CTR, conversion) with Horus profit |

## Brand blacklist / VeRO

| MCP tool | CLI | HTTP | Scopes | Async | Summary |
|---|---|---|---|---|---|
| `blacklist_brands_list` | `blacklist brands list` | `GET /blacklist/brands` | listings:read |  | List blacklisted brands |
| `blacklist_brands_create` | `blacklist brands create` | `POST /blacklist/brands` | listings:write |  | Blacklist a brand (idempotent; re-adding updates the notes) |
| `blacklist_brands_delete` | `blacklist brands delete` | `DELETE /blacklist/brands/{id}` | listings:write |  | Remove a brand from the blacklist |
| `blacklist_check` | `blacklist check` | `POST /blacklist/check` | listings:read |  | Would a product with these brand names be blocked at listing time? |
| `blacklist_settings_get` | `blacklist settings get` | `GET /blacklist/settings` | settings:read |  | VeRO protection settings |
| `blacklist_settings_update` | `blacklist settings update` | `PATCH /blacklist/settings` | settings:write |  | Update VeRO protection settings |

## Horus Desktop

| MCP tool | CLI | HTTP | Scopes | Async | Summary |
|---|---|---|---|---|---|
| `desktop_status_get` | `desktop status get` | `GET /desktop/status` | desktop:read |  | Is your Horus Desktop paired and online? |
| `desktop_devices_list` | `desktop devices list` | `GET /desktop/devices` | desktop:read |  | List paired desktop installs |
| `desktop_devices_revoke` | `desktop devices revoke` | `POST /desktop/devices/{id}/revoke` | desktop:write |  | Unpair a desktop install |
| `desktop_devices_revokeAll` | `desktop devices revoke-all` | `POST /desktop/devices/revoke_all` | desktop:write |  | Unpair every desktop install |
| `desktop_instances_list` | `desktop instances list` | `GET /desktop/instances` | desktop:read |  | List the machines your desktop runs on |
| `desktop_instances_get` | `desktop instances get` | `GET /desktop/instances/{id}` | desktop:read |  | Get a desktop machine |

## eBay seller accounts

| MCP tool | CLI | HTTP | Scopes | Async | Summary |
|---|---|---|---|---|---|
| `ebay_policies_list` | `ebay policies list` | `GET /ebay/accounts/{id}/policies` | ebay:read |  | Business policies on the eBay account (live) |
| `ebay_campaigns_list` | `ebay campaigns list` | `GET /ebay/accounts/{id}/campaigns` | ebay:read |  | Running Promoted Listings campaigns (live) |
| `ebay_locations_list` | `ebay locations list` | `GET /ebay/accounts/{id}/locations` | ebay:read |  | Inventory (ship-from) locations on the eBay account (live) |
| `ebay_locations_create` | `ebay locations create` | `POST /ebay/accounts/{id}/locations` | ebay:write |  | Create a ship-from location and make it the account's default |
| `ebay_locations_cleanup` | `ebay locations cleanup` | `POST /ebay/accounts/{id}/locations/cleanup` | ebay:write |  | Delete Horus's auto-created placeholder locations |
| `ebay_accounts_cleanupOrphanListings` | `ebay accounts cleanup-orphan-listings` | `POST /ebay/accounts/{id}/orphan_listings/cleanup` | ebay:write |  | Find (and optionally end) eBay listings Horus doesn't track |
| `ebay_accounts_list` | `ebay accounts list` | `GET /ebay/accounts` | ebay:read |  | List connected eBay seller accounts |
| `ebay_accounts_get` | `ebay accounts get` | `GET /ebay/accounts/{id}` | ebay:read |  | Get an eBay seller account (settings, health, seller-standards risk) |
| `ebay_accounts_update` | `ebay accounts update` | `PATCH /ebay/accounts/{id}` | ebay:write |  | Update an eBay account's listing defaults |
| `ebay_accounts_delete` | `ebay accounts delete` | `DELETE /ebay/accounts/{id}` | ebay:write |  | Disconnect an eBay account |
| `ebay_accounts_connect` | `ebay accounts connect` | `POST /ebay/accounts/connect` | ebay:write |  | Start connecting (or re-authorising) an eBay seller account |
| `ebay_accounts_clearOnboarding` | `ebay accounts clear-onboarding` | `POST /ebay/accounts/{id}/clear_onboarding` | ebay:write |  | Mark eBay seller onboarding as finished |
| `ebay_metrics_list` | `ebay metrics list` | `GET /ebay/accounts/{id}/metrics` | ebay:read |  | Seller-standards history (daily snapshots, newest first) |

## eBay orders (manual fulfilment)

| MCP tool | CLI | HTTP | Scopes | Async | Summary |
|---|---|---|---|---|---|
| `ebayOrders_list` | `ebay-orders list` | `GET /ebay_orders` | sales:read |  | List eBay orders awaiting fulfilment |
| `ebayOrders_fulfill` | `ebay-orders fulfill` | `POST /ebay_orders/{id}/fulfill` | sales:write | 202, desktop | Fulfil an eBay order now (source checkout on the desktop) |

## Groups

| MCP tool | CLI | HTTP | Scopes | Async | Summary |
|---|---|---|---|---|---|
| `groups_accounts_list` | `groups accounts list` | `GET /groups/accounts` | accounts:read |  | List buyer-account groups |
| `groups_accounts_create` | `groups accounts create` | `POST /groups/accounts` | accounts:write |  | Create a buyer-account group |
| `groups_accounts_get` | `groups accounts get` | `GET /groups/accounts/{id}` | accounts:read |  | Get a buyer-account group |
| `groups_accounts_update` | `groups accounts update` | `PATCH /groups/accounts/{id}` | accounts:write |  | Rename a buyer-account group |
| `groups_accounts_delete` | `groups accounts delete` | `DELETE /groups/accounts/{id}` | accounts:write |  | Delete a buyer-account group |
| `groups_proxies_list` | `groups proxies list` | `GET /groups/proxies` | proxies:read |  | List proxy groups |
| `groups_proxies_create` | `groups proxies create` | `POST /groups/proxies` | proxies:write |  | Create a proxy group |
| `groups_proxies_get` | `groups proxies get` | `GET /groups/proxies/{id}` | proxies:read |  | Get a proxy group |
| `groups_proxies_update` | `groups proxies update` | `PATCH /groups/proxies/{id}` | proxies:write |  | Rename a proxy group |
| `groups_proxies_delete` | `groups proxies delete` | `DELETE /groups/proxies/{id}` | proxies:write |  | Delete a proxy group |
| `groups_listings_list` | `groups listings list` | `GET /groups/listings` | listings:read |  | List listing groups |
| `groups_listings_create` | `groups listings create` | `POST /groups/listings` | listings:write |  | Create a listing group |
| `groups_listings_get` | `groups listings get` | `GET /groups/listings/{id}` | listings:read |  | Get a listing group |
| `groups_listings_update` | `groups listings update` | `PATCH /groups/listings/{id}` | listings:write |  | Rename a listing group |
| `groups_listings_delete` | `groups listings delete` | `DELETE /groups/listings/{id}` | listings:write |  | Delete a listing group |

## OTP inboxes

| MCP tool | CLI | HTTP | Scopes | Async | Summary |
|---|---|---|---|---|---|
| `inboxes_list` | `inboxes list` | `GET /inboxes` | inboxes:read |  | List OTP inboxes |
| `inboxes_create` | `inboxes create` | `POST /inboxes` | inboxes:write |  | Add an IMAP inbox (app password) |
| `inboxes_get` | `inboxes get` | `GET /inboxes/{id}` | inboxes:read |  | Get an OTP inbox |
| `inboxes_update` | `inboxes update` | `PATCH /inboxes/{id}` | inboxes:write |  | Update an OTP inbox (label, IMAP host, pause/resume, new app password) |
| `inboxes_delete` | `inboxes delete` | `DELETE /inboxes/{id}` | inboxes:write |  | Delete an OTP inbox |
| `inboxes_oauth_start` | `inboxes oauth start` | `POST /inboxes/oauth` | inboxes:write |  | Start connecting a Gmail or Outlook inbox with OAuth |

## Leads

| MCP tool | CLI | HTTP | Scopes | Async | Summary |
|---|---|---|---|---|---|
| `leads_list` | `leads list` | `GET /leads` | leads:read |  | List my leads |
| `leads_get` | `leads get` | `GET /leads/{id}` | leads:read |  | Get a lead |
| `leads_claim` | `leads claim` | `POST /leads/claim` | leads:write |  | Claim leads to list them |
| `leads_dismiss` | `leads dismiss` | `POST /leads/{id}/dismiss` | leads:write |  | Dismiss a lead |

## Listings

| MCP tool | CLI | HTTP | Scopes | Async | Summary |
|---|---|---|---|---|---|
| `listings_list` | `listings list` | `GET /listings` | listings:read |  | List listings |
| `listings_create` | `listings create` | `POST /listings` | listings:write | 202 | Create listings from ASINs, Amazon URLs or bundles |
| `listings_get` | `listings get` | `GET /listings/{id}` | listings:read |  | Get a listing |
| `listings_update` | `listings update` | `PATCH /listings/{id}` | listings:write |  | Reprice a live listing (new price or new markup) on eBay |
| `listings_delete` | `listings delete` | `DELETE /listings/{id}` | listings:write |  | Delete a listing (ends it on eBay first) |
| `listings_validate` | `listings validate` | `POST /listings/validate` | listings:read |  | Dry-run listing input (per-line parse and Studio template availability) |
| `listings_pricing_preview` | `listings pricing preview` | `POST /listings/pricing/preview` | listings:read |  | Preview the eBay price for a source cost and markup, using the user's fee and ad settings |
| `listings_end` | `listings end` | `POST /listings/{id}/end` | listings:write |  | End (withdraw) a live eBay listing; the offer is kept so it can be relisted |
| `listings_relist` | `listings relist` | `POST /listings/{id}/relist` | listings:write |  | Relist an ended (or failed) listing by republishing its eBay offer |
| `listings_retry` | `listings retry` | `POST /listings/{id}/retry` | listings:write | 202 | Re-queue a FAILED or CANCELLED listing |
| `listings_bulkDelete` | `listings bulk-delete` | `POST /listings/bulk-delete` | listings:write |  | Delete every listing in a group (each is ended on eBay first) |
| `listings_prescans_create` | `listings prescans create` | `POST /listings/prescans` | listings:write |  | Pre-scan a Walmart / Target / Best Buy / AliExpress product page |
| `listings_prescans_get` | `listings prescans get` | `GET /listings/prescans/{platform}/{source_item_id}` | listings:read |  | Get a pre-scanned product (status `pending` until the scrape lands) |

## Credential

| MCP tool | CLI | HTTP | Scopes | Async | Summary |
|---|---|---|---|---|---|
| `me_get` | `me get` | `GET /me` | any |  | The authenticated user and the credential's scopes |

## Buyer messages

| MCP tool | CLI | HTTP | Scopes | Async | Summary |
|---|---|---|---|---|---|
| `messages_threads_list` | `messages threads list` | `GET /messages/threads` | messages:read |  | List message threads |
| `messages_threads_get` | `messages threads get` | `GET /messages/threads/{id}` | messages:read |  | Get a thread's messages |
| `messages_threads_reply` | `messages threads reply` | `POST /messages/threads/{id}/reply` | messages:write |  | Reply to the buyer in a thread |
| `messages_threads_markRead` | `messages threads mark-read` | `POST /messages/threads/{id}/mark_read` | messages:write |  | Mark every message in a thread read |
| `messages_list` | `messages list` | `GET /messages` | messages:read |  | List messages |
| `messages_get` | `messages get` | `GET /messages/{id}` | messages:read |  | Get a message |
| `messages_markRead` | `messages mark-read` | `POST /messages/{id}/mark_read` | messages:write |  | Mark a message read |
| `messages_sync` | `messages sync` | `POST /messages/sync` | messages:write | 202 | Pull message history from eBay |

## Notifications

| MCP tool | CLI | HTTP | Scopes | Async | Summary |
|---|---|---|---|---|---|
| `notifications_list` | `notifications list` | `GET /notifications` | account:read |  | The notification feed (last 7 days, newest first, at most 30) |

## Proxies

| MCP tool | CLI | HTTP | Scopes | Async | Summary |
|---|---|---|---|---|---|
| `proxies_list` | `proxies list` | `GET /proxies` | proxies:read |  | List proxies |
| `proxies_create` | `proxies create` | `POST /proxies` | proxies:write |  | Add proxies to a proxy group (up to 1000) |
| `proxies_get` | `proxies get` | `GET /proxies/{id}` | proxies:read |  | Get a proxy |
| `proxies_update` | `proxies update` | `PATCH /proxies/{id}` | proxies:write |  | Update a proxy |
| `proxies_delete` | `proxies delete` | `DELETE /proxies/{id}` | proxies:write |  | Delete a proxy |
| `proxies_bulkDelete` | `proxies bulk-delete` | `POST /proxies/bulk_delete` | proxies:write |  | Delete many proxies (by id and/or every proxy in a group) |
| `proxies_test` | `proxies test` | `POST /proxies/{id}/test` | proxies:write |  | Probe a proxy (one request through it, 10 s timeout) |

## Returns

| MCP tool | CLI | HTTP | Scopes | Async | Summary |
|---|---|---|---|---|---|
| `returns_list` | `returns list` | `GET /returns` | returns:read |  | List returns |
| `returns_get` | `returns get` | `GET /returns/{id}` | returns:read |  | Get a return |
| `returns_initiate` | `returns initiate` | `POST /returns/{id}/initiate` | returns:write | 202, desktop | Start the refund on the source store (runs on the desktop) |
| `returns_decline` | `returns decline` | `POST /returns/{id}/decline` | returns:write |  | Decline the return on Horus's side |
| `returns_resendLabel` | `returns resend-label` | `POST /returns/{id}/resend_label` | returns:write |  | Upload the return label to the eBay return case again |

## Sales

| MCP tool | CLI | HTTP | Scopes | Async | Summary |
|---|---|---|---|---|---|
| `sales_list` | `sales list` | `GET /sales` | sales:read |  | List sales |
| `sales_get` | `sales get` | `GET /sales/{id}` | sales:read |  | Get a sale with costs, profit, fulfilment, tracking and return state |
| `sales_delete` | `sales delete` | `DELETE /sales/{id}` | sales:write |  | Delete a sale record (the eBay order is not touched) |
| `sales_ship` | `sales ship` | `POST /sales/{id}/ship` | sales:write |  | Mark a purchased sale shipped, optionally uploading tracking to eBay |
| `sales_cancel` | `sales cancel` | `POST /sales/{id}/cancel` | sales:write |  | Cancel a PENDING sale and its eBay order |
| `sales_markRefunded` | `sales mark-refunded` | `POST /sales/{id}/mark_refunded` | returns:write |  | Record that the source order was refunded (out of band) |
| `sales_linkSourceOrder` | `sales link-source-order` | `POST /sales/{id}/link_source_order` | sales:write | 202, desktop | Link a source order you placed yourself to this sale |
| `sales_release` | `sales release` | `POST /sales/{id}/release` | sales:write | desktop | Re-queue a sale HELD while the desktop was offline |

## Settings

| MCP tool | CLI | HTTP | Scopes | Async | Summary |
|---|---|---|---|---|---|
| `settings_get` | `settings get` | `GET /settings` | settings:read |  | All app settings |
| `settings_update` | `settings update` | `PATCH /settings` | settings:write |  | Change settings |

## Source orders

| MCP tool | CLI | HTTP | Scopes | Async | Summary |
|---|---|---|---|---|---|
| `sourceOrders_list` | `source-orders list` | `GET /source_orders` | sales:read |  | List scraped source-store orders |
| `sourceOrders_get` | `source-orders get` | `GET /source_orders/{id}` | sales:read |  | Get a source order with items and ship-to |
| `sourceOrders_refresh` | `source-orders refresh` | `POST /source_orders/{id}/refresh` | sales:write | 202, desktop | Re-scrape one source order (detail, or just tracking) |
| `sourceOrders_scan` | `source-orders scan` | `POST /source_orders/scan` | sales:write | 202, desktop | Scan a buyer account's order history |

## Sourcing

| MCP tool | CLI | HTTP | Scopes | Async | Summary |
|---|---|---|---|---|---|
| `sourcing_crawls_create` | `sourcing crawls create` | `POST /sourcing/crawls` | sourcing:write | 202 | Crawl my seed sellers now (top 20 by priority) |
| `sourcing_stats_get` | `sourcing stats get` | `GET /sourcing/stats` | sourcing:read |  | Crawl queue, totals and last-24h activity |
| `sourcing_queue_get` | `sourcing queue get` | `GET /sourcing/queue` | sourcing:read |  | Community pipeline backlog and my auto-sourcing switch |
| `sourcing_seeds_list` | `sourcing seeds list` | `GET /sourcing/seeds` | sourcing:read |  | List my seed sellers |
| `sourcing_seeds_create` | `sourcing seeds create` | `POST /sourcing/seeds` | sourcing:write |  | Add a seed seller (checked against eBay; idempotent) |
| `sourcing_seeds_delete` | `sourcing seeds delete` | `DELETE /sourcing/seeds/{id}` | sourcing:write |  | Remove a seed seller |
| `sourcing_seeds_donate` | `sourcing seeds donate` | `POST /sourcing/seeds/{id}/donate` | sourcing:write |  | Share a seed seller with the community pool |
| `sourcing_candidates_list` | `sourcing candidates list` | `GET /sourcing/candidates` | sourcing:read |  | List my sourcing candidates |
| `sourcing_candidates_create` | `sourcing candidates create` | `POST /sourcing/candidates` | sourcing:write | 202 | Submit an eBay item as a candidate; Horus finds its source product and profit |
| `sourcing_candidates_get` | `sourcing candidates get` | `GET /sourcing/candidates/{id}` | sourcing:read |  | Get a sourcing candidate |
| `sourcing_candidates_blacklist` | `sourcing candidates blacklist` | `POST /sourcing/candidates/{id}/blacklist` | sourcing:write |  | Blacklist a candidate |
| `sourcing_candidates_markListed` | `sourcing candidates mark-listed` | `POST /sourcing/candidates/{id}/mark-listed` | sourcing:write |  | Mark a candidate as listed (list it with `listings.create`) |
| `sourcing_reverseSearches_create` | `sourcing reverse-searches create` | `POST /sourcing/reverse-searches` | sourcing:write | 202 | Find eBay sellers of an Amazon product (reverse image search) |
| `sourcing_feed_list` | `sourcing feed list` | `GET /sourcing/feed` | sourcing:read |  | The community sourcing feed (minus what I already claimed or hid) |
| `sourcing_feed_claim` | `sourcing feed claim` | `POST /sourcing/feed/{id}/claim` | sourcing:write |  | Claim a feed item into my candidates |
| `sourcing_feed_hide` | `sourcing feed hide` | `POST /sourcing/feed/{id}/hide` | sourcing:write |  | Hide a feed item from my feed |
| `sourcing_feed_claimAndList` | `sourcing feed claim-and-list` | `POST /sourcing/feed/{id}/claim-and-list` | sourcing:write, listings:write | 202 | Claim a feed item and list its Amazon product in one call |
| `sourcing_config_get` | `sourcing config get` | `GET /sourcing/config` | sourcing:read |  | My sourcing config (incl. margin brackets and badge templates) |
| `sourcing_config_update` | `sourcing config update` | `PATCH /sourcing/config` | sourcing:write |  | Update my sourcing config |
| `sourcing_badges_render` | `sourcing badges render` | `POST /sourcing/badges/render` | sourcing:read |  | Render badges over a product image (preview) |

## Studio (listing images)

| MCP tool | CLI | HTTP | Scopes | Async | Summary |
|---|---|---|---|---|---|
| `studio_templates_list` | `studio templates list` | `GET /studio/templates` | studio:read |  | List Studio templates (default first) |
| `studio_templates_create` | `studio templates create` | `POST /studio/templates` | studio:write |  | Create a Studio template (the first one becomes the default) |
| `studio_templates_get` | `studio templates get` | `GET /studio/templates/{id}` | studio:read |  | Get a Studio template |
| `studio_templates_update` | `studio templates update` | `PATCH /studio/templates/{id}` | studio:write |  | Update a Studio template (a new layout re-renders the thumbnail) |
| `studio_templates_delete` | `studio templates delete` | `DELETE /studio/templates/{id}` | studio:write |  | Delete a Studio template |
| `studio_templates_setDefault` | `studio templates set-default` | `POST /studio/templates/{id}/set-default` | studio:write |  | Make this the default template for new listings |
| `studio_templates_preview` | `studio templates preview` | `POST /studio/templates/{id}/preview` | studio:write |  | Render the template over sample product images |
| `studio_badges_list` | `studio badges list` | `GET /studio/badges` | studio:read |  | The built-in badge library (use `id` as a badge layer's badgeId) |
| `studio_assets_list` | `studio assets list` | `GET /studio/assets` | studio:read |  | List uploaded Studio assets |
| `studio_assets_create` | `studio assets create` | `POST /studio/assets` | studio:write |  | Upload a Studio asset (PNG / JPEG / WebP max 2048×2048, or SVG) |
| `studio_assets_delete` | `studio assets delete` | `DELETE /studio/assets/{id}` | studio:write |  | Delete a Studio asset |
| `studio_sampleListings_list` | `studio sample-listings list` | `GET /studio/sample-listings` | studio:read |  | Recent listings to preview templates against (generic samples when there are none) |

## Webhooks

| MCP tool | CLI | HTTP | Scopes | Async | Summary |
|---|---|---|---|---|---|
| `webhooks_list` | `webhooks list` | `GET /webhooks` | webhooks:read |  | List webhook endpoints |
| `webhooks_create` | `webhooks create` | `POST /webhooks` | webhooks:write |  | Create a webhook endpoint |
| `webhooks_get` | `webhooks get` | `GET /webhooks/{id}` | webhooks:read |  | Get a webhook endpoint |
| `webhooks_update` | `webhooks update` | `PATCH /webhooks/{id}` | webhooks:write |  | Update a webhook endpoint |
| `webhooks_delete` | `webhooks delete` | `DELETE /webhooks/{id}` | webhooks:write |  | Delete a webhook endpoint (and its delivery log) |
| `webhooks_enable` | `webhooks enable` | `POST /webhooks/{id}/enable` | webhooks:write |  | Re-enable a disabled or auto-disabled endpoint |
| `webhooks_secret_get` | `webhooks secret get` | `GET /webhooks/{id}/secret` | webhooks:write |  | Reveal the endpoint's signing secret |
| `webhooks_rotateSecret` | `webhooks rotate-secret` | `POST /webhooks/{id}/rotate_secret` | webhooks:write |  | Rotate the signing secret |
| `webhooks_test` | `webhooks test` | `POST /webhooks/{id}/test` | webhooks:write |  | Send a `webhook.test` event now |
| `webhooks_replay` | `webhooks replay` | `POST /webhooks/{id}/replay` | webhooks:write | 202 | Re-send stored events from a time range |
| `webhooks_deliveries_list` | `webhooks deliveries list` | `GET /webhooks/{id}/deliveries` | webhooks:read |  | List an endpoint's deliveries (newest first) |
| `webhooks_deliveries_get` | `webhooks deliveries get` | `GET /webhooks/{id}/deliveries/{delivery_id}` | webhooks:read |  | Get a delivery with its request, response and attempts |
| `webhooks_deliveries_redeliver` | `webhooks deliveries redeliver` | `POST /webhooks/{id}/deliveries/{delivery_id}/redeliver` | webhooks:write |  | Re-send a delivery's event now |

## Events

| MCP tool | CLI | HTTP | Scopes | Async | Summary |
|---|---|---|---|---|---|
| `events_list` | `events list` | `GET /events` | webhooks:read |  | List stored events (last 30 days, newest first) |
| `events_get` | `events get` | `GET /events/{id}` | webhooks:read |  | Get a stored event |

## Event types

| MCP tool | CLI | HTTP | Scopes | Async | Summary |
|---|---|---|---|---|---|
| `eventTypes_list` | `event-types list` | `GET /event_types` | webhooks:read |  | List every webhook event type |
