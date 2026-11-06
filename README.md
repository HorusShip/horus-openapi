# Horus developer tools

Official SDKs, CLI, MCP server config and agent skills for [Horus](https://horusship.com):
everything you can do in the Horus app, from code, a terminal or an AI agent.

| Path | What | Install |
|---|---|---|
| [`packages/sdk`](packages/sdk) | TypeScript SDK | `npm i @horusship/sdk` |
| [`packages/cli`](packages/cli) | `horus` CLI | `npm i -g @horusship/cli` |
| [`python`](python) | Python SDK (sync + async) | `pip install horus-sdk` |
| [`mcp`](mcp) | Hosted MCP server (`https://horusship.com/mcp`) | see README |
| [`skills`](skills) | Agent skills for operating Horus | see README |
| [`docs`](docs) | Getting started, auth, webhooks, agents, examples | |
| [`openapi`](openapi) | The OpenAPI 3.1 spec everything is generated from | |

API reference: https://horusship.com/api/v1/docs · Spec: https://horusship.com/api/v1/openapi.json

Releases are built and published by GitHub Actions with npm provenance, PyPI trusted
publishing and GitHub build attestations, so every package can be traced to the commit and
workflow that built it.

## License

MIT
