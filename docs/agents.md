# Horus for AI agents

An AI agent can run a Horus store: check that everything is healthy, fix signed-out accounts, work
leads, list products, chase stuck orders, draft buyer replies, react to webhooks. There are three
pieces:

| Piece | What it gives the agent |
|---|---|
| **Hosted MCP server**, `https://horusship.com/mcp` | Every API operation as a tool, with Horus sign-in (OAuth) built in |
| **Agent skills** (`skills/` in the SDK repo) | The know-how: which tools to call in what order, when to wait, what needs your confirmation |
| **CLI**, `horus … --json` | The same operations from a shell, for agents that run commands instead of MCP |

## 1. Connect the MCP server

**Claude Code**

```sh
claude mcp add --transport http horus https://horusship.com/mcp
```

The first tool call opens your browser to sign in to Horus and approve scopes.

**claude.ai / Claude Desktop**: Settings → Connectors → Add custom connector → `https://horusship.com/mcp` → sign in.

**Any other MCP client**: give it the URL. The server advertises its OAuth metadata (RFC 9728), so
clients that support MCP authorization discover the sign-in server, register themselves and run the
flow automatically. For a client without OAuth, configure a static header with an API key:
`Authorization: Bearer ak_…`.

### Tools

Tools are named after API operations, with dots turned into underscores:

| Operation | MCP tool | CLI |
|---|---|---|
| `sales.list` | `sales_list` | `horus sales list` |
| `sales.ship` | `sales_ship` | `horus sales ship <id>` |
| `accounts.verifyBulk` | `accounts_verifyBulk` | `horus accounts verify-bulk` |
| `ebay.accounts.connect` | `ebay_accounts_connect` | `horus ebay accounts connect` |

Tool arguments are the operation's path parameters, query parameters and body fields at the top level.

About 180 tools would flood an agent's context, so by default the server lists a small **core** set
(the everyday reads) plus two meta tools that reach everything: `horus_search_operations` (find an
operation by keywords and get its input schema) and `horus_call` (call any operation by name, with an
optional `idempotency_key`). To list more tools directly, add toolsets to the URL:
`https://horusship.com/mcp?toolsets=sales,listings` or `?toolsets=all`. Add `&read_only=true` for an
agent that must never write. The server also has resources (`horus://dashboard`, `horus://sales/held`, …)
and prompts (`daily_check_in`, `triage_held_sales`, `source_to_list`).

Tools that need a scope your sign-in didn't grant fail with `insufficient_scope`, and the client can ask you
to approve more.

### Scopes for agents

Grant what the agent's job needs. A read-only check-in agent needs `account:read accounts:read
ebay:read listings:read sales:read returns:read messages:read leads:read analytics:read desktop:read`.
A full operator gets every area's `:write`. See [Authentication](authentication.md#scopes).

## 2. Install the skills

The skills are folders of Markdown, one per routine:

| Skill | Does |
|---|---|
| `horus-operator` | The base: object model, naming, desktop jobs, errors, idempotency, safety rules |
| `horus-daily-checkin` | A prioritized "what needs me today" summary |
| `horus-account-health` | Fixes buyer accounts and eBay accounts |
| `horus-source-and-list` | Sourcing and listing, pricing preview, failures |
| `horus-leads` | Works the leads inbox |
| `horus-fulfillment` | Stuck, held and failed sales, tracking, cancellations |
| `horus-returns-messages` | Returns, refunds, buyer replies, VeRO notices |
| `horus-webhooks` | Endpoints, verification, replay, automations |

**Claude Code**: copy them into `~/.claude/skills/` (every project) or `.claude/skills/` (one repo).
**claude.ai**: zip each folder and upload it under Settings → Capabilities → Skills. **Other agents**: have the
agent read `skills/horus-operator/SKILL.md` first. Full instructions are in `skills/README.md`.

Then just ask: "run my Horus check-in", "list these 40 ASINs on my main eBay account", "why is
the Dyson order stuck?", "draft replies to today's messages".

## 3. Or use the CLI

For agents with a shell (CI jobs, coding agents, cron):

```sh
npm install -g @horusship/cli
export HORUS_API_KEY=ak_…            # or: horus login
horus desktop status get --json
horus sales list --held true --json
horus api POST /accounts/verify --data '{"group_id":"cm…"}'   # any endpoint
```

`--json` prints the raw API response, which is what an agent should parse.

## What agents are careful about

The skills build these rules in. If you write your own agent, copy them:

- **Confirm before** anything that spends money (buying an order, releasing a held sale), can't be undone
  (ending or deleting listings, cancelling sales, disconnecting eBay), or reaches a buyer (sending a message).
- **Desktop jobs** (`202` + `job`) run on your Horus Desktop app. The agent follows them with `jobs_get` and
  stops on `503 desktop_offline`. It can't start the app for you.
- **Idempotency keys** on every write it might retry, so nothing happens twice.
- **No secrets in chat**: passwords, cards, API keys and webhook secrets are never echoed back, and the
  API never returns them anyway.
- **Honest limits**: some things are only possible in eBay Seller Hub, the source store, or the desktop app,
  and the agent says so instead of improvising.

## Unattended agents

For a scheduled agent (for example a morning check-in posted to your chat):

1. Create an API key with only the scopes it needs (read-only for a report).
2. Run the agent with the skills and `HORUS_API_KEY`, and prompt it with "Run the horus-daily-checkin skill and post the summary".
3. Add a [webhook](webhooks.md) for the urgent events between runs: `desktop.offline`,
   `ebay_account.token_expired`, `sale.held`, `account.session_lost`.

Runnable versions of common automations are in [examples/](examples/).
