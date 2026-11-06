---
name: horus-returns-messages
description: Handle eBay returns, refunds and buyer messages in Horus. Use when a buyer opens a return, asks where their order is, complains, or sends any eBay message; when a VeRO/rights-owner notice arrives; when the user wants to start a source-store return, resend a return label, decline a return, mark a sale refunded, or draft and send replies. Drafts replies for approval and never promises what Horus can't do.
---

# Returns and buyer messages

Uses `horus-operator` conventions. Scopes: `returns:write`, `messages:write`, `sales:read`,
`listings:write` (only for VeRO follow-ups).

Everything here is visible to buyers or moves money. **Draft first, act after approval.**

## Returns

### What Horus can and can't do

- It **detects** eBay returns (`return.requested`) and tracks them: `open` → `processing` (the
  source-store return was started) → `completed` (refunded), or `manual_review` / `declined`.
- `returns_initiate` starts the return **at the source store** on the desktop (202 job). Automatic
  return flows aren't finished for every store yet. If the desktop can't complete it, the job ends
  without a refund, the sale stays in returns, and the user gets a "manual return" alert. **Never
  tell the user or buyer that a refund has happened or will happen automatically.** Say it was
  started, and check the result.
- Horus **can't** accept, refund or decline the return **on eBay** through the API. That's done in
  eBay Seller Hub. `returns_decline` only records the decision in Horus.

### Procedure

1. `returns_list` `status=open` (also `manual_review`). For each one, `returns_get`, plus `sales_get`
   with the return's `sale_id` for the order and its source.
2. Show the user: product, eBay order, `reason`, sale price, `eligible_until` (the last day the source store
   accepts a return), `auto_skip_reason` (why auto-return didn't run, e.g. over the
   `settings.returns.max_sale_price` cap or outside `max_days_since_sale`), and the label status.
3. With approval, act:

| Situation | Action |
|---|---|
| Return the item to the source store for a refund | `returns_initiate` → poll the job. On success the return moves to `processing` and a label appears (`label_url`, `rma_code`). On failure, tell the user to start the return on the store themselves before `eligible_until`. |
| Label exists but the buyer didn't get it | `returns_resendLabel` (409 / `ebay_rejected_label` → upload it in Seller Hub). |
| The source refunded you outside Horus | `sales_markRefunded` `{ id: sale_id }`. This also cancels a still-running refund job. `409 sale_already_refunded` means it's already done. |
| User won't accept the return | `returns_decline`, then remind them to decline on eBay too. |
| `manual_review` | Explain why (`auto_skip_reason`) and let the user choose initiate / decline / handle it themselves. |

Watch the return through `return.processing`, `return.label_sent`, `return.completed`,
`sale.refunded` (events), or re-fetch it with `returns_get`.

Auto-return settings (`settings_get` → `returns.*`: `auto_approve`, `max_sale_price`,
`max_days_since_sale`, `excluded_group_ids`) change only when the user asks, with `settings_update`.

## Buyer messages

### Read

- Inbox: `messages_list` `unread=true` (newest first). Group by `thread_id`, then `messages_threads_get` for
  the whole conversation.
- Find a thread: `messages_threads_list` `q=<buyer, subject>` (`ebay_account_id`, `received_after`).
- History looks thin? `messages_sync` (202) backfills from eBay. List again a few minutes later.
- For context, look up the sale: `sales_list` `q=<buyer username or listing title>` → status, tracking.

### Draft

Write a short, polite reply in the seller's voice, based on facts from the sale:

| Buyer asks | Facts to use |
|---|---|
| Where's my order? | `tracking.number` / `carrier` if SHIPPED. If PURCHASED, "it's been dispatched to our shipping partner, and tracking will appear on your order within N days". If PENDING, check `horus-fulfillment` first. |
| Wants to cancel | PENDING → the user can approve `sales_cancel`. PURCHASED or later → "it has already shipped. You can open a return once it arrives." |
| Damaged / wrong item | Apologize and point them to eBay's return flow (their protection is there). Don't offer refunds outside eBay. |
| Price / discount / bulk | Only what the user authorizes. |

**Never** in a reply: promise a refund, a replacement, a delivery date you don't have, or a discount the user
didn't approve; mention the source store, buying from another retailer, or Horus; ask the buyer to
pay or talk off eBay; or share another buyer's data. If you're unsure, ask the user.

See [references/reply-examples.md](references/reply-examples.md) for tone.

### Send (after approval)

`messages_threads_reply` `{ id: thread_id, body }` with an `Idempotency-Key` such as
`reply-<thread_id>-<sha1 of body>`, so a retry can't send twice. Then `messages_threads_markRead`.
`409 cannot_reply_to_system_message` → it's from eBay, not a buyer, so don't reply. `503 reply_failed` →
eBay refused. Retry once later.

To clear an inbox without replying (spam, eBay notices): `messages_markRead` / `messages_threads_markRead`,
with approval for a batch.

## VeRO / rights-owner notices

Messages with `vero.is_vero` (threads with `is_vero`) mean a rights owner reported a listing. Treat them as **P1**:

1. Tell the user: brand (`vero.brand`), the listing (`listing_id`), and what eBay did (`vero.action`).
2. Offer, with approval: `listings_end` on that listing (and other live listings of the same brand:
   `listings_list` `search=<brand>` `status=LISTED`), and `blacklist_brands_create` `{ brand }` so it's
   never listed again. If `settings.protection.vero_protection_enabled` is on, Horus may already have done this.
   Check `blacklist_brands_list`.
3. Don't argue with the rights owner in a reply.
