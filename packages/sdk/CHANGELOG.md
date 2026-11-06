# Changelog: @horusship/sdk

## 0.1.0 (unreleased)

First release, generated from the Horus API spec `2026-11-06` (176 operations, 35 webhook events).

- Typed client for every operation: `horus.<resource>.<verb>()`, plus `horus.call()`, `horus.paginate()`, `horus.request()`.
- Auth: API key (`apiKey` / `HORUS_API_KEY`), or an OAuth access token with a `refresh` callback.
- Automatic retries (network, timeouts, 408, 429 with `Retry-After`, 5xx, `idempotency_in_progress`) with exponential backoff and jitter. Writes send an auto-generated `Idempotency-Key` that is reused across retries.
- Typed errors (`APIError` subclasses by `type`, `DesktopOfflineError`, `RateLimitError.retryAfter`).
- Cursor `Paginator` (awaitable, async-iterable, `.page()`, `.pages()`, `.toArray()`).
- `horus.jobs.wait()` for 202 desktop jobs.
- `verifyWebhook()` / `verifyWebhookSignature()`: Standard Webhooks and the legacy `X-Horus-Signature`, with typed `HorusEvent` payloads and a dependency-free HMAC-SHA256.
- ESM + CJS + `.d.ts`; no Node-only dependencies. `@horusship/sdk/catalog` holds the operation metadata.
