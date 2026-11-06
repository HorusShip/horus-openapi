import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FetchLike } from "@horusship/sdk";
import { run } from "../src/cli.js";
import type { CliContext } from "../src/context.js";

export interface Call {
    url: URL;
    method: string;
    headers: Record<string, string>;
    body: string | undefined;
}

export type Handler = (call: Call) => Response | Promise<Response>;

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

export interface TestCli {
    ctx: CliContext;
    calls: Call[];
    out: () => string;
    err: () => string;
    run: (...argv: string[]) => Promise<number>;
    files: Map<string, string>;
    opened: string[];
}

export function makeCli(handler: Handler, opts: { env?: Record<string, string>; stdin?: string; isTTY?: boolean } = {}): TestCli {
    const calls: Call[] = [];
    let out = "";
    let err = "";
    const files = new Map<string, string>();
    const opened: string[] = [];
    const fetch: FetchLike = async (input, init) => {
        const headers: Record<string, string> = {};
        new Headers(init.headers).forEach((v, k) => {
            headers[k] = v;
        });
        const call: Call = { url: new URL(input), method: init.method ?? "GET", headers, body: typeof init.body === "string" ? init.body : undefined };
        calls.push(call);
        return handler(call);
    };
    const ctx: CliContext = {
        env: { ...opts.env },
        stdout: (t) => {
            out += t;
        },
        stderr: (t) => {
            err += t;
        },
        fetch,
        readFile: async (p) => {
            const f = files.get(p);
            if (f === undefined) throw new Error(`ENOENT ${p}`);
            return f;
        },
        readStdin: async () => opts.stdin ?? "",
        sleep: async () => undefined,
        openUrl: (u) => {
            opened.push(u);
        },
        configDir: mkdtempSync(join(tmpdir(), "horus-cli-")),
        isTTY: opts.isTTY ?? false,
    };
    return { ctx, calls, out: () => out, err: () => err, run: (...argv) => run(argv, ctx), files, opened };
}

export const KEY_ENV = { HORUS_API_KEY: "ak_test", HORUS_BASE_URL: "https://api.test/api/v1" };

export const list = (data: unknown[], next: string | null = null): Record<string, unknown> => ({ object: "list", data, has_more: next !== null, next_cursor: next });

export const job = (status: string): Record<string, unknown> => ({
    object: "job", id: "job_1", account_id: "acc_1", kind: "VERIFY_SESSION", status, attempts: 1, result: null, error: null,
    requested_at: "2026-11-06T00:00:00.000Z", claimed_at: null, finished_at: null,
});

export const me = { object: "user", id: "u1", email: "seller@example.com", name: "Seller", avatar_url: null, credential: { kind: "api_key", id: "eak_1", scopes: ["listings:read"], client_id: null } };
