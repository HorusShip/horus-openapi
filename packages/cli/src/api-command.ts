/** `horus api <METHOD> <path> [--query k=v …] [--data …]`: raw passthrough. */
import type { HttpMethod } from "@horusship/sdk";
import { stringFlag, type ParsedArgs } from "./argv.js";
import type { CliContext } from "./context.js";
import { printResult, sessionOptions } from "./globals.js";
import { loadData, UsageError } from "./params.js";
import { openSession } from "./session.js";

const METHODS: readonly HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

export const API_FLAGS: ReadonlySet<string> = new Set(["query"]);

function method(raw: string | undefined): HttpMethod {
    const m = raw?.toUpperCase();
    const found = METHODS.find((x) => x === m);
    if (!found) throw new UsageError(`Usage: horus api <${METHODS.join("|")}> <path> [--query k=v] [--data json|@file|-]`);
    return found;
}

export function parseQuery(values: readonly (string | boolean)[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const v of values) {
        const s = String(v);
        const eq = s.indexOf("=");
        if (eq <= 0) throw new UsageError(`--query expects key=value, got "${s}".`);
        out[s.slice(0, eq)] = s.slice(eq + 1);
    }
    return out;
}

export async function apiCommand(ctx: CliContext, args: ParsedArgs, rest: readonly string[]): Promise<number> {
    const m = method(rest[0]);
    const rawPath = rest[1];
    if (!rawPath || rest.length > 2) throw new UsageError("Usage: horus api <METHOD> <path>, e.g. horus api GET /listings --query status=LISTED");
    const path = rawPath.replace(/^\/?api\/v1(?=\/)/, "");
    const data = stringFlag(args, "data");
    const session = await openSession(ctx, sessionOptions(args));
    const key = stringFlag(args, "idempotency-key");
    const result = await session.horus.request(m, path, {
        query: parseQuery(args.flags.get("query") ?? []),
        ...(data !== undefined ? { body: await loadData(data, ctx) } : {}),
        ...(key ? { idempotencyKey: key } : {}),
    });
    printResult(ctx, args, result);
    return 0;
}
