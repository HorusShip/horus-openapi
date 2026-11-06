import { CATALOG } from "@horusship/sdk/catalog";
import { signWebhook } from "@horusship/sdk";
import { describe, expect, it } from "vitest";
import { buildCommandTree, kebab, resolveCommand } from "../src/commands.js";
import { GLOBAL_FLAG_NAMES } from "../src/globals.js";
import { operationHelp } from "../src/help.js";
import { flagName, flagParams } from "../src/params.js";
import { job, json, KEY_ENV, list, makeCli } from "./helpers.js";

describe("command tree", () => {
    const tree = buildCommandTree(CATALOG);

    it("has a command for every operation, in kebab-case", () => {
        for (const op of CATALOG) {
            const words = op.id.split(".").map(kebab);
            const { node, rest } = resolveCommand(tree, words);
            expect(node.op?.id, op.id).toBe(op.id);
            expect(rest).toEqual([]);
        }
        expect(resolveCommand(tree, ["listings", "bulk-delete"]).node.op?.id).toBe("listings.bulkDelete");
        expect(resolveCommand(tree, ["listings", "bulkDelete"]).node.op?.id).toBe("listings.bulkDelete");
    });

    it("no operation flag collides with a global flag, and every op has help", () => {
        for (const op of CATALOG) {
            for (const p of flagParams(op)) expect(GLOBAL_FLAG_NAMES.has(flagName(p)), `${op.id} --${flagName(p)}`).toBe(false);
            expect(operationHelp(op)).toContain(op.summary);
        }
    });

    it("built-ins don't shadow resources", () => {
        for (const b of ["login", "logout", "whoami", "api", "help"]) expect(tree.children.has(b), b).toBe(false);
        expect(tree.children.get("webhooks")?.children.has("verify")).toBe(false);
    });
});

describe("running operations", () => {
    it("lists with query flags and prints a table", async () => {
        const cli = makeCli(() => json(200, list([{ object: "listing", id: "l1", status: "LISTED", title: "Lamp" }], "c1")), { env: KEY_ENV });
        expect(await cli.run("listings", "list", "--status", "LISTED", "--limit", "5")).toBe(0);
        expect(cli.calls[0]?.url.toString()).toBe("https://api.test/api/v1/listings?status=LISTED&limit=5");
        expect(cli.calls[0]?.headers.authorization).toBe("Bearer ak_test");
        expect(cli.out()).toMatch(/ID\s+STATUS\s+TITLE\nl1\s+LISTED\s+Lamp/);
        expect(cli.out()).toContain("--cursor c1");
    });

    it("--json prints the raw response", async () => {
        const body = list([{ object: "listing", id: "l1" }]);
        const cli = makeCli(() => json(200, body), { env: KEY_ENV });
        await cli.run("listings", "list", "--json");
        expect(JSON.parse(cli.out())).toEqual(body);
    });

    it("--all follows cursors into one list", async () => {
        const cli = makeCli((c) => json(200, c.url.searchParams.get("cursor") ? list([{ id: "b" }]) : list([{ id: "a" }], "c1")), { env: KEY_ENV });
        await cli.run("sales", "list", "--all", "--json");
        expect(JSON.parse(cli.out())).toEqual({ object: "list", data: [{ id: "a" }, { id: "b" }], has_more: false, next_cursor: null });
        expect(cli.calls).toHaveLength(2);
    });

    it("sends path args and body flags for writes, with an idempotency key", async () => {
        const cli = makeCli(() => json(200, { object: "sale", id: "s1", status: "SHIPPED" }), { env: KEY_ENV });
        expect(await cli.run("sales", "ship", "s1", "--tracking-number", "1Z999", "--carrier", "UPS")).toBe(0);
        const c = cli.calls[0];
        expect(`${c?.method} ${c?.url.pathname}`).toBe("POST /api/v1/sales/s1/ship");
        expect(JSON.parse(c?.body ?? "{}")).toEqual({ tracking_number: "1Z999", carrier: "UPS" });
        expect(c?.headers["idempotency-key"]).toBeDefined();
        expect(cli.out()).toContain("status  SHIPPED");
    });

    it("--idempotency-key and --data @file", async () => {
        const cli = makeCli(() => json(200, {}), { env: KEY_ENV });
        cli.files.set("body.json", '{"tracking_number":"FROMFILE"}');
        await cli.run("sales", "ship", "s1", "--data", "@body.json", "--idempotency-key", "k-1");
        expect(JSON.parse(cli.calls[0]?.body ?? "{}")).toEqual({ tracking_number: "FROMFILE" });
        expect(cli.calls[0]?.headers["idempotency-key"]).toBe("k-1");
    });

    it("--data - reads stdin", async () => {
        const cli = makeCli(() => json(200, {}), { env: KEY_ENV, stdin: '{"items":["B0"]}' });
        await cli.run("listings", "validate", "--data", "-");
        expect(JSON.parse(cli.calls[0]?.body ?? "{}")).toEqual({ items: ["B0"] });
    });

    it("--wait polls a 202 job until it finishes", async () => {
        const states = ["QUEUED", "RUNNING", "SUCCEEDED"];
        const cli = makeCli((c) => json(c.method === "POST" ? 202 : 200, job(c.method === "POST" ? "QUEUED" : states.shift() ?? "SUCCEEDED")), { env: KEY_ENV });
        const code = await cli.run("accounts", "jobs", "create", "acc_1", "--kind", "VERIFY_SESSION", "--wait", "--wait-interval", "0.001", "--json");
        expect(code).toBe(0);
        expect(JSON.parse(cli.out())).toMatchObject({ id: "job_1", status: "SUCCEEDED" });
        expect(cli.calls[0]?.url.pathname).toBe("/api/v1/accounts/acc_1/jobs");
        expect(cli.calls.slice(1).every((c) => c.url.pathname === "/api/v1/jobs/job_1")).toBe(true);
    });

    it("--wait exits 1 when the job fails, and reports progress on stderr", async () => {
        const cli = makeCli((c) => json(200, job(c.method === "POST" ? "QUEUED" : "FAILED")), { env: KEY_ENV });
        expect(await cli.run("accounts", "verify", "acc_1", "--wait", "--wait-interval", "0.001")).toBe(1);
        expect(cli.err()).toContain("job job_1: FAILED");
    });

    it("accepts true/false enum flags bare", async () => {
        const cli = makeCli(() => json(200, list([])), { env: KEY_ENV });
        await cli.run("listings", "list", "--is-bundle");
        expect(cli.calls[0]?.url.searchParams.get("is_bundle")).toBe("true");
    });
});

describe("errors and exit codes", () => {
    it("API errors exit 1; --json prints the error object", async () => {
        const cli = makeCli(() => json(404, { error: { type: "not_found", code: "listing_not_found", message: "No such listing.", request_id: "r1" } }), { env: KEY_ENV });
        expect(await cli.run("listings", "get", "nope", "--json")).toBe(1);
        expect(JSON.parse(cli.out())).toEqual({ error: { status: 404, type: "not_found", code: "listing_not_found", message: "No such listing.", details: null, request_id: "r1" } });
        const human = makeCli(() => json(404, { error: { type: "not_found", code: "listing_not_found", message: "No such listing." } }), { env: KEY_ENV });
        await human.run("listings", "get", "nope");
        expect(human.err()).toBe("Error 404 listing_not_found: No such listing.\n");
    });

    it("usage errors exit 2 without calling the API", async () => {
        const cli = makeCli(() => json(200, {}), { env: KEY_ENV });
        expect(await cli.run("accounts", "jobs", "create", "acc_1")).toBe(2);
        expect(cli.err()).toContain("Missing required --kind");
        expect(await cli.run("listings", "frobnicate")).toBe(2);
        expect(cli.err()).toContain('Unknown command "listings frobnicate"');
        expect(await cli.run("sales", "ship")).toBe(2);
        expect(await cli.run("login", "--bogus")).toBe(2);
        expect(cli.calls).toHaveLength(0);
    });

    it("is not logged in without credentials", async () => {
        const cli = makeCli(() => json(200, {}));
        expect(await cli.run("me", "get")).toBe(2);
        expect(cli.err()).toContain("Not logged in");
    });
});

describe("help", () => {
    it("root, group and operation help", async () => {
        const cli = makeCli(() => json(200, {}));
        expect(await cli.run()).toBe(0);
        expect(cli.out()).toContain("Resources (horus <resource> --help)");
        const g = makeCli(() => json(200, {}));
        await g.run("sales", "--help");
        expect(g.out()).toContain("ship");
        const o = makeCli(() => json(200, {}));
        await o.run("help", "accounts", "jobs", "create");
        expect(o.out()).toContain("Usage\n  horus accounts jobs create <id> [flags]");
        expect(o.out()).toContain("--kind <LOGIN|VERIFY_SESSION");
        expect(o.out()).toContain("runs on your Horus Desktop");
    });

    it("--version", async () => {
        const cli = makeCli(() => json(200, {}));
        await cli.run("--version");
        expect(cli.out()).toMatch(/^horus 0\.1\.0 \(sdk 0\.1\.0\)/);
    });
});

describe("horus api", () => {
    it("passes method, path, query and body through", async () => {
        const cli = makeCli(() => json(200, { ok: true }), { env: KEY_ENV });
        expect(await cli.run("api", "post", "/api/v1/listings/validate", "--query", "a=1", "--data", '{"items":["B0"]}', "--json")).toBe(0);
        const c = cli.calls[0];
        expect(`${c?.method} ${c?.url.pathname}${c?.url.search}`).toBe("POST /api/v1/listings/validate?a=1");
        expect(c?.body).toBe('{"items":["B0"]}');
        expect(JSON.parse(cli.out())).toEqual({ ok: true });
    });

    it("validates its arguments", async () => {
        const cli = makeCli(() => json(200, {}), { env: KEY_ENV });
        expect(await cli.run("api", "FETCH", "/x")).toBe(2);
        expect(await cli.run("api", "GET")).toBe(2);
        expect(await cli.run("api", "GET", "/x", "--query", "novalue")).toBe(2);
    });
});

describe("horus webhooks verify", () => {
    const secret = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
    const body = JSON.stringify({ id: "evt_1", object: "event", type: "sale.shipped", created: "x", api_version: "x", data: {} });
    const ts = Math.floor(Date.now() / 1000);
    const sig = signWebhook(body, { id: "evt_1", timestamp: ts }, secret);

    it("accepts a valid signature", async () => {
        const cli = makeCli(() => json(200, {}));
        cli.files.set("b.json", body);
        const code = await cli.run("webhooks", "verify", "--secret", secret, "--payload", "@b.json", "--header", "webhook-id: evt_1", "--timestamp", String(ts), "--signature", sig);
        expect(code).toBe(0);
        expect(cli.out()).toContain("Signature valid. Event sale.shipped evt_1");
        expect(cli.calls).toHaveLength(0);
    });

    it("rejects a bad one (exit 1, --json)", async () => {
        const cli = makeCli(() => json(200, {}), { env: { HORUS_WEBHOOK_SECRET: secret } });
        const code = await cli.run("webhooks", "verify", "--payload", body + " ", "--id", "evt_1", "--timestamp", String(ts), "--signature", sig, "--json");
        expect(code).toBe(1);
        expect(JSON.parse(cli.out())).toEqual({ valid: false, error: "No matching webhook signature." });
    });

    it("needs a secret and a payload", async () => {
        const cli = makeCli(() => json(200, {}));
        expect(await cli.run("webhooks", "verify", "--payload", "{}")).toBe(2);
        expect(await cli.run("webhooks", "verify", "--secret", secret)).toBe(2);
    });
});
