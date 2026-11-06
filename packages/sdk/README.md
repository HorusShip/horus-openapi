# @horusship/sdk

The official TypeScript SDK for the [Horus](https://horusship.com) API (`/api/v1`).
Every operation in the OpenAPI document is a typed method, generated from the
spec so the SDK can't drift from the API.

- Works in Node 18+, Bun, Deno, edge runtimes and browsers (no Node-only dependencies). ESM and CJS.
- API key or OAuth access token (with automatic refresh).
- Retries 429 / 5xx / network errors with backoff. Writes send an `Idempotency-Key` automatically, so retries are safe.
- `for await` pagination, `jobs.wait()` for desktop jobs, typed errors.
- Webhook signature verification (Standard Webhooks plus the legacy `X-Horus-Signature`), with typed event payloads.

```sh
npm install @horusship/sdk
```

## Quickstart

```ts
import { Horus } from "@horusship/sdk";

const horus = new Horus({ apiKey: process.env.HORUS_API_KEY }); // ak_… (Settings → API)

const me = await horus.me.get();

// Every listing, across pages
for await (const listing of horus.listings.list({ status: "LISTED" })) {
    console.log(listing.id, listing.title);
}

// One page
const page = await horus.sales.list({ limit: 50 }).page();
console.log(page.data.length, page.has_more, page.next_cursor);

// Writes (sent with an Idempotency-Key)
await horus.sales.ship("sale_id", { tracking_number: "1Z999AA10123456784", carrier: "UPS" });

// Desktop jobs return 202 + a Job. Wait for the result:
const job = await horus.accounts.jobs.create("account_id", { kind: "VERIFY_SESSION" });
const done = await horus.jobs.wait(job, { timeoutMs: 5 * 60_000 });
if (done.status !== "SUCCEEDED") console.error(done.error);
```

Method names follow the operationIds: `listings.list` → `horus.listings.list()`,
`accounts.jobs.create` → `horus.accounts.jobs.create()`. Path parameters come
first and positionally, then one params object: the query for reads, the JSON
body for writes. The last argument is per-call options.

```ts
horus.webhooks.deliveries.get(webhookId, deliveryId);
horus.listings.update(id, { price: 19.99 }, { idempotencyKey: "reprice-123", timeoutMs: 10_000 });
```

Types for every schema are exported by name: `import type { Listing, Sale, Job } from "@horusship/sdk"`.
To get the params or response type of any operation, use `QueryOf<"listings.list">`,
`BodyOf<"sales.ship">` or `ResponseOf<"sales.get">`.

## Configuration

```ts
new Horus({
    apiKey: "ak_…",            // or HORUS_API_KEY
    baseUrl: "https://horusship.com/api/v1", // or HORUS_BASE_URL
    timeoutMs: 60_000,         // per attempt
    maxRetries: 2,
    fetch: customFetch,        // e.g. undici with a proxy, or a test double
    defaultHeaders: { "x-my-app": "1" },
});
```

OAuth access tokens (from the Atlas OAuth flow, see the API's AUTH docs):

```ts
new Horus({
    accessToken: () => tokenStore.current(),   // string or (async) function
    refresh: async () => tokenStore.refresh(), // called once on 401 invalid_access_token
});
```

## Errors

Every API error is an `APIError` subclass that carries `status`, `type`,
`code`, `message`, `details` and `requestId`:

| Class | When |
|---|---|
| `InvalidRequestError` | 400 / 422 (`details.issues` lists the fields) |
| `AuthenticationError` | 401 |
| `PermissionError` | 403 (`insufficient_scope`: `details.required`) |
| `NotFoundError` | 404 |
| `ConflictError` | 409 |
| `RateLimitError` | 429 (`retryAfter` in seconds) |
| `UnavailableError` / `DesktopOfflineError` | 503 (`desktop_offline`: the user's Horus Desktop is offline) |
| `InternalServerError` | 5xx |
| `APIConnectionError` / `APITimeoutError` | no response |
| `JobTimeoutError` | `jobs.wait()` gave up |

```ts
import { NotFoundError, DesktopOfflineError } from "@horusship/sdk";

try {
    await horus.accounts.verify(id);
} catch (e) {
    if (e instanceof DesktopOfflineError) notify("Start Horus Desktop");
    else throw e;
}
```

Retried automatically: network errors, timeouts, 408, 429 (honouring
`Retry-After`), 5xx (but not `desktop_offline`), and `409 idempotency_in_progress`.

## Pagination

`list()` on a cursor-paginated endpoint returns a `Paginator`:

```ts
const p = horus.listings.list({ status: "LISTED", limit: 100 });
await p;                         // first page
await p.page();                  // same (cached)
for await (const l of p) {}      // every item
for await (const pg of p.pages()) {}
await p.toArray({ max: 500 });
```

## Webhooks

```ts
import { verifyWebhook, WebhookVerificationError } from "@horusship/sdk";

app.post("/horus", express.raw({ type: "application/json" }), (req, res) => {
    let event;
    try {
        event = verifyWebhook(req.body, req.headers, process.env.HORUS_WEBHOOK_SECRET!); // raw body, not parsed JSON
    } catch (e) {
        return res.sendStatus(400);
    }
    res.sendStatus(204);
    if (event.type === "sale.shipped") console.log(event.data.sale.tracking_number); // typed per event
});
```

`verifyWebhook` checks the Standard Webhooks signature (several signatures are
accepted during a secret rotation, with a 5-minute timestamp tolerance). If
the Standard Webhooks headers are missing, it falls back to the legacy
`X-Horus-Signature`. For endpoints still on `payload_format: "v1"`, pass
`{ payloadFormat: "v1" }` to get the legacy body type. `signWebhook()` is
exported for tests.

## Dynamic calls

```ts
await horus.call("sales.ship", { id }, { tracking_number });   // by operationId
for await (const x of horus.paginate("listings.list", {}, { status: "LISTED" })) {}
await horus.request("GET", "/listings", { query: { limit: 5 } }); // any path
```

`@horusship/sdk/catalog` exports the full operation metadata (summaries,
parameters, scopes), as used by the CLI.

## Development

```sh
npm run generate   # regenerate src/generated/ from ../../openapi/openapi.json
npm test           # typecheck + unit tests (a test fails if generated code is stale)
npm run build      # dist/ (ESM, CJS, .d.ts)
HORUS_API_KEY=ak_… npm run smoke   # live, read-only checks against production
```

To refresh the spec from the backend:
`cd horus-backend && npx tsx scripts/dumpOpenapi.ts`, then `npm run generate`.

Generation (`scripts/generate.ts`):

| File | From |
|---|---|
| `src/generated/openapi.ts` | `openapi-typescript`: raw `paths` / `components` / `operations` / `webhooks` types |
| `routes.ts` | method, path, params location, idempotency, pagination per operationId (runtime table) |
| `resources.ts` | the namespaced methods, with JSDoc from the summaries |
| `catalog.ts` | full metadata for the CLI and help |
| `schemas.ts` | `export type Listing = components["schemas"]["Listing"]` for every schema |
| `events.ts` | webhook event map / union |

MIT licensed.
