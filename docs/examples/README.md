# Examples

Runnable, self-contained scripts. Each comes in TypeScript (`@horusship/sdk`) and Python (`horus-sdk`).
All read `HORUS_API_KEY` (create one under **Settings → API**, with the scopes listed at the top of
each file).

| Example | TypeScript | Python | What it does |
|---|---|---|---|
| Daily summary | [`daily-summary.ts`](daily-summary.ts) | [`daily_summary.py`](daily_summary.py) | Read-only health check: desktop, eBay accounts, signed-out buyer accounts, held/stuck/untracked sales, returns, unread and VeRO messages, failed listings and jobs, today's numbers. Prints a prioritized list. |
| Bulk list from CSV | [`bulk-list.ts`](bulk-list.ts) | [`bulk_list.py`](bulk_list.py) | Reads a CSV of ASINs (optional per-row markup), validates, does a dry run by default, creates listings in batches of 2000 with deterministic idempotency keys (safe to re-run), and watches them until LISTED / FAILED. |
| Auto-reply webhook | [`auto-reply-webhook.ts`](auto-reply-webhook.ts) | [`auto_reply_webhook.py`](auto_reply_webhook.py) | Webhook server for `message.received`. It verifies signatures, dedupes, finds the sale behind the message, and drafts (or with `AUTO_SEND=1` sends) a tracking reply for "where is my order?" questions. Everything else goes to a human. |

## Run

```sh
# TypeScript (Node 18+)
npm install @horusship/sdk
HORUS_API_KEY=ak_… npx tsx daily-summary.ts

# Python (3.9+)
pip install horus-sdk
HORUS_API_KEY=ak_… python daily_summary.py
```

Bulk list (dry run first, then `--yes`):

```sh
printf 'asin,markup\nB07ABC1234,70\nB09XYZ5678,\n"B07ABC1234;2, B09XYZ5678;1",60\n' > asins.csv
npx tsx bulk-list.ts asins.csv --group <listing group id> --ebay <eBay account id>
npx tsx bulk-list.ts asins.csv --group <listing group id> --ebay <eBay account id> --yes
```

Find the ids with `horus groups listings list --json` and `horus ebay accounts list --json`.

Auto-reply webhook (needs a public HTTPS URL, e.g. a tunnel to `localhost:8787`):

```sh
HORUS_API_KEY=ak_… HORUS_WEBHOOK_SECRET=whsec_… npx tsx auto-reply-webhook.ts
horus webhooks create --url https://<your-tunnel>/horus --events message.received --json   # prints the secret
horus webhooks test <webhook id> --json
```

It runs in **draft mode** until you set `AUTO_SEND=1`. Read a day of drafts before turning that on.

## Notes

- These scripts never print secrets, and they confirm before writing (`bulk-list` needs `--yes`, the
  webhook only sends with `AUTO_SEND=1`).
- Delivery is at least once. The webhook examples dedupe in memory, so use a database in production.
- Errors are typed: `PermissionError` / `DesktopOfflineError` / `RateLimitError` in TypeScript,
  `PermissionDeniedError` / `DesktopOfflineError` / `RateLimitError` in Python. The SDKs retry 429s and 5xx on their own.
