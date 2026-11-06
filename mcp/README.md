# Horus MCP server

Horus hosts a remote [Model Context Protocol](https://modelcontextprotocol.io) server at

```
https://horusship.com/mcp
```

Streamable HTTP. Sign in with OAuth (your MCP client opens a Horus sign-in page) or send a
Horus API key as `Authorization: Bearer <key>`. Every tool runs through the same public API,
with the same scopes, validation and idempotency.

## Connect

**Claude Code**

```bash
claude mcp add --transport http horus https://horusship.com/mcp
# or with an API key:
claude mcp add --transport http horus https://horusship.com/mcp --header "Authorization: Bearer $HORUS_API_KEY"
```

**Claude (claude.ai / Desktop)**: Settings → Connectors → Add custom connector → `https://horusship.com/mcp`.

**Cursor** (`~/.cursor/mcp.json`):

```json
{ "mcpServers": { "horus": { "url": "https://horusship.com/mcp" } } }
```

Any other client: point it at the URL; it discovers the authorization server from
`https://horusship.com/.well-known/oauth-protected-resource/mcp`.

## Tools

By default the server lists a compact set of everyday tools plus two meta tools that reach
every operation:

- `horus_search_operations` — find an operation by keyword and get its input schema
- `horus_call` — call any operation by name (e.g. `sales_ship`)

Tool names are the API's operationIds with dots replaced by underscores
(`listings.list` → `listings_list`). Choose what is listed with query parameters:

| URL | Lists |
|---|---|
| `/mcp` | core tools + meta tools |
| `/mcp?toolsets=sales,listings` | core + every sales and listings tool |
| `/mcp?toolsets=all` | every operation (~176 tools) |
| `/mcp?toolsets=none` | only the meta tools |
| `/mcp?read_only=true` | reads only; `horus_call` refuses writes |

Tools are also filtered by the scopes your token or key carries.

Operations that need Horus Desktop (sign-ins, checkout, order scraping) return a job; if the
desktop is closed they fail with `desktop_offline` and you get a notification to open it.

## Resources and prompts

Resources: the OpenAPI document, your account, today's dashboard, recent and held sales,
recent listings. Prompts: `daily_check_in`, `triage_held_sales`, `source_to_list`.

Pair the server with the [agent skills](../skills) for best results.
