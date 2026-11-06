# Horus agent skills

Agent Skills that teach an AI agent to run a Horus store well. Each skill is a folder with
a `SKILL.md` (YAML frontmatter `name` + `description`, then instructions) and optional `references/`
and `scripts/`. The agent loads a skill only when its description matches the task.

| Skill | Use it for |
|---|---|
| [`horus-operator`](horus-operator/SKILL.md) | **Install this one first.** What Horus is, connecting (MCP / CLI / SDK / HTTP), the object model, finding the right operation, desktop jobs, errors, idempotency, rate limits, safety rules. |
| [`horus-daily-checkin`](horus-daily-checkin/SKILL.md) | "How's my store?": desktop, sessions, eBay accounts, held/stuck sales, tracking, returns, messages, failed listings, leads, today's numbers, as one prioritized summary. |
| [`horus-account-health`](horus-account-health/SKILL.md) | Buyer accounts (signed out, sign-in, Amazon password reset, cards, proxies, OTP inboxes) and eBay accounts (reconnect, onboarding, policies, ship-from, seller risk). |
| [`horus-source-and-list`](horus-source-and-list/SKILL.md) | Candidates, community feed, crawls, pricing preview, creating listings (ASIN / URL / bulk / bundles), failures and retries. |
| [`horus-leads`](horus-leads/SKILL.md) | Work the leads inbox: evaluate, claim, list, dismiss. |
| [`horus-fulfillment`](horus-fulfillment/SKILL.md) | The sale lifecycle: wait vs act, held sales, manual purchase and linking, tracking, cancellations. |
| [`horus-returns-messages`](horus-returns-messages/SKILL.md) | Returns and refunds, buyer message drafts and replies, VeRO notices. |
| [`horus-webhooks`](horus-webhooks/SKILL.md) | Endpoints, event choice, signature verification, debugging, replay, simple automations. |

On the hosted MCP server, tools not in the default list are reached through `horus_call` (the
`horus-operator` skill explains this), or connect with `?toolsets=all`.

The skills work with any of the Horus surfaces and say how to do each step with **MCP tools first**
(`https://horusship.com/mcp`, tools like `sales_list`), then the **CLI** (`horus … --json`), with the
SDKs (`@horusship/sdk`, Python `horus`) for code.

## Install

### Claude Code

Copy (or symlink) the skill folders into your personal or project skills directory:

```sh
# personal: available in every project
cp -r skills/horus-* ~/.claude/skills/
# or project-only: commit them with the repo
mkdir -p .claude/skills && cp -r skills/horus-* .claude/skills/
```

Then connect Horus: `claude mcp add --transport http horus https://horusship.com/mcp` (it signs you in
with OAuth on first use), or install the CLI (`npm i -g @horusship/cli && horus login`). Ask
"run my Horus check-in" and the skills load on their own.

### claude.ai and Claude Desktop

1. Zip each skill folder on its own, with the folder at the top of the zip (`horus-operator.zip` contains
   `horus-operator/SKILL.md`, …).
2. **Settings → Capabilities → Skills → Upload skill**, once per zip. Code execution must be enabled for skills.
3. Add the Horus connector: **Settings → Connectors → Add custom connector →**
   `https://horusship.com/mcp`, then sign in.

### Claude API / Agent SDK

Upload the folders through the Skills API (or put them in the Agent SDK's skills directory), and give the
agent either the Horus MCP server or a shell with `HORUS_API_KEY` set and the `horus` CLI installed.
For unattended runs use an API key with only the scopes the job needs (see
`horus-operator/references/connecting.md`).

### Other agents (Cursor, Codex, custom)

The skills are plain Markdown. Either:

- point the agent at the folder and tell it to read `horus-operator/SKILL.md` first and the
  relevant workflow skill for the task, or
- paste `horus-operator/SKILL.md` into the system prompt / `AGENTS.md` and keep the rest as files it can open.

Give it the MCP server if it speaks MCP. Otherwise give it the CLI with `HORUS_API_KEY`.

## Maintaining

The spec-derived references are generated, and everything is checked against the OpenAPI document:

```sh
node skills/scripts/generate-references.mjs   # rewrite operations.md + events.md from openapi/openapi.json
node skills/scripts/validate.mjs              # frontmatter, links, every op/tool/CLI/event name exists
node skills/scripts/validate.mjs --coverage   # also list operations no skill mentions
node --test skills/scripts/scripts.test.mjs  # tests for the tooling
```

`--spec https://horusship.com/api/v1/openapi.json` validates against the live API instead of the pinned
copy. Run the generator and validator whenever `openapi/openapi.json` is re-pinned. CI should fail on a
non-zero exit.

Writing rules for these skills: lead with MCP tool names, give the CLI as fallback, keep `SKILL.md`
short and move detail into `references/`, and put a confirmation step before anything that spends
money, can't be undone, or reaches a buyer.
