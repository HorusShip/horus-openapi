/**
 * Opt-in live smoke test. READ-ONLY: only GET endpoints are called.
 *
 *   HORUS_API_KEY=ak_… npm run smoke            (production)
 *   HORUS_BASE_URL=http://localhost:3000/api/v1 HORUS_API_KEY=… npm run smoke
 *
 * Skips (exit 0) when HORUS_API_KEY is not set.
 */
import { APIError, AuthenticationError, Horus, PermissionError } from "../src/index.js";

type Check = [name: string, run: (h: Horus) => Promise<string>];

const CHECKS: Check[] = [
    ["me.get", async (h) => { const me = await h.me.get(); return `${me.email} via ${me.credential.kind} (${me.credential.scopes.length} scopes)`; }],
    ["account.get", async (h) => `plan ${(await h.account.get()).plan}`],
    ["eventTypes.list", async (h) => `${(await h.eventTypes.list()).data.length} event types`],
    ["listings.list (1 page)", async (h) => { const p = await h.listings.list({ limit: 5 }).page(); return `${p.data.length} listings, has_more=${p.has_more}`; }],
    ["listings.list (iterate 30)", async (h) => `${(await h.listings.list({ limit: 10 }).toArray({ max: 30 })).length} listings across pages`],
    ["sales.list", async (h) => `${(await h.sales.list({ limit: 5 }).page()).data.length} sales`],
    ["jobs.list", async (h) => `${(await h.jobs.list({ limit: 5 }).page()).data.length} jobs`],
    ["webhooks.list", async (h) => `${(await h.webhooks.list().page()).data.length} webhook endpoints`],
    ["desktop.status.get", async (h) => JSON.stringify(await h.desktop.status.get()).slice(0, 80)],
    ["listings.get (404 mapping)", async (h) => {
        const err = await h.listings.get("does_not_exist_smoke").then((): unknown => null, (e: unknown): unknown => e);
        if (!(err instanceof APIError) || err.status !== 404) throw new Error(`expected a 404 APIError, got ${String(err)}`);
        return `${err.name} ${err.code} (request ${err.requestId ?? "?"})`;
    }],
];

async function main(): Promise<void> {
    if (!process.env.HORUS_API_KEY) {
        console.log("HORUS_API_KEY not set; skipping live smoke test.");
        return;
    }
    const horus = new Horus();
    console.log(`Smoke test against ${horus.baseUrl}`);
    let failed = 0;
    for (const [name, run] of CHECKS) {
        try {
            console.log(`  ok   ${name}: ${await run(horus)}`);
        } catch (e) {
            const skipped = e instanceof PermissionError;
            if (!skipped) failed++;
            console.log(`  ${skipped ? "skip" : "FAIL"} ${name}: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
            if (e instanceof AuthenticationError) break;
        }
    }
    if (failed) process.exitCode = 1;
}

void main();
