// Tests for the skills tooling. Run: node --test skills/scripts/scripts.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { SKILLS_DIR, loadSpec, operations, toolName, cliWords } from "./lib.mjs";
import { verifyHorus } from "../horus-webhooks/scripts/verify-signature.mjs";

const VALIDATE = resolve(SKILLS_DIR, "scripts", "validate.mjs");

function runValidate(args) {
    const r = spawnSync(process.execPath, [VALIDATE, ...args], { encoding: "utf8" });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

function fixture(skills) {
    const root = mkdtempSync(join(tmpdir(), "horus-skills-"));
    for (const [dir, body] of Object.entries(skills)) {
        mkdirSync(join(root, dir), { recursive: true });
        writeFileSync(join(root, dir, "SKILL.md"), body);
    }
    return root;
}

test("name helpers", () => {
    assert.equal(toolName("sales.markRefunded"), "sales_markRefunded");
    assert.equal(cliWords("sales.markRefunded"), "sales mark-refunded");
    assert.equal(cliWords("ebay.accounts.cleanupOrphanListings"), "ebay accounts cleanup-orphan-listings");
});

test("spec loads and has the core operations", async () => {
    const ids = new Set(operations(await loadSpec()).map((o) => o.id));
    for (const id of ["me.get", "listings.create", "sales.ship", "jobs.get", "webhooks.create"]) assert.ok(ids.has(id), id);
});

test("the real skills validate", () => {
    const r = runValidate([]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /OK/);
});

test("a good fixture skill passes", () => {
    const root = fixture({
        "good-skill": "---\nname: good-skill\ndescription: Does a thing. Use when the user asks for the thing.\n---\n\nCall `sales_list`, then `sales.ship`, watch `sale.shipped` / `sale.*`, CLI `horus jobs get <id> --json`. Fields like `session_valid`, `ebay.sku`, files like `auto-reply-webhook.ts` and codes like `desktop_offline` are fine.\n",
    });
    try {
        const r = runValidate(["--root", root, "--docs", join(root, "none")]);
        assert.equal(r.code, 0, r.out);
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test("bad names, frontmatter and links are reported", () => {
    const root = fixture({
        "bad-skill": "---\nname: Bad_Skill\ndescription: No trigger here <b>\n---\n\nCall `sales_frobnicate` and `listings.explode`, listen for `sale.exploded`, run `horus sales frobnicate`. See [x](references/missing.md).\n",
        "no-frontmatter": "# nothing\n",
    });
    try {
        const r = runValidate(["--root", root, "--docs", join(root, "none")]);
        assert.equal(r.code, 1, r.out);
        for (const expected of [
            'name "Bad_Skill" must match folder',
            "description must not contain < or >",
            "description should say when to use",
            "unknown MCP tool `sales_frobnicate`",
            "unknown operationId `listings.explode`",
            "unknown webhook event `sale.exploded`",
            "unknown CLI command `horus sales frobnicate`",
            "broken link references/missing.md",
            "missing YAML frontmatter",
        ]) assert.ok(r.out.includes(expected), `expected "${expected}" in:\n${r.out}`);
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test("webhook signature verification (node) matches the Standard Webhooks scheme", () => {
    const secret = `whsec_${Buffer.from("test-secret-key-0123456789").toString("base64")}`;
    const id = "evt_test";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ id, type: "webhook.test", data: {} });
    const key = Buffer.from(secret.slice(6), "base64");
    const sig = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
    assert.equal(verifyHorus(secret, { id, timestamp, signature: `v1,${sig}` }, body), true);
    assert.equal(verifyHorus(secret, { id, timestamp, signature: `v1,bogus v1,${sig}` }, body), true, "any of several signatures");
    assert.equal(verifyHorus(secret, { id, timestamp, signature: `v1,${sig}` }, `${body} `), false, "tampered body");
    assert.equal(verifyHorus(secret, { id, timestamp: String(Number(timestamp) - 3600), signature: `v1,${sig}` }, body), false, "stale timestamp");
});

test("webhook signature verification (python) agrees with node", (t) => {
    const py = spawnSync("python", ["--version"], { encoding: "utf8" });
    if (py.status !== 0) { t.skip("python not installed"); return; }
    const secret = `whsec_${Buffer.from("another-key").toString("base64")}`;
    const id = "evt_py";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const dir = mkdtempSync(join(tmpdir(), "horus-wh-"));
    const bodyFile = join(dir, "body.json");
    const body = '{"id":"evt_py","type":"sale.shipped","data":{"sale":{"id":"s1"}}}';
    writeFileSync(bodyFile, body);
    const sig = createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(`${id}.${timestamp}.${body}`).digest("base64");
    const script = resolve(SKILLS_DIR, "horus-webhooks", "scripts", "verify_signature.py");
    const run = (signature) => spawnSync("python", [script, "--id", id, "--timestamp", timestamp, "--signature", signature, "--body-file", bodyFile],
        { encoding: "utf8", env: { ...process.env, HORUS_WEBHOOK_SECRET: secret } });
    try {
        assert.equal(run(`v1,${sig}`).status, 0);
        assert.equal(run("v1,AAAA").status, 1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});
