/** Byte helpers with no Buffer dependency. */

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_INDEX: Record<string, number> = Object.fromEntries([...B64].map((c, i) => [c, i]));

export const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

export function toBase64(bytes: Uint8Array): string {
    let out = "";
    for (let i = 0; i < bytes.length; i += 3) {
        const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
        const left = bytes.length - i;
        out += B64[(n >> 18) & 63] ?? "";
        out += B64[(n >> 12) & 63] ?? "";
        out += left > 1 ? B64[(n >> 6) & 63] ?? "" : "=";
        out += left > 2 ? B64[n & 63] ?? "" : "=";
    }
    return out;
}

/** Decode standard or URL-safe base64; returns null on invalid input. */
export function fromBase64(input: string): Uint8Array | null {
    const clean = input.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
    if (!/^[A-Za-z0-9+/]*$/.test(clean) || clean.length % 4 === 1) return null;
    const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
    let bits = 0;
    let value = 0;
    let j = 0;
    for (const c of clean) {
        value = (value << 6) | (B64_INDEX[c] ?? 0);
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out[j++] = (value >> bits) & 0xff;
        }
    }
    return out;
}

export function toHex(bytes: Uint8Array): string {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time comparison (time depends only on the lengths). */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
    return diff === 0;
}

/** Constant-time string comparison over UTF-8 bytes. */
export function timingSafeEqualString(a: string, b: string): boolean {
    return timingSafeEqual(utf8(a), utf8(b));
}
