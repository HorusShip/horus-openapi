import { createHash, createHmac, randomBytes } from "node:crypto";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
    signLegacyWebhook, signWebhook, verifyWebhook, verifyWebhookSignature, WebhookVerificationError,
    type HorusEvent, type LegacyHorusEvent,
} from "../src/index.js";
import { fromBase64, toBase64 } from "../src/webhooks/encoding.js";
import { hmacSha256, sha256 } from "../src/webhooks/sha256.js";
import { secretKey } from "../src/webhooks/verify.js";

/** Published Standard Webhooks test vector (standard-webhooks/libraries). */
const VECTOR = {
    secret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
    id: "msg_p5jXN8AQM9LWM0D4loKWxJek",
    timestamp: "1614265330",
    payload: '{"test": 2432232314}',
    signature: "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
};
const AT_VECTOR = { now: 1614265330 * 1000 };
const vectorHeaders = (signature = VECTOR.signature): Record<string, string> => ({
    "webhook-id": VECTOR.id, "webhook-timestamp": VECTOR.timestamp, "webhook-signature": signature,
});

const SECRET = `whsec_${randomBytes(32).toString("base64")}`;
const BODY = JSON.stringify({ id: "evt_1", object: "event", type: "sale.shipped", created: "2026-11-07T12:00:00.000Z", api_version: "2026-11-06", data: { sale: { id: "s1" } } });

function signed(body: string, secret = SECRET, ts = Math.floor(Date.now() / 1000)): Record<string, string> {
    return { "webhook-id": "evt_1", "webhook-timestamp": String(ts), "webhook-signature": signWebhook(body, { id: "evt_1", timestamp: ts }, secret) };
}

describe("Standard Webhooks", () => {
    it("matches the published test vector", () => {
        expect(signWebhook(VECTOR.payload, VECTOR, VECTOR.secret)).toBe(VECTOR.signature);
        expect(() => verifyWebhookSignature(VECTOR.payload, vectorHeaders(), VECTOR.secret, AT_VECTOR)).not.toThrow();
    });

    it("rejects a tampered payload, id or signature", () => {
        expect(() => verifyWebhookSignature('{"test": 2432232315}', vectorHeaders(), VECTOR.secret, AT_VECTOR)).toThrow(WebhookVerificationError);
        expect(() => verifyWebhookSignature(VECTOR.payload, { ...vectorHeaders(), "webhook-id": "msg_other" }, VECTOR.secret, AT_VECTOR)).toThrow(WebhookVerificationError);
        expect(() => verifyWebhookSignature(VECTOR.payload, vectorHeaders("v1,Ceo5qEr07ixe2NLpvHk3FH9bwy/WavXrAFQ/9tdO6mc="), VECTOR.secret, AT_VECTOR)).toThrow(/No matching/);
        expect(() => verifyWebhookSignature(VECTOR.payload, vectorHeaders("v2," + VECTOR.signature.slice(3)), VECTOR.secret, AT_VECTOR)).toThrow(/No matching/);
        expect(() => verifyWebhookSignature(VECTOR.payload, vectorHeaders("v1,"), VECTOR.secret, AT_VECTOR)).toThrow(/No matching/);
    });

    it("rejects the wrong secret", () => {
        expect(() => verifyWebhookSignature(VECTOR.payload, vectorHeaders(), SECRET, AT_VECTOR)).toThrow(WebhookVerificationError);
    });

    it("accepts any of several space-separated signatures (secret rotation)", () => {
        const both = `v1,${toBase64(randomBytes(32))} ${VECTOR.signature}`;
        expect(() => verifyWebhookSignature(VECTOR.payload, vectorHeaders(both), VECTOR.secret, AT_VECTOR)).not.toThrow();
    });

    it("enforces the timestamp tolerance", () => {
        const late = { now: (1614265330 + 301) * 1000 };
        expect(() => verifyWebhookSignature(VECTOR.payload, vectorHeaders(), VECTOR.secret, late)).toThrow(/tolerance/);
        expect(() => verifyWebhookSignature(VECTOR.payload, vectorHeaders(), VECTOR.secret, { ...late, toleranceSeconds: 600 })).not.toThrow();
        const early = { now: (1614265330 - 301) * 1000 };
        expect(() => verifyWebhookSignature(VECTOR.payload, vectorHeaders(), VECTOR.secret, early)).toThrow(/tolerance/);
        expect(() => verifyWebhookSignature(VECTOR.payload, { ...vectorHeaders(), "webhook-timestamp": "12abc" }, VECTOR.secret, AT_VECTOR)).toThrow(/Invalid webhook-timestamp/);
    });

    it("reads Headers instances, any header casing, and array values", () => {
        expect(() => verifyWebhookSignature(VECTOR.payload, new Headers(vectorHeaders()), VECTOR.secret, AT_VECTOR)).not.toThrow();
        const upper = { "Webhook-Id": VECTOR.id, "WEBHOOK-TIMESTAMP": VECTOR.timestamp, "Webhook-Signature": [VECTOR.signature] };
        expect(() => verifyWebhookSignature(VECTOR.payload, upper, VECTOR.secret, AT_VECTOR)).not.toThrow();
    });

    it("verifies raw bytes as well as strings", () => {
        expect(() => verifyWebhookSignature(new TextEncoder().encode(VECTOR.payload), vectorHeaders(), VECTOR.secret, AT_VECTOR)).not.toThrow();
    });

    it("refuses requests without signature headers or secret", () => {
        expect(() => verifyWebhookSignature(BODY, {}, SECRET)).toThrow(/Missing webhook-id/);
        expect(() => verifyWebhookSignature(BODY, signed(BODY), "")).toThrow(/Missing webhook secret/);
    });

    it("matches Horus's signer (node:crypto, base64-decoded whsec_ key)", () => {
        const ts = 1762516800;
        const expected = "v1," + createHmac("sha256", Buffer.from(SECRET.slice(6), "base64")).update(`evt_1.${ts}.${BODY}`).digest("base64");
        expect(signWebhook(BODY, { id: "evt_1", timestamp: ts }, SECRET)).toBe(expected);
    });

    it("keys non-whsec secrets with their UTF-8 bytes, like the server", () => {
        expect(Buffer.from(secretKey("plain-secret")).toString("utf8")).toBe("plain-secret");
        expect(Buffer.from(secretKey("whsec_not*base64")).toString("utf8")).toBe("whsec_not*base64");
        expect(Buffer.from(secretKey("whsec_YWJj")).toString("utf8")).toBe("abc");
    });
});

describe("verifyWebhook()", () => {
    it("returns the typed v2 event", () => {
        const event = verifyWebhook(BODY, signed(BODY), SECRET);
        expectTypeOf(event).toEqualTypeOf<HorusEvent>();
        expect(event.type).toBe("sale.shipped");
        if (event.type === "sale.shipped") expect(event.data.sale.id).toBe("s1");
    });

    it("returns the legacy body with payloadFormat v1", () => {
        const body = JSON.stringify({ id: "d1", event: "sale.shipped", data: { saleId: "s1" }, createdAt: "2026-11-07T12:00:00.000Z" });
        const event = verifyWebhook(body, signed(body), SECRET, { payloadFormat: "v1" });
        expectTypeOf(event).toEqualTypeOf<LegacyHorusEvent>();
        expect(event.event).toBe("sale.shipped");
    });

    it("rejects non-JSON or non-event bodies after a valid signature", () => {
        expect(() => verifyWebhook("not json", signed("not json"), SECRET)).toThrow(/not valid JSON/);
        expect(() => verifyWebhook("[1]", signed("[1]"), SECRET)).toThrow(/not an event/);
    });
});

describe("legacy X-Horus-Signature", () => {
    it("verifies sha256=<hex HMAC of the body keyed with the raw secret>", () => {
        const sig = "sha256=" + createHmac("sha256", "whsec_abc").update(BODY).digest("hex");
        expect(signLegacyWebhook(BODY, "whsec_abc")).toBe(sig);
        expect(() => verifyWebhookSignature(BODY, { "x-horus-signature": sig }, "whsec_abc")).not.toThrow();
        expect(() => verifyWebhookSignature(BODY + " ", { "x-horus-signature": sig }, "whsec_abc")).toThrow(WebhookVerificationError);
    });

    it("prefers Standard Webhooks headers when both are present", () => {
        const headers = { ...signed(BODY), "x-horus-signature": "sha256=bogus" };
        expect(() => verifyWebhookSignature(BODY, headers, SECRET)).not.toThrow();
    });
});

describe("sha256 / hmac / base64 (pure TS)", () => {
    it("matches node:crypto across lengths, including block boundaries", () => {
        for (const n of [0, 1, 55, 56, 63, 64, 65, 119, 120, 128, 1000, 70_000]) {
            const data = randomBytes(n);
            expect(Buffer.from(sha256(data)).toString("hex")).toBe(createHash("sha256").update(data).digest("hex"));
            const key = randomBytes(n % 100 + 1);
            expect(Buffer.from(hmacSha256(key, data)).toString("hex")).toBe(createHmac("sha256", key).update(data).digest("hex"));
        }
    });

    it("hashes long keys first (RFC 2104)", () => {
        const key = randomBytes(200);
        expect(Buffer.from(hmacSha256(key, Buffer.from("x"))).toString("hex")).toBe(createHmac("sha256", key).update("x").digest("hex"));
    });

    it("round-trips base64 and rejects junk", () => {
        for (const n of [0, 1, 2, 3, 31, 32, 33]) {
            const b = randomBytes(n);
            expect(toBase64(b)).toBe(b.toString("base64"));
            expect(Buffer.from(fromBase64(b.toString("base64")) ?? []).equals(b)).toBe(true);
        }
        expect(fromBase64("a*b")).toBeNull();
        expect(fromBase64("abcde")).toBeNull();
    });
});
