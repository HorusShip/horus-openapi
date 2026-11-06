# Horus OpenAPI spec and developer docs

The public Horus API is described by one OpenAPI 3.1 document, the source every Horus SDK, the
CLI and the MCP server are generated from.

- Live spec: https://horusship.com/api/v1/openapi.json
- API reference: https://horusship.com/api/v1/docs
- Pinned copy: [`openapi/openapi.json`](openapi/openapi.json)
- Guides: [`docs/`](docs) (getting started, authentication, pagination/errors/idempotency, webhooks, agents, examples)

## Official tools

| Repo | What | Install |
|---|---|---|
| [horus-node](https://github.com/HorusShip/horus-node) | TypeScript / JavaScript SDK | `npm i @horusship/sdk` |
| [horus-python](https://github.com/HorusShip/horus-python) | Python SDK (sync + async) | `pip install horus-sdk` |
| [horus-cli](https://github.com/HorusShip/horus-cli) | `horus` command-line tool | `npm i -g @horusship/cli` |
| [horus-mcp](https://github.com/HorusShip/horus-mcp) | Hosted MCP server for AI agents | `https://horusship.com/mcp` |
| [horus-skills](https://github.com/HorusShip/horus-skills) | Agent skills for operating a Horus store | see repo |

Every release is built and published by GitHub Actions with npm provenance / PyPI trusted
publishing and GitHub build attestations.

## License

MIT
