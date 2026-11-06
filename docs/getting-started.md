# Getting started with the Horus API

The Horus API gives you programmatic access to everything in your Horus account: listings, sales,
buyer accounts, eBay accounts, returns, messages, sourcing, leads, settings and webhooks.

- Base URL: `https://horusship.com/api/v1`
- Spec: [`openapi.json`](https://horusship.com/api/v1/openapi.json) (OpenAPI 3.1, including every webhook payload)
- Clients: TypeScript SDK (`@horusship/sdk`), Python SDK (`horus-sdk`, import `horus`), CLI
  (`@horusship/cli`, command `horus`), hosted MCP server (`https://horusship.com/mcp`) for AI agents.

## 1. Get an API key

1. Sign in at [horusship.com](https://horusship.com).
2. **Settings → API → Create key.** Name it, pick the scopes it needs (for a first try,
   `account:read listings:read sales:read`), and create it.
3. Copy the key (`ak_…`). It's shown only once. Store it as an environment variable:

```sh
export HORUS_API_KEY=ak_0123456789abcdef_…
```

Treat it like a password. Anyone with the key can do whatever its scopes allow. See
[Authentication](authentication.md) for scopes, OAuth and the CLI login.

## 2. Make your first call

`GET /me` returns the user and the key's scopes.

### curl

```sh
curl -s https://horusship.com/api/v1/me \
  -H "Authorization: Bearer $HORUS_API_KEY"
```

```json
{ "object": "user", "id": "cm…", "email": "you@example.com", "name": "You", "avatar_url": null,
  "credential": { "kind": "api_key", "id": "eak_…", "scopes": ["account:read", "listings:read", "sales:read"], "client_id": null } }
```

### TypeScript

```sh
npm install @horusship/sdk
```

```ts
import { Horus } from "@horusship/sdk";

const horus = new Horus(); // reads HORUS_API_KEY
const me = await horus.me.get();
console.log(me.email, me.credential.scopes);

// The last 5 sales
const sales = await horus.sales.list({ limit: 5 });
for (const s of sales.data) console.log(s.sold_at, s.product_name, s.status, s.amounts.profit?.amount);
```

### Python

```sh
pip install horus-sdk
```

```python
from horus import Horus

client = Horus()  # reads HORUS_API_KEY
me = client.me.get()
print(me.email, me.credential.scopes)

for sale in client.sales.list(limit=5).data:
    print(sale.sold_at, sale.product_name, sale.status)
```

### CLI

```sh
npm install -g @horusship/cli
horus login            # or: export HORUS_API_KEY=ak_…
horus me get --json
horus sales list --limit 5
```

## 3. Do something useful

List two products on eBay. You need a listing group and a connected eBay account:

```sh
horus groups listings list --json        # pick a group id
horus ebay accounts list --json          # pick an eBay account id
```

```ts
const batch = await horus.listings.create({
  group_id: "cm_group…",
  ebay_account_ids: ["cm_ebay…"],
  items: ["B07ABC1234", "https://www.amazon.com/dp/B09XYZ5678"],
});
// 202 Accepted: listings start PENDING and go LISTED (or FAILED) within minutes
console.log(batch.created_count, batch.skipped);
```

Poll `GET /listings?ids=<id1>,<id2>` or subscribe to the `listing.created` / `listing.failed`
[webhooks](webhooks.md).

## 4. Things to know early

- **Some actions run on your Horus Desktop app** (signing buyer accounts in, checking sessions,
  reading source orders, starting returns). They return `202` with a **job**. Follow it with
  `GET /jobs/{id}`. If the desktop app isn't running you get `503 desktop_offline`.
- **Lists are cursor-paginated** and **writes accept `Idempotency-Key`**. See
  [Pagination, errors and idempotency](pagination-errors-idempotency.md).
- **Rate limits**: 600 reads and 120 writes per minute per key.
- **Money** is always `{ "amount": 12.34, "currency": "USD" }`. **Times** are ISO-8601 UTC.
- Building with an AI agent? Read [Agents](agents.md).

## Next

- [Authentication](authentication.md): keys, scopes, OAuth, the CLI login
- [Pagination, errors and idempotency](pagination-errors-idempotency.md)
- [Webhooks](webhooks.md)
- [Agents: MCP, skills and the CLI](agents.md)
- [Examples](examples/)
