---
name: horus-daily-checkin
description: Run a routine health check of a Horus store and produce a prioritized to-do list. Use when the user asks "how's my store", "anything I need to do", "morning check", "daily summary", "is everything running", or wants a scheduled check-in. Checks Horus Desktop, buyer-account sessions, eBay accounts, held/failed/stuck sales, purchases waiting for tracking, returns, unread buyer messages, failed or out-of-stock listings, leads and today's numbers, then offers fixes.
---

# Horus daily check-in

Read-only until the user picks fixes. Needs the `horus-operator` conventions (tool names, jobs,
errors). Best with read scopes on `account accounts ebay listings sales returns messages leads
analytics desktop`. If one is missing, skip that section and say so in the report instead of failing.

Work out `since` = 24 h ago (or the time of the last check-in if the user gives it) and `now`, as ISO-8601 UTC.

## Procedure

Run the reads below. Most are independent, so run them in parallel when you can. Use `limit=100` and
filters, and don't page beyond what you need for counts (if `has_more` is true, say "100+").

1. **Credential**: `me_get`. Note the scopes for the "skipped" list.
2. **Desktop**: `desktop_status_get` → `paired`, `online`, `last_seen_at`, `version`,
   `account_automation_ready`, `engine_status`, `held_sale_count`.
3. **Buyer accounts**: `accounts_list` with `session_valid=false`. Also scan an unfiltered
   page for `session_valid: null` (never checked) and `session_checked_at` older than 3 days.
4. **eBay accounts**: `ebay_accounts_list`. Flag `is_active: false`, non-empty `missing_scopes`,
   `onboarding_required`, `health.policies_ok/ship_from_ok: false`, `risk.level` warn/danger
   (show `risk.reasons`).
5. **Sales needing action**:
   - `sales_list` `held=true`, then split by `fulfillment.releasable`.
   - `sales_list` `needs_manual_fulfillment=true` (source cancelled or checkout failed).
   - `sales_list` `status=PENDING` `sold_before=<now − 2 h>`: stuck, not bought yet.
   - `sales_list` `status=PURCHASED` `sold_before=<now − 3 days>`: bought but no tracking. eBay's
     handling time is at risk.
6. **Returns**: `returns_list` `status=open` and `status=manual_review`. Flag `eligible_until`
   within 3 days.
7. **Messages**: `messages_list` `unread=true`. Group by `thread_id`, and flag any `vero.is_vero` first.
8. **Listings**: `listings_list` `status=FAILED` `created_after=<since>`. For out-of-stock or ended
   listings, check `notifications_list` `occurred_after=<since>` (kinds `delisted`, `error`), and if
   webhooks are set up, `events_list` `type=listing.out_of_stock` `created_after=<since>`.
9. **Failed desktop jobs**: `jobs_list` `status=FAILED` `requested_after=<since>`. Group by `kind` + `error`.
10. **Leads**: `leads_list` `status=ASSIGNED` (count, plus the best 3 by `spread`).
11. **Numbers**: `analytics_dashboard` `period=day` (revenue, units sold, new listings);
    `analytics_skuProfit` `days=1` for profit; `account_usage_get` for live listings and the sourcing cap.

CLI fallback: the same calls as `horus <resource> <verb> --<param> <value> --json`, for example
`horus sales list --held true --json`. A runnable script that does all of this is in
`docs/examples/` of the Horus SDK repo (`daily-summary.ts` / `daily_summary.py`).

## Prioritize

Rank findings with this order, and put the money-at-risk items first:

| Priority | Finding | Why |
|---|---|---|
| **P0** | Desktop offline (or not ready) **and** `held_sale_count > 0` or sales PENDING | Orders aren't being bought; eBay late-shipment defects are coming. |
| **P0** | eBay account inactive, token expired, `missing_scopes` | No tracking uploads, no new listings on that account. |
| **P0** | Sales `needs_manual_fulfillment` | The buyer paid and nothing is bought. |
| **P1** | Sales PENDING > 2 h, PURCHASED > 3 days with no tracking | Late-shipment risk. |
| **P1** | Buyer accounts signed out, especially ones that back live listings | The next sale on them will fail. |
| **P1** | Returns `manual_review`, returns close to `eligible_until`, VeRO messages | Money or account standing at risk. |
| **P1** | `risk.level` danger | eBay seller standards. |
| **P2** | Unread buyer messages, failed listings, failed jobs, out-of-stock listings | Hygiene. |
| **P3** | Leads waiting, numbers | Growth. |

## Summary

Keep it short. Put a one-line status at the top, then the P0/P1 items, each with a count, the objects
and **the fix you can do**. Put the numbers last. Leave out empty sections. Use names the operator
recognizes (account email, eBay username, product name, eBay order id), and keep the ids for the fixes.

```markdown
**Horus check-in, Thu 7 Nov 08:00 UTC** · 2 things need you now

### Needs you now
1. **Horus Desktop is offline** (last seen 06:12). 3 sales are held and buy themselves once it's back.
   → Open Horus Desktop on your PC.
2. **eBay `bestdeals-shop` token expired.** Tracking can't upload. → I can get you a reconnect link.

### Soon
- 4 buyer accounts signed out (amz-07@…, amz-12@…, wmt-03@…, wmt-04@…) → I can verify and re-sign them in.
- 2 purchases have no tracking after 3+ days ("Ninja blender", eBay 12-34567-89012; …) → I can re-check tracking.
- 1 return in manual review ("Dyson V8 filter", eligible until 9 Nov).

### Hygiene
- 6 unread buyer messages in 4 threads (1 VeRO notice, brand "Acme") → I can draft replies.
- 3 listings failed since yesterday → details + retry.

### Today so far
Revenue $412.80 · 9 units · profit $61.20 · 37 new listings · 1,284 live · 12 leads waiting

_Skipped: messages (key lacks `messages:read`)._ Want me to do 1–4?
```

Every "→" is either a fix you can do through the API or a plain statement that the user has to act
(open the desktop app, eBay Seller Hub, the source store). Never say a refund "will happen". Say it's
queued or that it needs them. Use the amounts the API returns. Don't estimate profit yourself.

## Offer fixes (only after the user says yes)

| Finding | Fix (skill) |
|---|---|
| Desktop offline | Ask the user to open Horus Desktop. You can't start it. Held sales then resume within about a minute, or use `sales_release` (`horus-fulfillment`). |
| Accounts signed out | `accounts_verifyBulk`, then `accounts_signInBulk` for those still out (`horus-account-health`). |
| eBay token / scopes / onboarding / policies | `horus-account-health` (eBay section). |
| Held, stuck or manual-fulfilment sales | `horus-fulfillment`. |
| Returns, messages | `horus-returns-messages`. Draft replies, never send without approval. |
| Failed listings | `horus-source-and-list` (diagnose, then `listings_retry`). |
| Leads | `horus-leads`. |

Use one `Idempotency-Key` per fix, for example `checkin-<date>-<fix>-<id>`.

## Scheduling

If the user wants this every morning, a scheduled agent can run this skill with a read-only key
and post the report. A webhook endpoint (`horus-webhooks`) catches the urgent events
(`desktop.offline`, `ebay_account.token_expired`, `sale.held`, `account.session_lost`,
`return.requested`, `message.received`) between check-ins.
