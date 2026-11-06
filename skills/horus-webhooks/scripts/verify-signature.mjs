#!/usr/bin/env node
// Verify a Horus webhook delivery (Standard Webhooks, v1 HMAC-SHA256). No dependencies.
//
// Library use:
//   import { verifyHorus } from "./verify-signature.mjs";
//   verifyHorus(secret, { id, timestamp, signature }, rawBodyString) // → boolean
//
// CLI:
//   HORUS_WEBHOOK_SECRET=whsec_... node verify-signature.mjs --id evt_... --timestamp 1762516800 \
//     --signature "v1,..." --body-file body.json [--no-time-check]
// Exit code 0 = valid, 1 = invalid.
import { createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const TOLERANCE_SECONDS = 300;

export function verifyHorus(secret, h, rawBody, { checkTime = true, now = Date.now() / 1000 } = {}) {
    const ts = Number(h.timestamp);
    if (!Number.isInteger(ts)) return false;
    if (checkTime && Math.abs(now - ts) > TOLERANCE_SECONDS) return false;
    const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    const expected = createHmac("sha256", key).update(`${h.id}.${h.timestamp}.${rawBody}`).digest();
    return String(h.signature).split(" ").some((part) => {
        const [version, sig] = part.split(",");
        const got = Buffer.from(sig ?? "", "base64");
        return version === "v1" && got.length === expected.length && timingSafeEqual(got, expected);
    });
}

function arg(name) {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : undefined;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const secret = process.env.HORUS_WEBHOOK_SECRET;
    const [id, timestamp, signature, bodyFile] = ["id", "timestamp", "signature", "body-file"].map(arg);
    if (!secret || !id || !timestamp || !signature || !bodyFile) {
        console.error("usage: HORUS_WEBHOOK_SECRET=… node verify-signature.mjs --id … --timestamp … --signature … --body-file …");
        process.exit(2);
    }
    const ok = verifyHorus(secret, { id, timestamp, signature }, readFileSync(bodyFile, "utf8"), { checkTime: !process.argv.includes("--no-time-check") });
    console.log(ok ? "valid" : "INVALID");
    process.exit(ok ? 0 : 1);
}
