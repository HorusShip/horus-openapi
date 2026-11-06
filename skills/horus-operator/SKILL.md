---
name: horus-operator
description: Operate a Horus (horusship.com) eBay arbitrage account through its API, MCP server, CLI or SDKs. Use whenever the user mentions Horus, their eBay listings, sales, buyer accounts, source orders, returns, leads, the Horus Desktop app, or asks you to check, fix, list, fulfil or automate anything in Horus. Covers connecting, the object model, finding the right operation, desktop jobs, errors, idempotency and rate limits. The other horus-* skills build on this one.
---

# Operating Horus

Horus lists products on eBay and fulfils the orders. An operator finds products, lists them on
eBay at a markup, and when an eBay order comes in, the operator's **Horus Desktop** app buys the
item from the source store (Amazon, Walmart, Target, Best Buy or AliExpress) with one of the
operator's **buyer accounts** and ships it to the eBay buyer. Horus then uploads tracking to eBay
and handles returns.

What the operator cares about most is **listing throughput** (more good listings live) and
**not losing money on orders** (every sale bought, tracked and shipped on time). Keep both in mind
when you decide what to do first.

## 1. Connect

Use the first of these that is available:

| Surface | How to tell | How to call |
|---|---|---|
| **MCP** (preferred) | Tools named like `listings_list`, `sales_ship` | Call the tool. Arguments are the operation's path params, query params and body fields, all at the top level. |
| **CLI** | `horus --version` works in a shell | `horus <resource> <verb> [args] --json`, or `horus api <METHOD> <path> --data '<json>'` for anything |
| **SDK** | You are writing code | TypeScript `@horusship/sdk`, Python `horus` (`horus-sdk` on PyPI) |
| **HTTP** | Nothing else | `https://horusship.com/api/v1`, header `Authorization: Bearer <key or token>` |

**MCP tool lists are trimmed.** By default the server lists about a dozen everyday tools (`me_get`,
`sales_list`, `listings_list`, `jobs_get`, `desktop_status_get`, …) plus two meta tools that reach
every operation:

- `horus_search_operations` `{ query: "ship sale tracking" }` returns matching operations with their tool
  name, scopes, whether this credential may call them, and their input schema.
- `horus_call` `{ operation: "sales_ship", arguments: { id, tracking_number, carrier }, idempotency_key }`
  calls any operation.

So when a skill names a tool you don't see (for example `accounts_verifyBulk`), call it through `horus_call`
with that name. Don't conclude that Horus can't do it. Connections made with `?toolsets=all` (or
`?toolsets=sales,listings`) list those tools directly, and `?read_only=true` connections refuse writes.

Set-up details for each surface (adding the MCP server, `horus login`, API keys and scopes) are in
[references/connecting.md](references/connecting.md).

Before you do anything, call `me_get` (`horus me get --json`, `GET /me`). It confirms the credential
works and returns its `scopes`. If you will need a scope it lacks, tell the user now rather than
failing halfway through a task.

## 2. Names: one operation, four spellings

Every operation has an `operationId` such as `sales.markRefunded`. The same operation is:

- MCP tool: dots become underscores, so `sales_markRefunded`, `accounts_card_update`, `ebay_accounts_list`.
- CLI: `horus sales mark-refunded <id>`. Each segment is its own word, and camelCase becomes kebab-case.
- SDK: `horus.sales.markRefunded(id)` in TypeScript, `client.sales.mark_refunded(id)` in Python.
- HTTP: `POST /sales/{id}/mark_refunded`.

The full catalogue grouped by area, with scopes and which operations need the desktop, is in
[references/operations.md](references/operations.md). It is generated from the OpenAPI document.
To find an operation, search that file for the noun (sale, listing, account...) and pick the verb.

## 3. The object model

Read [references/object-model.md](references/object-model.md) before you act on sales or listings.
The short version:

- **Buyer account** (`account`, scope `accounts`): a login on a source store. Grouped in account
  groups (one website per group). `session_valid` says whether it is signed in on the desktop.
- **eBay account** (`ebay_account`, scope `ebay`): a connected eBay seller. Needs a valid token,
  business policies and a ship-from location to list.
- **Listing** (`listing`, scope `listings`): one source product (or bundle) listed on one eBay account.
  Status: `PENDING` → `LISTED`, or `FAILED`; then `DELISTED` (ended), `PURCHASED`/`SHIPPED`/`COMPLETED` after a sale.
- **Sale** (`sale`, scope `sales`): one eBay order line. Status: `PENDING` (not bought yet) →
  `PURCHASED` (bought at source) → `SHIPPED` (tracking on eBay) → `DELIVERED` → `PAID`; or
  `CANCELLED` / `REFUNDED`. `fulfillment.held` means fulfilment is paused.
- **Source order** (`source_order`): an order scraped from a buyer account, matched to a sale.
- **Return** (`return`, scope `returns`), **message thread** (`message_thread`, scope `messages`).
- **Lead** (`lead`, scope `leads`): a product handed to the operator to list. **Candidate**
  (`sourcing_candidate`, scope `sourcing`): a product found by sourcing.
- **Job** (`job`): work queued on the operator's Horus Desktop (sign in, verify, checkout, scrape,
  refund). **Webhook** (`webhook`): an endpoint that receives events.

## 4. Desktop jobs (202 responses)

Anything that must happen in a browser on the operator's machine (signing in, checking a session,
reading orders, starting a return) runs on **Horus Desktop**. Those operations return **202** with a
`job` (or a `listing_batch` / `fulfillment` for listings and eBay orders).

1. Keep the job's `id`. Poll `jobs_get` every 5–10 s (`horus jobs get <id> --json`). Both SDKs
   have `jobs.wait(job)` for this.
2. `QUEUED`/`CLAIMED`/`RUNNING` mean keep waiting. Sign-ins can take 1–3 minutes and order
   scrapes can take longer. Stop polling after about 5 minutes, tell the user it is still running,
   and give them the job id.
3. `SUCCEEDED`: read `result`. `FAILED`: read `error`, and don't retry more than once without a change
   (see the account-health skill for sign-in failures). `CANCELLED`: someone cancelled it.
4. If the desktop is not running you get **`503 desktop_offline`** and no job is queued. Do not retry
   in a loop. Ask the user to open Horus Desktop, then check `desktop_status_get` until
   `online: true`, then retry once.
5. You can cancel a job that hasn't started with `jobs_cancel`. A running job can't be stopped
   (`409 job_running`).

Details and the job kinds are in [references/jobs-and-errors.md](references/jobs-and-errors.md).

## 5. Safety rules (always)

- **Read freely, write deliberately.** List and get calls are safe. Before any write, say what it
  will do and to which objects.
- **Get explicit confirmation from the user before anything that costs money, can't be undone, or
  is visible to buyers.** That includes ending, deleting or repricing listings; cancelling or deleting sales;
  buying (`ebayOrders_fulfill`, `sales_release`, `sales_linkSourceOrder`); starting or declining
  returns; marking refunded; sending buyer messages; disconnecting eBay accounts; unpairing
  desktops; deleting accounts, groups or webhooks; changing settings; and `account_delete`, which
  must never be done for the user. Confirm once per batch, listing what is in it, not once per item.
- **Never invent a fix the API can't do.** If the right action is in eBay Seller Hub, the source
  store, or the desktop app, say so and stop.
- **Secrets stay secret.** Never echo a password, card number, CVV, TOTP seed, API key or webhook
  secret back into chat, logs or files. The API never returns them. Don't ask the user to paste them
  in chat unless they want you to save them. If they paste one, use it once and don't repeat it.
- **Use an `Idempotency-Key` on every write you might retry** (all POST/PATCH/DELETE accept it).
  Generate one per intended action (for example `checkin-2026-11-07-verify-<account_id>`) and reuse the
  same key on a retry. The SDKs and CLI do this automatically. Same key with a different body →
  `409 idempotency_conflict`. Still running → `409 idempotency_in_progress`, so wait and retry.
- Use the word "leads" for products handed to the operator. Don't describe where they come from.

## 6. Errors

Every error looks like `{ "error": { "type", "code", "message", "details", "request_id" } }`.
Branch on `code`. The ones you'll meet most:

| HTTP / code | What to do |
|---|---|
| 401 `invalid_api_key`, `invalid_access_token`, `missing_credentials` | The credential is bad or expired. Re-login (`horus login`) or ask for a new key. Don't retry. |
| 403 `insufficient_scope` | `details.required` lists the missing scopes. Tell the user exactly which ones. For a key they need a new key with those scopes (Settings → API); for OAuth, re-authorise. Never look for a way around it. |
| 404 `<thing>_not_found` | Wrong id, or not this user's. Re-list to find the right id. |
| 409 (`account_in_use`, `listing_has_active_order`, `job_running`, ...) | The object's state doesn't allow it. Read the message, re-fetch the object, and explain. |
| 422 `validation_failed` | `details.issues[]` gives `path` + `message`. Fix the input. |
| 429 `rate_limited` | Wait `Retry-After` seconds. Limits are 600 reads and 120 writes per minute per credential. |
| 503 `desktop_offline` | See §4. |
| 503 `ebay_unavailable`, `ebay_upload_failed`, `ebay_request_failed` | eBay didn't answer or refused. Retry once after a minute with the same idempotency key. |
| 500 `internal_error` | Retry once. If it repeats, report the `request_id`. |

The full list is in [references/jobs-and-errors.md](references/jobs-and-errors.md).

## 7. Lists and pagination

Lists return `{ data, has_more, next_cursor }`, newest first, `limit` up to 100 (default 25). Pass
`cursor=<next_cursor>` for the next page. **Filter instead of paging through everything.**
For example, `sales_list` takes `status`, `held`, `needs_manual_fulfillment`, `sold_after`, and `listings_list` takes
`status`, `created_after`, `ids` (≤100). The SDKs have auto-paging iterators. When you page by hand, stop
once you have what you need.

Money is always `{ "amount": 12.34, "currency": "USD" }`. Times are ISO-8601 UTC.

## 8. Which skill next

| The user wants to... | Skill |
|---|---|
| "How's my store?", "anything I need to do?", morning check | `horus-daily-checkin` |
| Fix a buyer account or eBay account (signed out, token expired, card, policies) | `horus-account-health` |
| Find products, list ASINs, bulk list, price | `horus-source-and-list` |
| Work today's leads | `horus-leads` |
| A sale is stuck, held, failed, needs tracking or cancelling | `horus-fulfillment` |
| Returns, refunds, buyer messages | `horus-returns-messages` |
| Get notified or automate on events | `horus-webhooks` |
