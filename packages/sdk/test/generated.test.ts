import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { emitAll } from "../scripts/codegen/emit.js";
import { buildOperations } from "../scripts/codegen/model.js";
import { emitOpenapiTypes } from "../scripts/codegen/openapiTypes.js";
import { loadSpec, OUT_DIR, SPEC_URL } from "../scripts/codegen/paths.js";
import { buildTree } from "../scripts/codegen/tree.js";
import { CATALOG } from "../src/catalog.js";
import { EVENT_TYPES, ROUTES, SDK_VERSION, type OperationId } from "../src/index.js";
import { client, json, mockFetch } from "./helpers.js";

const doc = loadSpec();
const specOps = buildOperations(doc);

function lookup(root: object, id: string): unknown {
    return id.split(".").reduce<unknown>((node, seg) => (node && typeof node === "object" ? (node as Record<string, unknown>)[seg] : undefined), root);
}

function dummyArgs(id: string): string[] {
    const op = specOps.find((o) => o.id === id);
    return (op?.pathParams ?? []).map((p) => `p_${p.name}`);
}

describe("generated code", () => {
    it("is up to date with openapi/openapi.json (run `npm run generate`)", async () => {
        const files: Record<string, string> = { ...emitAll(doc), "openapi.ts": await emitOpenapiTypes(SPEC_URL) };
        for (const [name, text] of Object.entries(files)) {
            expect(readFileSync(new URL(name, OUT_DIR), "utf8"), name).toBe(text);
        }
    }, 30_000);

    it("covers every operation in the spec", () => {
        let count = 0;
        for (const item of Object.values(doc.paths)) count += Object.keys(item).length;
        expect(specOps).toHaveLength(count);
        expect(Object.keys(ROUTES).sort()).toEqual(specOps.map((o) => o.id).sort());
        expect(CATALOG.map((o) => o.id)).toEqual(specOps.map((o) => o.id));
    });

    it("makes every operationId callable as horus.<id>() and hits the right route", async () => {
        const { fetch, calls } = mockFetch(json(200, { object: "list", data: [], has_more: false, next_cursor: null }));
        const horus = client(fetch);
        for (const op of specOps) {
            const fn = lookup(horus, op.id);
            expect(typeof fn, op.id).toBe("function");
            const out = (fn as (...a: unknown[]) => unknown)(...dummyArgs(op.id));
            await (op.paginated ? (out as { page(): Promise<unknown> }).page() : out);
            const call = calls[calls.length - 1];
            const path = op.path.replace(/\{(\w+)\}/g, (_m, n: string) => `p_${n}`);
            expect(`${call?.method} ${call?.url.pathname}`, op.id).toBe(`${op.method} /api/v1${path}`);
            expect(call?.headers["idempotency-key"] !== undefined, `${op.id} idempotency`).toBe(op.idempotent);
        }
        expect(calls).toHaveLength(specOps.length);
    });

    it("route flags match the spec", () => {
        for (const op of specOps) {
            const r = ROUTES[op.id as OperationId];
            expect({ method: r.method, path: r.path, params: r.params, idempotent: r.idempotent, paginated: r.paginated }, op.id)
                .toEqual({ method: op.method, path: op.path, params: op.params, idempotent: op.idempotent, paginated: op.paginated });
        }
    });

    it("has a namespace tree without collisions", () => {
        expect(() => buildTree(specOps)).not.toThrow();
        expect(() => buildTree([...specOps, { ...specOps[0]!, id: "jobs.wait" }])).toThrow(/hand-written/);
        expect(() => buildTree([...specOps, { ...specOps[0]!, id: "listings.list.all" }])).toThrow(/nests under/);
    });

    it("exports every webhook event type", () => {
        expect([...EVENT_TYPES].sort()).toEqual(Object.keys(doc.webhooks ?? {}).sort());
    });

    it("keeps SDK_VERSION in sync with package.json", () => {
        const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
        expect(SDK_VERSION).toBe(pkg.version);
    });
});
