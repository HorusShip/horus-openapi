#!/usr/bin/env node
// Validates the Horus agent skills.
//
//   node skills/scripts/validate.mjs [--spec <path|url>] [--root <skills dir>] [--docs <docs dir>] [--coverage]
//
// Checks:
//   1. Every skill folder has SKILL.md with valid YAML frontmatter: `name` (matches the folder,
//      lowercase letters/digits/hyphens, ≤64 chars) and `description` (non-empty, ≤1024 chars, no
//      angle brackets), and no unknown keys. SKILL.md bodies stay under 500 lines.
//   2. Relative links in every .md file resolve to files that exist.
//   3. Every operation / MCP tool / CLI command / webhook event a skill or doc mentions exists in the
//      OpenAPI document:
//        - dotted ids in code spans (`sales.markRefunded`, `listing.failed`, `sale.*`)
//        - MCP tool names (`sales_markRefunded`, `ebay_accounts_list`)
//        - CLI commands (`horus sales mark-refunded <id> --json`)
//      A token is only checked when it is shaped like one of those (its first segment is an API area
//      or event area), so field names (`session_valid`) and error codes (`desktop_offline`) pass.
// Exit code 1 when anything fails.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { SKILLS_DIR, DEFAULT_SPEC, loadSpec, operations, events, cliWords } from "./lib.mjs";

const ALLOWED_KEYS = new Set(["name", "description", "license", "allowed-tools", "metadata", "compatibility"]);
/** SDK helpers that are not API operations but are documented SDK methods. */
const SDK_HELPERS = new Set(["jobs.wait", "webhooks.verify", "webhooks.unwrap", "webhooks.constructEvent"]);
/** CLI commands that are not API operations. */
const CLI_BUILTINS = new Set(["login", "logout", "api", "whoami", "config", "help", "version", "completion", "--version", "--help"]);

const argValue = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const ROOT = resolve(argValue("root") ?? SKILLS_DIR);

const errors = [];
const fail = (file, msg) => errors.push(`${relative(ROOT, file) || file}: ${msg}`);

// ---------- spec index ----------
const spec = await loadSpec(argValue("spec") ?? DEFAULT_SPEC);
const ops = operations(spec);
const opIds = new Set(ops.map((o) => o.id));
const tools = new Set(ops.map((o) => o.tool));
const cli = new Map(ops.map((o) => [cliWords(o.id), o.id]));
const opPrefixes = new Set(ops.map((o) => o.id.split(".")[0]));
const opVerbs = new Set(ops.map((o) => o.id.split(".").pop()));
const eventTypes = new Set(events(spec).map((e) => e.type));
const eventAreas = new Set([...eventTypes].map((t) => t.split(".")[0]));

// ---------- files ----------
function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name.startsWith(".")) continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (name.endsWith(".md")) out.push(p);
    }
    return out;
}

const docsDir = resolve(argValue("docs") ?? resolve(ROOT, "..", "docs"));
const mdFiles = [...walk(ROOT), ...(existsSync(docsDir) ? walk(docsDir) : [])];

// ---------- 1. frontmatter ----------
function parseFrontmatter(text) {
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
    if (!m) return null;
    const fields = {};
    let current = null;
    for (const line of m[1].split(/\r?\n/)) {
        const kv = /^([A-Za-z][\w-]*):\s?(.*)$/.exec(line);
        if (kv) { current = kv[1]; fields[current] = kv[2].trim(); }
        else if (current && /^\s+\S/.test(line)) fields[current] += ` ${line.trim()}`;
        else if (line.trim()) return { error: `unparseable frontmatter line: ${line}` };
    }
    for (const k of Object.keys(fields)) fields[k] = fields[k].replace(/^(["'])([\s\S]*)\1$/, "$2");
    return { fields, bodyLines: text.slice(m[0].length).split(/\r?\n/).length };
}

const skillDirs = readdirSync(ROOT).filter((d) => d !== "scripts" && statSync(join(ROOT, d)).isDirectory());
for (const dir of skillDirs) {
    const file = join(ROOT, dir, "SKILL.md");
    if (!existsSync(file)) { fail(join(ROOT, dir), "missing SKILL.md"); continue; }
    const fm = parseFrontmatter(readFileSync(file, "utf8"));
    if (!fm) { fail(file, "missing YAML frontmatter (--- … ---)"); continue; }
    if (fm.error) { fail(file, fm.error); continue; }
    const { name, description } = fm.fields;
    for (const k of Object.keys(fm.fields)) if (!ALLOWED_KEYS.has(k)) fail(file, `unknown frontmatter key "${k}"`);
    if (!name) fail(file, "frontmatter `name` missing");
    else {
        if (name !== dir) fail(file, `name "${name}" must match folder "${dir}"`);
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64) fail(file, `name "${name}" must be lowercase-hyphenated, ≤64 chars`);
        if (/anthropic|claude/.test(name)) fail(file, "name must not contain reserved words");
    }
    if (!description) fail(file, "frontmatter `description` missing");
    else {
        if (description.length > 1024) fail(file, `description is ${description.length} chars (max 1024)`);
        if (/[<>]/.test(description)) fail(file, "description must not contain < or >");
        if (!/\buse (when|whenever|for)\b/i.test(description)) fail(file, "description should say when to use the skill (\"Use when …\")");
    }
    if (fm.bodyLines > 500) fail(file, `SKILL.md body is ${fm.bodyLines} lines (keep under 500; move detail to references/)`);
}

// ---------- 2 + 3. links and names ----------
const seen = { ops: new Set(), events: new Set() };

function checkLinks(file, text) {
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = m[1].split("#")[0];
        if (!target || /^[a-z]+:/i.test(target)) continue;
        if (!existsSync(resolve(dirname(file), target))) fail(file, `broken link ${m[1]}`);
    }
}

function checkDotted(file, token) {
    const segs = token.split(".");
    if (segs.some((s) => !/^[A-Za-z_*]+$/.test(s))) return;
    if (opIds.has(token)) { seen.ops.add(token); return; }
    if (eventTypes.has(token)) { seen.events.add(token); return; }
    if (segs.length === 2 && segs[1] === "*" && eventAreas.has(segs[0])) return;
    if (SDK_HELPERS.has(token)) return;
    const looksLikeEvent = segs.length === 2 && eventAreas.has(segs[0]) && /^[a-z_*]+$/.test(segs[1]);
    const looksLikeOp = opPrefixes.has(segs[0]) && segs.every((s) => /^[a-z][a-zA-Z]*$/.test(s));
    if (looksLikeEvent) fail(file, `unknown webhook event \`${token}\``);
    else if (looksLikeOp) fail(file, `unknown operationId \`${token}\``);
}

/** Areas whose names also start ordinary field / object names (`account_id`, `desktop_status`, `studio_template_id`). */
const AMBIGUOUS_PREFIXES = new Set(["account", "ebay", "desktop", "me", "settings", "sourcing", "studio"]);

function checkTool(file, token) {
    if (tools.has(token)) { seen.ops.add(token.replace(/_/g, ".")); return; }
    const segs = token.split("_");
    if (segs.length < 2 || !opPrefixes.has(segs[0])) return;
    // Unambiguous areas (`sales_…`, `listings_…`): any such token must be a tool. Ambiguous ones only
    // when they end in an operation verb (`ebay_accounts_frobnicate` is not caught, `ebay_accounts_lst` neither).
    if (!AMBIGUOUS_PREFIXES.has(segs[0]) || opVerbs.has(segs[segs.length - 1])) {
        fail(file, `unknown MCP tool \`${token}\``);
    }
}

function checkCli(file, span) {
    const words = [];
    for (const w of span.trim().split(/\s+/).slice(1)) {
        if (/^[-<@"'{[|>]/.test(w) || /[=/:@]/.test(w)) break;
        words.push(w);
    }
    if (words.length === 0 || CLI_BUILTINS.has(words[0])) return;
    const cmd = words.join(" ");
    for (let n = words.length; n >= 1; n--) {
        const prefix = words.slice(0, n).join(" ");
        if (cli.has(prefix)) { seen.ops.add(cli.get(prefix)); return; }
    }
    fail(file, `unknown CLI command \`horus ${cmd}\``);
}

function checkSpan(file, span) {
    if (/^horus\s+[a-z-]/.test(span.trim())) { checkCli(file, span); return; }
    for (const m of span.matchAll(/[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_*][A-Za-z0-9_*]*)+|\b[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+\b/g)) {
        const token = m[0];
        if (token.includes(".")) checkDotted(file, token);
        else checkTool(file, token);
    }
}

/** Generated from the spec by generate-references.mjs: consistent by construction, not counted for coverage. */
const GENERATED = new Set(["horus-operator/references/operations.md", "horus-webhooks/references/events.md"].map((p) => resolve(ROOT, p)));

for (const file of mdFiles) {
    const text = readFileSync(file, "utf8");
    checkLinks(file, text);
    if (GENERATED.has(file)) continue;
    const fenced = [];
    const prose = text.replace(/```[\s\S]*?```/g, (block) => { fenced.push(block); return ""; });
    for (const m of prose.matchAll(/`([^`\n]+)`/g)) checkSpan(file, m[1]);
    // In code blocks only check call-shaped MCP tool names (`jobs_get(…)`) and CLI lines.
    for (const block of fenced) {
        for (const m of block.matchAll(/\b([a-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+)\(/g)) checkTool(file, m[1]);
        for (const line of block.split(/\r?\n/)) {
            const cliLine = /^\s*(?:\$\s*)?(horus\s+[a-z][^#]*)/.exec(line);
            if (cliLine) checkCli(file, cliLine[1]);
        }
    }
}

// ---------- report ----------
console.log(`skills: ${skillDirs.length}  markdown files: ${mdFiles.length}`);
console.log(`spec: ${ops.length} operations, ${eventTypes.size} events`);
console.log(`referenced: ${seen.ops.size} operations, ${seen.events.size} events`);
if (process.argv.includes("--coverage")) {
    const missing = ops.filter((o) => !seen.ops.has(o.id)).map((o) => o.id);
    console.log(`operations no skill or doc mentions (${missing.length}):\n  ${missing.join("\n  ")}`);
}
if (errors.length) {
    console.error(`\n${errors.length} problem(s):\n  ${errors.join("\n  ")}`);
    process.exit(1);
}
console.log("OK");
