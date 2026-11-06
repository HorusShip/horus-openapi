import { Horus, type HorusOptions } from "../src/index.js";
import type { FetchLike } from "../src/core/http.js";

export interface RecordedCall {
    url: URL;
    method: string;
    headers: Record<string, string>;
    body: unknown;
}

export type Responder = Response | Error | ((call: RecordedCall) => Response | Promise<Response>);

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
    return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

export function apiError(status: number, type: string, code: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}): Response {
    return json(status, { error: { type, code, message: `${code} happened`, request_id: "req_1", ...extra } }, headers);
}

function headersOf(init: RequestInit): Record<string, string> {
    const out: Record<string, string> = {};
    new Headers(init.headers).forEach((v, k) => {
        out[k] = v;
    });
    return out;
}

/** A fetch that records calls and answers from a queue (the last responder repeats). */
export function mockFetch(...responders: Responder[]): { fetch: FetchLike; calls: RecordedCall[] } {
    const calls: RecordedCall[] = [];
    const fetch: FetchLike = async (input, init) => {
        const call: RecordedCall = {
            url: new URL(input),
            method: init.method ?? "GET",
            headers: headersOf(init),
            body: typeof init.body === "string" ? (JSON.parse(init.body) as unknown) : undefined,
        };
        calls.push(call);
        const r = responders.length > 1 ? responders.shift() : responders[0];
        if (r === undefined) throw new Error("mockFetch: no responder");
        if (r instanceof Error) throw r;
        return typeof r === "function" ? r(call) : r.clone();
    };
    return { fetch, calls };
}

export function client(fetch: FetchLike, opts: Partial<HorusOptions> = {}): Horus {
    return new Horus({ apiKey: "ak_test_secret", baseUrl: "https://api.test/api/v1", fetch, ...opts });
}

export const job = (status: string, id = "job_1"): Record<string, unknown> => ({
    object: "job", id, account_id: "acc_1", kind: "VERIFY_SESSION", status, attempts: 1, result: null, error: null,
    requested_at: "2026-11-06T00:00:00.000Z", claimed_at: null, finished_at: null,
});

export const page = (ids: string[], next: string | null): Record<string, unknown> => ({
    object: "list", data: ids.map((id) => ({ object: "listing", id })), has_more: next !== null, next_cursor: next,
});
