#!/usr/bin/env node
// Regenerates the spec-derived reference files the skills point at:
//   horus-operator/references/operations.md   (every operation, by area)
//   horus-webhooks/references/events.md       (every webhook event)
// Usage: node skills/scripts/generate-references.mjs [--spec <path|url>]
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { SKILLS_DIR, DEFAULT_SPEC, loadSpec, operations, events, cliWords } from "./lib.mjs";

const AREA_TITLES = {
    me: "Credential", account: "Profile and usage", accounts: "Buyer accounts", jobs: "Desktop jobs",
    groups: "Groups", ebay: "eBay seller accounts", ebayOrders: "eBay orders (manual fulfilment)",
    desktop: "Horus Desktop", inboxes: "OTP inboxes", proxies: "Proxies", settings: "Settings",
    listings: "Listings", blacklist: "Brand blacklist / VeRO", studio: "Studio (listing images)",
    sourcing: "Sourcing", leads: "Leads", sales: "Sales", sourceOrders: "Source orders",
    returns: "Returns", messages: "Buyer messages", analytics: "Analytics", notifications: "Notifications",
    webhooks: "Webhooks", events: "Events", eventTypes: "Event types",
};

function operationsMd(spec) {
    const ops = operations(spec);
    const byArea = new Map();
    for (const op of ops) {
        const area = op.id.split(".")[0];
        if (!byArea.has(area)) byArea.set(area, []);
        byArea.get(area).push(op);
    }
    const lines = [
        "# Horus operations",
        "",
        `Generated from the OpenAPI document (version ${spec.info?.version}, ${ops.length} operations) by`,
        "`skills/scripts/generate-references.mjs`. Do not edit by hand.",
        "",
        "Columns: **MCP tool** (call it directly), **CLI** (`horus <words> --json`), **HTTP**, **scopes**,",
        "**async**: `202` = returns a job / batch to follow; `desktop` = needs Horus Desktop online (`503 desktop_offline`).",
        "",
    ];
    for (const [area, list] of byArea) {
        lines.push(`## ${AREA_TITLES[area] ?? area}`, "", "| MCP tool | CLI | HTTP | Scopes | Async | Summary |", "|---|---|---|---|---|---|");
        for (const op of list) {
            const flags = [op.async ? "202" : "", op.desktop ? "desktop" : ""].filter(Boolean).join(", ");
            const summary = op.summary.replace(/\|/g, "\\|");
            lines.push(`| \`${op.tool}\` | \`${cliWords(op.id)}\` | \`${op.method} ${op.path}\` | ${op.scopes.join(", ") || "any"} | ${flags} | ${summary} |`);
        }
        lines.push("");
    }
    return lines.join("\n");
}

function eventsMd(spec) {
    const list = events(spec);
    const lines = [
        "# Horus webhook events",
        "",
        `Generated from the OpenAPI document's \`webhooks\` section (${list.length} events) by`,
        "`skills/scripts/generate-references.mjs`. Payload schemas are in the spec under",
        "`components.schemas.<Schema>`. `data` holds the resource in the same shape the API returns it.",
        "",
        "| Event | When | Payload schema |",
        "|---|---|---|",
    ];
    for (const e of list) lines.push(`| \`${e.type}\` | ${e.summary.replace(/\|/g, "\\|")} | \`${e.schema ?? "?"}\` |`);
    lines.push("", "Subscribe with exact names, area wildcards (`sale.*`) or `*`.", "");
    return lines.join("\n");
}

const specArg = process.argv.indexOf("--spec");
const spec = await loadSpec(specArg > 0 ? process.argv[specArg + 1] : DEFAULT_SPEC);
writeFileSync(resolve(SKILLS_DIR, "horus-operator/references/operations.md"), operationsMd(spec));
writeFileSync(resolve(SKILLS_DIR, "horus-webhooks/references/events.md"), eventsMd(spec));
console.log("wrote horus-operator/references/operations.md and horus-webhooks/references/events.md");
