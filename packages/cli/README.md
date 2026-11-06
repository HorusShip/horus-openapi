# @horusship/cli

`horus`: the [Horus](https://horusship.com) API from a terminal, a script or an
AI agent. It has a command for every API operation, generated from the OpenAPI
document.

```sh
npm install -g @horusship/cli
horus login                 # browser sign-in (OAuth device flow)
horus listings list --status LISTED
```

## Sign in

```sh
horus login                         # shows a code + URL; approve in the browser (works over SSH)
horus login --api-key ak_…          # or an API key from Settings → API
echo "$KEY" | horus login --api-key -
horus login --profile work          # several accounts side by side
horus whoami
horus logout                        # revokes the refresh token and forgets the profile
```

Credentials are stored per profile in `credentials.json` (file mode 0600) in the OS config directory:
`%APPDATA%\horus` on Windows, `~/Library/Application Support/horus` on macOS, and `$XDG_CONFIG_HOME/horus` or
`~/.config/horus` on Linux. `HORUS_CONFIG_DIR` overrides the location.

`HORUS_API_KEY=ak_…` overrides any stored credential. Other environment variables:
`HORUS_PROFILE`, `HORUS_BASE_URL`, `HORUS_ISSUER` / `HORUS_CLIENT_ID` (OAuth overrides),
`HORUS_WEBHOOK_SECRET`.

## Commands

`horus <resource> [<sub>] <verb> [path args] [--flags]`, mirroring the operationIds
(`accounts.jobs.create` → `horus accounts jobs create`, camelCase → kebab-case):

```sh
horus listings list --status LISTED --limit 50
horus listings list --all --json > listings.json   # every page, one JSON list
horus sales get <id>
horus sales ship <id> --tracking-number 1Z999AA10123456784 --carrier UPS
horus accounts jobs create <id> --kind VERIFY_SESSION --wait
horus listings create --data @batch.json            # body from a file (or - for stdin)
horus webhooks deliveries list <webhook_id> --status failed
```

- Flags are the query params (reads) or the top-level body fields (writes),
  in `--kebab-case` (`--tracking_number` also works). Values are type-checked
  against the spec: numbers, enums, `true`/`false`, arrays (`--items a,b` or
  repeat the flag) and JSON objects.
- `--data <json|@file|->` supplies the whole params/body; individual flags override fields.
- `--wait` polls a 202 desktop job until it finishes (`--wait-timeout`, `--wait-interval`).
  The exit code is 1 if the job fails.
- `horus <resource> --help` and `horus <resource> <verb> --help` show the spec's
  summaries, descriptions, flags, scopes and whether the command needs Horus Desktop.

Raw passthrough for anything else:

```sh
horus api GET /listings --query status=LISTED --query limit=5
horus api POST /listings/validate --data '{"items":["B07ABC1234"]}'
```

Check a webhook signature locally:

```sh
horus webhooks verify --secret whsec_… --payload @body.json \
  --id evt_… --timestamp 1762516800 --signature "v1,…"
```

## For agents and scripts

- `--json` prints the API response exactly as returned (pretty-printed). Lists keep the
  `{ object, data, has_more, next_cursor }` shape, also with `--all`.
- Errors with `--json` go to stdout as
  `{ "error": { status, type, code, message, details, request_id } }`.
  The CLI's own errors use `type: "usage"`.
- Exit codes: `0` ok, `1` API or runtime error (or a failed `--wait` job), `2` usage error.
- Writes send an `Idempotency-Key`. Pass `--idempotency-key <key>` to make a retried command safe across runs.

MIT licensed.
