# Changelog: @horusship/cli

## 0.1.0 (unreleased)

First release.

- `horus <resource> <verb>` for every API operation, with help generated from the spec.
- `horus login` (OAuth device flow with issuer discovery, or `--api-key`), `logout` (revokes the refresh token), `whoami`, `--profile`, `HORUS_API_KEY`.
- Output: tables by default, `--json` for machines, `--all` to follow every page, `--wait` for desktop jobs.
- `horus api <METHOD> <path>` passthrough and `horus webhooks verify`.
- Exit codes: 0 ok, 1 API/runtime error, 2 usage error.
