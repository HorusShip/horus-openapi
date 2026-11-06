import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { AuthenticationError, Horus, HorusError, type Listing, type Sale } from "../src/index.js";
import { apiError, client, json, mockFetch } from "./helpers.js";

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("requests", () => {
    it("sends the bearer key, accept header and query params on GET", async () => {
        const { fetch, calls } = mockFetch(json(200, { object: "list", data: [], has_more: false, next_cursor: null }));
        await client(fetch).listings.list({ status: "LISTED", limit: 10, created_after: "2026-01-01T00:00:00Z" }).page();
        const c = calls[0];
        expect(c?.method).toBe("GET");
        expect(c?.url.pathname).toBe("/api/v1/listings");
        expect(Object.fromEntries(c?.url.searchParams ?? [])).toEqual({ status: "LISTED", limit: "10", created_after: "2026-01-01T00:00:00Z" });
        expect(c?.headers.authorization).toBe("Bearer ak_test_secret");
        expect(c?.headers.accept).toBe("application/json");
        expect(c?.headers["idempotency-key"]).toBeUndefined();
        expect(c?.headers["content-type"]).toBeUndefined();
    });

    it("fills and encodes path params and sends the body as JSON", async () => {
        const { fetch, calls } = mockFetch(json(200, { object: "sale", id: "s 1" }));
        const sale = await client(fetch).sales.ship("s 1/x", { tracking_number: "1Z999", carrier: "UPS" });
        expect(calls[0]?.method).toBe("POST");
        expect(calls[0]?.url.pathname).toBe("/api/v1/sales/s%201%2Fx/ship");
        expect(calls[0]?.headers["content-type"]).toBe("application/json");
        expect(calls[0]?.body).toEqual({ tracking_number: "1Z999", carrier: "UPS" });
        expect(sale.id).toBe("s 1");
        expectTypeOf(sale).toEqualTypeOf<Sale>();
    });

    it("handles operations with two path params", async () => {
        const { fetch, calls } = mockFetch(json(200, { object: "webhook_delivery", id: "d1" }));
        await client(fetch).webhooks.deliveries.get("wh_1", "d1");
        expect(calls[0]?.url.pathname).toBe("/api/v1/webhooks/wh_1/deliveries/d1");
    });

    it("sends query params for DELETE operations that take them", async () => {
        const { fetch, calls } = mockFetch(json(200, { id: "e1", object: "ebay_account", deleted: true }));
        await client(fetch).ebay.accounts.delete("e1", { force: "true" });
        expect(calls[0]?.method).toBe("DELETE");
        expect(calls[0]?.url.searchParams.get("force")).toBe("true");
        expect(calls[0]?.body).toBeUndefined();
    });

    it("sends an empty object body for body operations called without params", async () => {
        const { fetch, calls } = mockFetch(json(202, { object: "job", id: "j" }));
        await client(fetch).accounts.scrapeOrders("acc_1");
        expect(calls[0]?.body).toEqual({});
    });

    it("returns typed resources", async () => {
        const { fetch } = mockFetch(json(200, { object: "listing", id: "l1" }));
        const listing = await client(fetch).listings.get("l1");
        expectTypeOf(listing).toEqualTypeOf<Listing>();
        expect(listing.id).toBe("l1");
    });

    it("strips trailing slashes from the base URL", async () => {
        const { fetch, calls } = mockFetch(json(200, {}));
        await client(fetch, { baseUrl: "https://x.test/api/v1///" }).me.get();
        expect(calls[0]?.url.toString()).toBe("https://x.test/api/v1/me");
    });

    it("adds default and per-call headers", async () => {
        const { fetch, calls } = mockFetch(json(200, {}));
        await client(fetch, { defaultHeaders: { "x-app": "a" } }).me.get({ headers: { "x-trace": "t" } });
        expect(calls[0]?.headers["x-app"]).toBe("a");
        expect(calls[0]?.headers["x-trace"]).toBe("t");
    });

    it("handles 204 / empty bodies", async () => {
        const { fetch } = mockFetch(new Response(null, { status: 204 }));
        await expect(client(fetch).request("DELETE", "/whatever")).resolves.toBeUndefined();
    });
});

describe("raw request()", () => {
    it("calls any path with query and body, idempotent by default for writes", async () => {
        const { fetch, calls } = mockFetch(json(200, { ok: true }));
        const out = await client(fetch).request<{ ok: boolean }>("POST", "/listings/validate", { body: { items: ["B0"] }, query: { dry: true } });
        expect(out.ok).toBe(true);
        expect(calls[0]?.url.search).toBe("?dry=true");
        expect(calls[0]?.body).toEqual({ items: ["B0"] });
        expect(calls[0]?.headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("can opt out of the idempotency key", async () => {
        const { fetch, calls } = mockFetch(json(200, {}));
        await client(fetch).request("POST", "/x", { idempotent: false });
        expect(calls[0]?.headers["idempotency-key"]).toBeUndefined();
    });
});

describe("credentials", () => {
    it("reads HORUS_API_KEY when no credential is passed", async () => {
        vi.stubEnv("HORUS_API_KEY", "ak_from_env");
        const { fetch, calls } = mockFetch(json(200, {}));
        await new Horus({ fetch, baseUrl: "https://api.test" }).me.get();
        expect(calls[0]?.headers.authorization).toBe("Bearer ak_from_env");
    });

    it("reads HORUS_BASE_URL", async () => {
        vi.stubEnv("HORUS_BASE_URL", "https://env.test/api/v1");
        const { fetch, calls } = mockFetch(json(200, {}));
        await new Horus({ fetch, apiKey: "k" }).me.get();
        expect(calls[0]?.url.origin).toBe("https://env.test");
    });

    it("throws without any credential", () => {
        vi.stubEnv("HORUS_API_KEY", "");
        expect(() => new Horus({ fetch: mockFetch(json(200, {})).fetch })).toThrow(HorusError);
    });

    it("refuses both an API key and an access token", () => {
        expect(() => new Horus({ apiKey: "a", accessToken: "b" })).toThrow(/either/);
    });

    it("accepts a token function", async () => {
        const { fetch, calls } = mockFetch(json(200, {}));
        await new Horus({ fetch, accessToken: async () => "tok_fn" }).me.get();
        expect(calls[0]?.headers.authorization).toBe("Bearer tok_fn");
    });

    it("refreshes an expired access token once and retries", async () => {
        const { fetch, calls } = mockFetch(apiError(401, "authentication", "invalid_access_token"), json(200, { id: "u" }));
        const refresh = vi.fn(async () => "tok_new");
        const out = await new Horus({ fetch, accessToken: "tok_old", refresh, maxRetries: 0 }).me.get();
        expect(out.id).toBe("u");
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(calls.map((c) => c.headers.authorization)).toEqual(["Bearer tok_old", "Bearer tok_new"]);
    });

    it("does not refresh twice when the new token is also refused", async () => {
        const { fetch, calls } = mockFetch(apiError(401, "authentication", "invalid_access_token"));
        const refresh = vi.fn(async () => "tok_new");
        await expect(new Horus({ fetch, accessToken: "t", refresh }).me.get()).rejects.toBeInstanceOf(AuthenticationError);
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(calls).toHaveLength(2);
    });

    it("does not refresh for API-key errors", async () => {
        const { fetch, calls } = mockFetch(apiError(401, "authentication", "invalid_api_key"));
        await expect(client(fetch).me.get()).rejects.toMatchObject({ code: "invalid_api_key", status: 401 });
        expect(calls).toHaveLength(1);
    });
});
