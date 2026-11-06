/**
 * Webhook signature verification.
 *
 * Standard Webhooks (https://www.standardwebhooks.com): HMAC-SHA256 over
 * `{webhook-id}.{webhook-timestamp}.{raw body}`, keyed with the base64-decoded
 * part of the `whsec_` secret, sent as `webhook-signature: v1,<base64>` (several
 * space-separated entries during a secret rotation).
 *
 * Legacy (endpoints created before webhooks v2): `X-Horus-Signature:
 * sha256=<hex HMAC-SHA256 of the body keyed with the raw secret string>`.
 * Only checked when the Standard Webhooks headers are absent, since every
 * delivery carries both.
 */
import { HorusError } from "../core/errors.js";
import type { HorusEvent } from "../generated/events.js";
import { fromBase64, timingSafeEqual, timingSafeEqualString, toBase64, toHex, utf8 } from "./encoding.js";
import { hmacSha256 } from "./sha256.js";

export class WebhookVerificationError extends HorusError {
    override readonly name: string = "WebhookVerificationError";
}

/** A `Headers` instance or a plain header object (Express/Node `IncomingHttpHeaders`, ...). */
export type WebhookHeaders = Headers | Readonly<Record<string, string | readonly string[] | undefined>>;

export interface VerifyWebhookOptions {
    /** Max clock skew for `webhook-timestamp`, in seconds (default 300). */
    toleranceSeconds?: number;
    /** Current time in ms (tests). */
    now?: number;
}

/** v1 (`payload_format: "v1"`) body shape. */
export interface LegacyHorusEvent {
    id: string;
    event: string;
    data: Record<string, unknown>;
    createdAt: string;
}

const SECRET_PREFIX = "whsec_";
export const DEFAULT_TOLERANCE_SECONDS = 300;

/** HMAC key for a secret, exactly as Horus derives it (whsec_<base64> → bytes; anything else → UTF-8). */
export function secretKey(secret: string): Uint8Array {
    if (secret.startsWith(SECRET_PREFIX)) {
        const b64 = secret.slice(SECRET_PREFIX.length);
        if (/^[A-Za-z0-9+/]+={0,2}$/.test(b64) && b64.length % 4 === 0) {
            const bytes = fromBase64(b64);
            if (bytes) return bytes;
        }
    }
    return utf8(secret);
}

function isHeaders(h: WebhookHeaders): h is Headers {
    return typeof (h as { get?: unknown }).get === "function";
}

function header(headers: WebhookHeaders, name: string): string | undefined {
    if (isHeaders(headers)) return headers.get(name) ?? undefined;
    const lower = name.toLowerCase();
    for (const [k, v] of Object.entries(headers as Record<string, string | readonly string[] | undefined>)) {
        if (k.toLowerCase() !== lower || v === undefined) continue;
        return typeof v === "string" ? v : v.join(" ");
    }
    return undefined;
}

const bodyBytes = (payload: string | Uint8Array): Uint8Array => (typeof payload === "string" ? utf8(payload) : payload);

function concatBytes(...parts: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let offset = 0;
    for (const p of parts) {
        out.set(p, offset);
        offset += p.length;
    }
    return out;
}

/** `v1,<base64>` for one secret (what Horus sends). */
export function signWebhook(payload: string | Uint8Array, msg: { id: string; timestamp: number | string }, secret: string): string {
    const signed = concatBytes(utf8(`${msg.id}.${msg.timestamp}.`), bodyBytes(payload));
    return `v1,${toBase64(hmacSha256(secretKey(secret), signed))}`;
}

/** `sha256=<hex>` legacy signature. */
export function signLegacyWebhook(payload: string | Uint8Array, secret: string): string {
    return `sha256=${toHex(hmacSha256(utf8(secret), bodyBytes(payload)))}`;
}

function checkTimestamp(raw: string, options: VerifyWebhookOptions): void {
    const ts = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(ts)) throw new WebhookVerificationError("Invalid webhook-timestamp header.");
    const now = Math.floor((options.now ?? Date.now()) / 1000);
    const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
    if (Math.abs(now - ts) > tolerance) throw new WebhookVerificationError("Webhook timestamp is outside the tolerance window.");
}

function verifyStandard(payload: string | Uint8Array, id: string, timestamp: string, signature: string, secret: string, options: VerifyWebhookOptions): void {
    checkTimestamp(timestamp, options);
    const expected = fromBase64(signWebhook(payload, { id, timestamp }, secret).slice(3));
    const match = signature.split(" ").some((part) => {
        const [version, sig] = part.split(",", 2);
        const got = version === "v1" && sig ? fromBase64(sig) : null;
        return got !== null && expected !== null && timingSafeEqual(got, expected);
    });
    if (!match) throw new WebhookVerificationError("No matching webhook signature.");
}

/**
 * Throws `WebhookVerificationError` unless the request is signed with
 * `secret`. Pass the raw body exactly as received (not re-serialised JSON).
 */
export function verifyWebhookSignature(payload: string | Uint8Array, headers: WebhookHeaders, secret: string, options: VerifyWebhookOptions = {}): void {
    if (!secret) throw new WebhookVerificationError("Missing webhook secret.");
    const id = header(headers, "webhook-id");
    const timestamp = header(headers, "webhook-timestamp");
    const signature = header(headers, "webhook-signature");
    if (id && timestamp && signature) {
        verifyStandard(payload, id, timestamp, signature, secret, options);
        return;
    }
    const legacy = header(headers, "x-horus-signature");
    if (!legacy) throw new WebhookVerificationError("Missing webhook-id / webhook-timestamp / webhook-signature headers.");
    if (!timingSafeEqualString(legacy, signLegacyWebhook(payload, secret))) throw new WebhookVerificationError("No matching webhook signature.");
}

function parse(payload: string | Uint8Array): unknown {
    try {
        return JSON.parse(typeof payload === "string" ? payload : new TextDecoder().decode(payload)) as unknown;
    } catch {
        throw new WebhookVerificationError("Webhook body is not valid JSON.");
    }
}

/**
 * Verify the signature and return the parsed event. The body format follows
 * the endpoint's `payload_format`: v2 (default) events, or
 * `{ payloadFormat: "v1" }` for endpoints still on the legacy body.
 */
export function verifyWebhook(payload: string | Uint8Array, headers: WebhookHeaders, secret: string, options?: VerifyWebhookOptions & { payloadFormat?: "v2" }): HorusEvent;
export function verifyWebhook(payload: string | Uint8Array, headers: WebhookHeaders, secret: string, options: VerifyWebhookOptions & { payloadFormat: "v1" }): LegacyHorusEvent;
export function verifyWebhook(payload: string | Uint8Array, headers: WebhookHeaders, secret: string, options: VerifyWebhookOptions & { payloadFormat?: "v1" | "v2" } = {}): HorusEvent | LegacyHorusEvent {
    verifyWebhookSignature(payload, headers, secret, options);
    const body = parse(payload);
    if (typeof body !== "object" || body === null || typeof (body as { id?: unknown }).id !== "string") {
        throw new WebhookVerificationError("Webhook body is not an event.");
    }
    return body as HorusEvent | LegacyHorusEvent;
}
