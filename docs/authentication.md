# Authentication

Every request to `https://horusship.com/api/v1` carries a credential in the `Authorization`
header:

```http
Authorization: Bearer <credential>
```

The API never reads cookies. There are three kinds of credential:

| Credential | Looks like | Use it for |
|---|---|---|
| **API key** | `ak_<16 hex>_<secret>` | Your own scripts, servers, CI, the SDKs, unattended agents |
| **OAuth access token** | a JWT | The `horus` CLI, MCP clients (Claude, etc.), apps that act for other Horus users |
| Legacy token | `horus_pat_…` | Integrations created before API keys; they keep working |

## API keys

Create keys in a signed-in browser: **horusship.com → Settings → API**. Choose a name and
the scopes the key needs. The key is shown **once**, so store it in a secret manager or an environment
variable (`HORUS_API_KEY` is what the SDKs and CLI read).

- A key can't create, list or revoke keys. That always needs you signed in to the website
  (`403 interactive_session_required`).
- Revoke a key on the same page. Revocation takes effect within seconds.
- Use one key per integration, with only the scopes it needs. When something leaks, you rotate one key.

## Scopes

Scopes are `<area>:read` or `<area>:write`. Write includes read for the same area.

| Area | Covers |
|---|---|
| `account` | Your profile, plan, usage, the notification feed |
| `accounts` | Buyer accounts, their cards, desktop jobs, buyer-account groups |
| `ebay` | Connected eBay seller accounts, policies, locations, campaigns, seller metrics |
| `listings` | Listings, listing groups, brand blacklist |
| `sales` | Sales, eBay orders awaiting fulfilment, source orders |
| `returns` | Returns, refunds (`mark_refunded`) |
| `sourcing` | Seeds, crawls, candidates, the community feed, sourcing config |
| `leads` | Your leads |
| `messages` | Buyer messages and replies |
| `settings` | App settings, VeRO protection settings |
| `proxies` | Proxies and proxy groups |
| `inboxes` | OTP inboxes (IMAP, Gmail, Outlook) |
| `studio` | Studio templates and assets |
| `analytics` | Dashboard, per-SKU profit, eBay traffic |
| `webhooks` | Webhook endpoints, deliveries, events |
| `desktop` | Horus Desktop status, paired installs |

Each operation in the [OpenAPI document](https://horusship.com/api/v1/openapi.json) lists its scopes in
`x-horus-scopes`. A credential without them gets:

```json
{ "error": { "type": "permission", "code": "insufficient_scope",
             "message": "This credential needs sales:write.", "details": { "required": ["sales:write"] } } }
```

`GET /me` (any scope) tells you which scopes your credential has.

## OAuth (CLI, agents, apps)

Horus sign-in is an OAuth 2.1 authorization server with PKCE, device flow, refresh tokens and dynamic
client registration. **Don't hard-code its URLs.** Discover them:

1. `GET https://horusship.com/.well-known/oauth-protected-resource/mcp` (or a `401` from the API or MCP
   server, whose `WWW-Authenticate` header carries `resource_metadata="…"`) → `authorization_servers[0]`
   is the issuer.
2. `GET <issuer>/.well-known/openid-configuration` → `authorization_endpoint`, `token_endpoint`,
   `device_authorization_endpoint`, `registration_endpoint`, `revocation_endpoint`.

Request scopes from the table above (space-separated), plus `offline_access` if you want a refresh token.
Always send the **resource** you want a token for:

| Resource | Value |
|---|---|
| REST API | `resource=https://horusship.com/api/v1` |
| MCP server | `resource=https://horusship.com/mcp` |

A token issued without `resource` isn't valid for Horus. Access tokens last one hour. Refresh tokens
rotate, so store the new one every time you refresh (reusing an old one ends the session).

### The `horus` CLI

```sh
horus login            # device flow: shows a code and a link, works over SSH
horus login --browser  # opens your browser, redirects back to 127.0.0.1
horus logout           # revokes the refresh token
```

Tokens are kept in your OS keychain. `HORUS_API_KEY=ak_…` overrides login, which is useful in CI.

### AI agents and MCP clients

MCP clients (Claude Code, claude.ai, Claude Desktop, others) handle OAuth on their own: add
`https://horusship.com/mcp`, sign in, approve the scopes. See [Agents](agents.md).

### Your own app (acting for other Horus users)

Register a client (dynamic registration at `registration_endpoint`, or a Client ID Metadata Document,
which is a URL you host that serves your client's metadata and that you use as the `client_id`). Then
run the authorization-code flow with PKCE (`code_challenge_method=S256`):

```
GET {authorization_endpoint}?response_type=code&client_id=…&redirect_uri=…
    &scope=openid offline_access listings:read sales:read
    &resource=https://horusship.com/api/v1
    &code_challenge=…&code_challenge_method=S256&state=…
```

Users see a consent screen that lists the scopes. Exchange the code at `token_endpoint` with
`grant_type=authorization_code` and the `code_verifier`.

Not supported: the `client_credentials` grant (there's no machine-only access, because every token acts for a
user) and DPoP-bound tokens (send plain `Bearer`).

## Authentication errors

| Status | `code` | Meaning |
|---|---|---|
| 401 | `missing_credentials` | No `Authorization: Bearer` header |
| 401 | `invalid_api_key` | Unknown, expired or revoked key |
| 401 | `invalid_access_token` | Bad, expired or wrong-audience token (missing `resource`?) |
| 401 | `account_not_linked` | The person has never signed in to horusship.com. Sign in once. |
| 403 | `discord_link_required` | The Horus account needs its Discord linked |
| 403 | `account_suspended` | The account is suspended |
| 403 | `insufficient_scope` | Missing scopes, listed in `details.required` |
| 403 | `interactive_session_required` | Only possible from the signed-in website |
