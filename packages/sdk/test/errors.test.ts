import { describe, expect, it } from "vitest";
import {
    APIError, AuthenticationError, ConflictError, DesktopOfflineError, InternalServerError, InvalidRequestError,
    NotFoundError, PermissionError, RateLimitError, UnavailableError,
} from "../src/index.js";
import { makeApiError, retryAfterSeconds, toErrorPayload } from "../src/core/errors.js";
import { apiError, client, mockFetch } from "./helpers.js";

const H = new Headers();

describe("error mapping", () => {
    it.each([
        [400, "invalid_request", InvalidRequestError],
        [422, "invalid_request", InvalidRequestError],
        [401, "authentication", AuthenticationError],
        [403, "permission", PermissionError],
        [404, "not_found", NotFoundError],
        [409, "conflict", ConflictError],
        [429, "rate_limited", RateLimitError],
        [503, "unavailable", UnavailableError],
        [500, "internal", InternalServerError],
    ] as const)("%i %s → %o", (status, type, cls) => {
        const err = makeApiError(status, { error: { type, code: "c", message: "m", request_id: "r" } }, H);
        expect(err).toBeInstanceOf(cls);
        expect(err).toBeInstanceOf(APIError);
        expect(err).toMatchObject({ status, type, code: "c", message: "m", requestId: "r" });
    });

    it("maps desktop_offline to DesktopOfflineError (an UnavailableError)", () => {
        const err = makeApiError(503, { error: { type: "unavailable", code: "desktop_offline", message: "offline" } }, H);
        expect(err).toBeInstanceOf(DesktopOfflineError);
        expect(err).toBeInstanceOf(UnavailableError);
    });

    it("falls back to the status for non-conforming bodies", () => {
        expect(makeApiError(502, "<html>Bad gateway</html>", H)).toBeInstanceOf(InternalServerError);
        expect(makeApiError(404, undefined, H)).toBeInstanceOf(NotFoundError);
        expect(toErrorPayload(418, { nope: 1 })).toEqual({ type: "invalid_request", code: "http_418", message: "HTTP 418" });
        expect(toErrorPayload(502, "upstream down").message).toBe("upstream down");
    });

    it("keeps details (validation issues, required scopes)", () => {
        const details = { required: ["listings:write"] };
        expect(makeApiError(403, { error: { type: "permission", code: "insufficient_scope", message: "x", details } }, H).details).toEqual(details);
    });

    it("takes the request id from the Request-Id header when the body lacks it", () => {
        const err = makeApiError(500, { error: { type: "internal", code: "internal_error", message: "x" } }, new Headers({ "request-id": "hdr" }));
        expect(err.requestId).toBe("hdr");
    });

    it("surfaces API errors from calls", async () => {
        const { fetch } = mockFetch(apiError(404, "not_found", "listing_not_found"));
        const err: unknown = await client(fetch).listings.get("nope").catch((e: unknown): unknown => e);
        expect(err).toBeInstanceOf(NotFoundError);
        expect(err).toMatchObject({ code: "listing_not_found", requestId: "req_1", name: "NotFoundError" });
    });
});

describe("RateLimitError.retryAfter", () => {
    it("reads Retry-After seconds", () => {
        const err = makeApiError(429, { error: { type: "rate_limited", code: "rate_limited", message: "x" } }, new Headers({ "retry-after": "7" }));
        expect((err as RateLimitError).retryAfter).toBe(7);
    });

    it("falls back to details.retry_after_seconds", () => {
        const err = makeApiError(429, { error: { type: "rate_limited", code: "rate_limited", message: "x", details: { retry_after_seconds: 12 } } }, H);
        expect((err as RateLimitError).retryAfter).toBe(12);
    });

    it("parses HTTP-date Retry-After", () => {
        const now = Date.parse("2026-11-06T00:00:00Z");
        expect(retryAfterSeconds(new Headers({ "retry-after": "Fri, 06 Nov 2026 00:00:30 GMT" }), undefined, now)).toBe(30);
        expect(retryAfterSeconds(new Headers({ "retry-after": "garbage" }), undefined, now)).toBeUndefined();
    });
});
