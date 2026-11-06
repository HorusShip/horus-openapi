# Connecting to Horus

All surfaces talk to the same API, `https://horusship.com/api/v1`. Every credential carries
**scopes** (`<area>:read` / `<area>:write`), and write implies read for the same area. Areas: `account`, `accounts`,
`ebay`, `listings`, `sales`, `returns`, `sourcing`, `leads`, `messages`, `settings`, `proxies`,
`inboxes`, `studio`, `analytics`, `webhooks`, `desktop`.

Suggested scope sets:

| Use | Scopes |
|---|---|
| Read-only daily check-in | `account:read accounts:read ebay:read listings:read sales:read returns:read messages:read leads:read analytics:read desktop:read` |
| Full operator agent | every area `:write` |
| Listing bot | `listings:write sourcing:write leads:write ebay:read accounts:read` |
| Support bot (messages + returns) | `messages:write returns:write sales:read` |

## MCP (hosted)

Server URL: `https://horusship.com/mcp` (streamable HTTP).

- **Claude Code**: `claude mcp add --transport http horus https://horusship.com/mcp`. On first use
  it opens a browser to sign in to Horus and approve the scopes (OAuth 2.1 with PKCE).
- **claude.ai / Claude Desktop**: Settings → Connectors → Add custom connector → URL
  `https://horusship.com/mcp`, then sign in.
- **Other MCP clients**: point them at the URL. OAuth discovery is automatic (protected-resource
  metadata → Horus's sign-in server, dynamic client registration is on). For clients without OAuth,
  send `Authorization: Bearer ak_…` with an API key.

Tool names are operationIds with dots replaced by underscores (`sales.ship` → `sales_ship`). A tool
call without the scope it needs fails with `insufficient_scope`. The client can then ask the user to
approve more scopes.

What the server lists depends on the URL:

| URL | Tools listed |
|---|---|
| `https://horusship.com/mcp` | `core` (about 12 everyday read tools) + `horus_search_operations` + `horus_call` |
| `…/mcp?toolsets=sales,listings` | those areas' tools + the meta tools |
| `…/mcp?toolsets=all` | every operation as its own tool (~180, so heavy on context) |
| `…/mcp?toolsets=none` | meta tools only |
| add `&read_only=true` | only reads; `horus_call` refuses writes |

Lists are filtered to the credential's scopes too. Every operation stays reachable through `horus_call`.
The server also offers resources (`horus://me`, `horus://dashboard`, `horus://sales/held`,
`horus://operations/{tool}` for one operation's schema, plus the OpenAPI document) and prompts
(`daily_check_in`, `triage_held_sales`, `source_to_list`).

## CLI

```sh
npm install -g @horusship/cli     # binary: horus
horus login                        # device code: shows a code + URL, works over SSH
horus login --browser              # opens the browser on this machine
horus me get --json                # who am I, which scopes
```

`HORUS_API_KEY=ak_…` skips login entirely (CI, scripts, agents). Every command takes `--json` and
prints the raw API response, which is what an agent should parse. `horus api <METHOD> <path>
[--data '<json>']` calls any endpoint, which helps when a command isn't there yet.

## API keys

Created only in a signed-in browser: **horusship.com → Settings → API**. Pick the scopes, copy the
key (`ak_…`, shown once). A key can't create or revoke keys. Revoke from the same page. Old
`horus_pat_…` tokens keep working.

## SDKs

```ts
import { Horus } from "@horusship/sdk";
const horus = new Horus({ apiKey: process.env.HORUS_API_KEY });
const me = await horus.me.get();
```

```python
from horus import Horus
client = Horus()  # reads HORUS_API_KEY
me = client.me.get()
```

Both retry 429 / 5xx with one idempotency key per write, page lists for you (iterate the result of a
`list` call), wait for desktop jobs (`jobs.wait(job)`), and verify webhook signatures (TypeScript
`verifyWebhook(rawBody, headers, secret)`, Python `client.webhooks.verify(raw_body, headers, secret)`).
Errors are typed (`DesktopOfflineError`, `RateLimitError`, `PermissionError` / `PermissionDeniedError`, …).

## Raw HTTP

```sh
curl -s https://horusship.com/api/v1/me -H "Authorization: Bearer $HORUS_API_KEY"
```

Writes: `Content-Type: application/json`, plus `Idempotency-Key: <unique>` when you might retry.
Responses carry `Request-Id` and `RateLimit-Limit` / `-Remaining` / `-Reset`.
