/**
 * Regenerates everything under src/generated/ from the pinned spec
 * (openapi/openapi.json at the repo root):
 *
 *   openapi.ts   raw types (openapi-typescript)
 *   routes.ts    method/path/idempotency/pagination per operation (runtime)
 *   resources.ts the namespaced client methods (horus.listings.list(), ...)
 *   catalog.ts   full per-operation metadata (CLI commands + help)
 *   schemas.ts   named aliases for every component schema
 *   events.ts    webhook event map + union
 *
 * Usage: npm run generate (from packages/sdk or the repo root).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { emitAll } from "./codegen/emit.js";
import { emitOpenapiTypes } from "./codegen/openapiTypes.js";
import { loadSpec, OUT_DIR, SPEC_URL } from "./codegen/paths.js";

async function main(): Promise<void> {
    const files: Record<string, string> = { "openapi.ts": await emitOpenapiTypes(SPEC_URL), ...emitAll(loadSpec()) };
    mkdirSync(OUT_DIR, { recursive: true });
    for (const [name, text] of Object.entries(files)) {
        writeFileSync(new URL(name, OUT_DIR), text);
        console.log(`wrote src/generated/${name}`);
    }
}

main().catch((e: unknown): void => {
    console.error(e);
    process.exitCode = 1;
});
