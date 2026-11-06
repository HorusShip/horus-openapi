import { describe, expect, it } from "vitest";
import { APIConnectionError, APITimeoutError, APIUserAbortError, ConflictError, DesktopOfflineError, InternalServerError, isRetryable, NotFoundError, RateLimitError } from "../src/index.js";
import { makeApiError } from "../src/core/errors.js";
import { retryDelayMs } from "../src/core/retry.js";
import { apiError, client, json, mockFetch } from "./helpers.js";

/** `retry-after: 0` keeps the tests fast without fake timers. */
const NOW = { "retry-after": "0" };
const fail500 = (): Response => apiError(500, "internal", "internal_error", {}, NOW);

describe("retries", () => {
    it("retries 5xx and succeeds", async () => {
        const { fetch, calls } = mockFetch(fail500(), apiError(502, "internal", "bad_gateway", {}, NOW), json(200, { id: "u" }));
        await expect(client(fetch).me.get()).resolves.toMatchObject({ id: "u" });
        expect(calls).toHaveLength(3);
    });

    it("gives up after maxRetries and throws the last error", async () => {
        const { fetch, calls } = mockFetch(fail500());
        await expect(client(fetch, { maxRetries: 1 }).me.get()).rejects.toBeInstanceOf(InternalServerError);
        expect(calls).toHaveLength(2);
    });

    it("honours a per-call maxRetries", async () => {
        const { fetch, calls } = mockFetch(fail500());
        await expect(client(fetch).me.get({ maxRetries: 0 })).rejects.toBeInstanceOf(InternalServerError);
        expect(calls).toHaveLength(1);
    });

    it("retries 429 with Retry-After", async () => {
        const { fetch, calls } = mockFetch(apiError(429, "rate_limited", "rate_limited", {}, NOW), json(200, {}));
        await client(fetch).me.get();
        expect(calls).toHaveLength(2);
    });

    it("retries network errors", async () => {
        const { fetch, calls } = mockFetch(new TypeError("fetch failed"), json(200, {}));
        const horus = client(fetch);
        // network errors have no Retry-After: allow the real (short) first backoff
        await horus.me.get();
        expect(calls).toHaveLength(2);
    });

    it("does not retry 4xx or desktop_offline", async () => {
        const nf = mockFetch(apiError(404, "not_found", "x"));
        await expect(client(nf.fetch).me.get()).rejects.toBeInstanceOf(NotFoundError);
        expect(nf.calls).toHaveLength(1);
        const off = mockFetch(apiError(503, "unavailable", "desktop_offline", {}, NOW));
        await expect(client(off.fetch).accounts.verify("a")).rejects.toBeInstanceOf(DesktopOfflineError);
        expect(off.calls).toHaveLength(1);
    });

    it("retries idempotency_in_progress conflicts but not idempotency_conflict", async () => {
        const busy = mockFetch(apiError(409, "conflict", "idempotency_in_progress", {}, NOW), json(200, {}));
        await client(busy.fetch).sales.cancel("s");
        expect(busy.calls).toHaveLength(2);
        const clash = mockFetch(apiError(409, "conflict", "idempotency_conflict"));
        await expect(client(clash.fetch).sales.cancel("s")).rejects.toBeInstanceOf(ConflictError);
        expect(clash.calls).toHaveLength(1);
    });
});

describe("idempotency keys", () => {
    it("sends one generated key on writes and reuses it across retries", async () => {
        const { fetch, calls } = mockFetch(fail500(), fail500(), json(200, {}));
        await client(fetch).sales.ship("s1", { tracking_number: "1Z99" });
        const keys = calls.map((c) => c.headers["idempotency-key"]);
        expect(keys[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(new Set(keys).size).toBe(1);
    });

    it("uses a fresh key per call", async () => {
        const { fetch, calls } = mockFetch(json(200, {}));
        const horus = client(fetch);
        await horus.sales.cancel("a");
        await horus.sales.cancel("a");
        expect(calls[0]?.headers["idempotency-key"]).not.toBe(calls[1]?.headers["idempotency-key"]);
    });

    it("uses the caller's key when given", async () => {
        const { fetch, calls } = mockFetch(json(200, {}));
        await client(fetch).sales.cancel("a", { idempotencyKey: "order-123-cancel" });
        expect(calls[0]?.headers["idempotency-key"]).toBe("order-123-cancel");
    });

    it("sends no key on GETs or on writes the API marks non-idempotent", async () => {
        const { fetch, calls } = mockFetch(json(200, {}));
        const horus = client(fetch);
        await horus.listings.get("l");
        await horus.listings.validate({ items: ["B0"] });
        expect(calls.map((c) => c.headers["idempotency-key"])).toEqual([undefined, undefined]);
    });
});

describe("timeouts and aborts", () => {
    it("times out and retries, then throws APITimeoutError", async () => {
        let n = 0;
        const fetch = (_u: string, init: RequestInit): Promise<Response> => {
            n++;
            return new Promise((_res, rej) => {
                if (init.signal?.aborted) rej(new Error("aborted"));
                init.signal?.addEventListener("abort", () => rej(new Error("aborted")));
            });
        };
        await expect(client(fetch, { timeoutMs: 5, maxRetries: 1 }).me.get()).rejects.toBeInstanceOf(APITimeoutError);
        expect(n).toBe(2);
    });

    it("stops on a user abort without retrying", async () => {
        const ac = new AbortController();
        let n = 0;
        const fetch = (_u: string, init: RequestInit): Promise<Response> => {
            n++;
            return new Promise((_res, rej) => {
                if (init.signal?.aborted) rej(new Error("aborted"));
                init.signal?.addEventListener("abort", () => rej(new Error("aborted")));
            });
        };
        const p = client(fetch).me.get({ signal: ac.signal });
        setTimeout(() => ac.abort(), 5);
        await expect(p).rejects.toBeInstanceOf(APIUserAbortError);
        expect(n).toBe(1);
        await expect(client(fetch).me.get({ signal: ac.signal })).rejects.toBeInstanceOf(APIUserAbortError);
        expect(n).toBe(1);
    });
});

describe("retry policy", () => {
    it("classifies errors", () => {
        const H = new Headers();
        const e = (status: number, code = "c"): unknown => makeApiError(status, { error: { type: "internal", code, message: "" } }, H);
        expect(isRetryable(new APIConnectionError("x"))).toBe(true);
        expect(isRetryable(e(500))).toBe(true);
        expect(isRetryable(e(501))).toBe(false);
        expect(isRetryable(e(408))).toBe(true);
        expect(isRetryable(new Error("other"))).toBe(false);
        expect(isRetryable(makeApiError(429, { error: { type: "rate_limited", code: "rate_limited", message: "" } }, H))).toBe(true);
        expect(makeApiError(429, {}, H)).toBeInstanceOf(RateLimitError);
    });

    it("backs off exponentially with jitter, capped, and honours Retry-After", () => {
        expect(retryDelayMs(1, undefined, () => 0)).toBe(250);
        expect(retryDelayMs(1, undefined, () => 1)).toBe(500);
        expect(retryDelayMs(3, undefined, () => 1)).toBe(2000);
        expect(retryDelayMs(10, undefined, () => 1)).toBe(8000);
        expect(retryDelayMs(1, 3)).toBe(3000);
        expect(retryDelayMs(1, 3600)).toBe(60_000);
    });
});
