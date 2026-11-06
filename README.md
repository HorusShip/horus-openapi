# Horus SDKs, CLI and agent skills

Everything here is built from the Horus public API's OpenAPI document
(`https://horusship.com/api/v1/openapi.json`, source of truth in
`horus-backend/src/api/public`). Auth: `horus-backend/docs/public-api/AUTH.md`.

| Path | Package | What |
|---|---|---|
| `packages/sdk` | `@horusship/sdk` (npm) | TypeScript SDK |
| `packages/cli` | `@horusship/cli` (npm, binary `horus`) | CLI |
| `python` | `horus-sdk` (PyPI, import `horus`) | Python SDK (sync + async) |
| `skills` | — | Agent skills for operating Horus |
| `openapi` | — | Pinned copy of the spec the SDKs are generated from |
