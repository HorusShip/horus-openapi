---
name: horus-account-health
description: Diagnose and fix Horus buyer accounts (Amazon, Walmart, Target, Best Buy, AliExpress logins used to buy orders) and connected eBay seller accounts. Use when an account is signed out or "session lost", sign-in or login failed, Amazon forces a password reset, a card is declined or missing, a proxy is dead, an OTP inbox is disconnected, or an eBay account's token expired, is missing scopes, needs onboarding, lacks business policies or a ship-from location, or shows seller-standards risk.
---

# Horus account health

Uses the `horus-operator` conventions. Scopes: `accounts:write` (buyer accounts, jobs),
`ebay:write`, `inboxes:write`, `proxies:write`, `desktop:read`.

Every buyer-account action runs on **Horus Desktop** and returns a 202 job. Check
`desktop_status_get` first. If `online: false`, stop and ask the user to open the app. If
`account_automation_ready: false`, wait a minute.

## A. Buyer accounts

### 1. Find the problem accounts

`accounts_list` with `session_valid=false` (signed out), then look for `session_valid: null` (never
checked). Narrow with `platform=`, `group_id=` or `email=`. For one account, use `accounts_get` and
`jobs_list` `account_id=<id>` `limit=10` to see its recent jobs and their `error`s.

### 2. Verify first (cheap, safe, no confirmation needed)

`accounts_verify` (one) or `accounts_verifyBulk` with `account_ids` or `group_id`. It's
read-only on the store. Wait for the jobs (`jobs_get`). `result.loggedIn` and the account's
`session_valid` update. Bulk results list per-account `failed[]` (for example no desktop, or an
unsupported platform).

### 3. Sign in the ones still signed out

`accounts_signIn` / `accounts_signInBulk`. Tell the user first that it runs a real login on their
desktop. Supported: **Amazon and Walmart**. Target, Best Buy and AliExpress return `422
platform_not_supported`. For those, the user signs in from the Horus Desktop app (AliExpress's
slider puzzle needs a human), and then you re-verify.

One-time codes are read from the account's linked **inbox** (`inbox_id`). If there's none and the store
asks for a code, the job fails. Link one with `accounts_update` `{ inbox_id }` (see §C).

### 4. Read the failure and act

| Job `error` / symptom | Do this |
|---|---|
| Password wrong / credentials rejected | Ask the user for the new password and save it with `accounts_update` `{ password }` (don't echo it). Then sign in. |
| 2FA / TOTP failed | `accounts_update` `{ totp_secret }` with the authenticator seed, then sign in. |
| Code required, no inbox / code not found | Link or fix the inbox (§C), then sign in. |
| Amazon "password reset required" / reverification | `accounts_recover` (Amazon only). Horus resets the password from the user's `orders.password_reset.template` and reads the email OTP from the inbox. If the user has the code in hand, pass `{ otp_code }`. `409 recovery_in_progress` means one is already queued, so wait for it. Confirm before starting: it **changes the real Amazon password**. |
| Proxy / connection errors | `proxies_test` on its proxy (find it with `proxies_list`). If `ok: false`, set a working proxy with `accounts_update` `{ proxy: "host:port:user:pass" }` or `proxy: null`, then verify. |
| CAPTCHA / bot check / "verify it's you" in the browser | The user has to finish it in the desktop app. Don't retry in a loop, because repeated attempts get accounts throttled. |
| Account locked or suspended by the store | Tell the user. Nothing in Horus fixes this. Consider moving listings off it. |

Rules: **at most one sign-in retry per account per hour** without a change. Rapid repeated logins
get store accounts throttled or locked. Never delete an account to "reset" it
(`accounts_delete` refuses with `409 account_in_use` while live listings depend on it anyway).

### 5. Cards

- Card on file: `accounts_get` → `card.last4`, `exp_month`/`exp_year`. An expired card means checkouts fail.
- Replace: `accounts_card_update` with `number`, `holder_name`, `exp_month`, `exp_year`, `cvv`,
  `billing_address`. Only do this when the user gives you the card to save, and never repeat it back.
- Walmart: the card must also be added on walmart.com, using `accounts_addCard` (`{ cvv }`) → job.
- Store/gift cards: `is_store_card: true`.

## B. eBay seller accounts

`ebay_accounts_list` (or `ebay_accounts_get`) and read `is_active`, `deactivated_reason`,
`missing_scopes`, `onboarding_required`, `health`, `risk`.

| Symptom | Fix |
|---|---|
| Token expired, `is_active: false`, non-empty `missing_scopes` | `ebay_accounts_connect` → returns `url` (valid 15 min). Give the user the link to approve on eBay. Then `ebay_accounts_get` should show it active, and the `ebay_account.reconnected` event fires. |
| `onboarding_required` | The user finishes eBay's steps at `onboarding_url`, then you call `ebay_accounts_clearOnboarding`. Pending listings resume. |
| `health.policies_ok: false` | `ebay_policies_list` → pick one fulfillment, payment and return policy (ask the user if there are several) → `ebay_accounts_update` `{ policies: {…} }`. `409 business_policies_not_eligible` means the user must opt in to Business Policies in eBay Seller Hub first. |
| `health.ship_from_ok: false` | `ebay_locations_list`. Pick one and set `merchant_location_key` with `ebay_accounts_update`, or `ebay_locations_create` with the user's ship-from address (it becomes the default). |
| Many `horusship*` placeholder locations | `ebay_locations_cleanup` (keeps the current one). |
| `risk.level` warn / danger | `ebay_metrics_list` for the trend (defect rate, late shipment, tracking on time). Explain the reasons. Suggest fixing late tracking (`horus-fulfillment`) and slowing new listings on that account. |
| Listings on eBay that Horus doesn't track | `ebay_accounts_cleanupOrphanListings` with `dry_run: true` first. Show the list. Only call `dry_run: false` (it **ends them on eBay**) after explicit approval. |

Never call `ebay_accounts_delete` unless the user asks to disconnect. With `force=true` it ends
every live listing and cancels pending sales on that account.

## C. OTP inboxes and proxies

- `inboxes_list`: `active: false` or a past `oauth_expires_at` means codes can't be read.
  Gmail/Outlook: `inboxes_oauth_start` `{ provider }` → consent `url` for the user. IMAP: `inboxes_update`
  `{ app_password }`. Link an inbox to accounts with `accounts_update` `{ inbox_id }`.
- `proxies_list` `status=FAILED`, then `proxies_test` to re-check. Replace dead ones with `proxies_update` or
  `proxies_create` (bulk `host:port:user:pass` strings into a proxy group).

## D. Adding buyer accounts

Only when the user asks and supplies the credentials. Never invent or reuse them. Pick or create the
group first (`groups_accounts_list`, `groups_accounts_create` `{ name, website }`, one website per group).
Then `accounts_create` (one) or `accounts_bulkCreate` (up to 500, with per-row `failed[]`). That only
stores the credentials. Run `accounts_verify` / `accounts_signIn` next. `409 account_exists` means there's already
one with that website + email.

## Finish

Re-run `accounts_verifyBulk` on what you touched, then summarize per account: fixed, still
broken (why, and what the user must do), or skipped. Use idempotency keys like
`health-<date>-signin-<account_id>` so a retried request doesn't double-queue.
