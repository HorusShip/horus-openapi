/**
 * `horus webhooks verify`: check a delivery's signature locally (no API call).
 *
 *   horus webhooks verify --secret whsec_… --payload @body.json \
 *     --header "webhook-id: evt_…" --header "webhook-timestamp: 1762516800" --header "webhook-signature: v1,…"
 *   (or --id / --timestamp / --signature; --legacy-signature sha256=…)
 */
import { verifyWebhook, WebhookVerificationError } from "@horusship/sdk";
import { boolFlag, stringFlag, type ParsedArgs } from "./argv.js";
import type { CliContext } from "./context.js";
import { toJson } from "./output.js";
import { UsageError } from "./params.js";

export const VERIFY_FLAGS: ReadonlySet<string> = new Set(["secret", "payload", "header", "id", "timestamp", "signature", "legacy-signature", "tolerance", "ignore-timestamp"]);
export const VERIFY_BOOLEANS: ReadonlySet<string> = new Set(["ignore-timestamp"]);

export function headerMap(args: ParsedArgs): Record<string, string> {
    const out: Record<string, string> = {};
    for (const raw of args.flags.get("header") ?? []) {
        const s = String(raw);
        const colon = s.indexOf(":");
        if (colon <= 0) throw new UsageError(`--header expects "name: value", got "${s}".`);
        out[s.slice(0, colon).trim().toLowerCase()] = s.slice(colon + 1).trim();
    }
    const direct: [string, string][] = [["id", "webhook-id"], ["timestamp", "webhook-timestamp"], ["signature", "webhook-signature"], ["legacy-signature", "x-horus-signature"]];
    for (const [flagName, header] of direct) {
        const v = stringFlag(args, flagName);
        if (v) out[header] = v;
    }
    return out;
}

async function readPayload(ctx: CliContext, args: ParsedArgs): Promise<string> {
    const p = stringFlag(args, "payload") ?? stringFlag(args, "data");
    if (p === undefined) throw new UsageError("--payload is required (the raw body: @file, - for stdin, or the string).");
    if (p === "-") return ctx.readStdin();
    return p.startsWith("@") ? ctx.readFile(p.slice(1)) : p;
}

function tolerance(args: ParsedArgs): number | undefined {
    if (boolFlag(args, "ignore-timestamp")) return Number.MAX_SAFE_INTEGER;
    const t = stringFlag(args, "tolerance");
    if (t === undefined) return undefined;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) throw new UsageError("--tolerance expects seconds.");
    return n;
}

export async function verifyCommand(ctx: CliContext, args: ParsedArgs): Promise<number> {
    const secret = stringFlag(args, "secret") ?? ctx.env.HORUS_WEBHOOK_SECRET;
    if (!secret) throw new UsageError("--secret (or HORUS_WEBHOOK_SECRET) is required.");
    const payload = await readPayload(ctx, args);
    const tol = tolerance(args);
    const json = boolFlag(args, "json");
    try {
        const event = verifyWebhook(payload, headerMap(args), secret, tol === undefined ? {} : { toleranceSeconds: tol });
        const type = "type" in event ? event.type : "";
        ctx.stdout(json ? toJson({ valid: true, event }) : `Signature valid. ${type ? `Event ${type} ` : ""}${event.id}\n`);
        return 0;
    } catch (e) {
        if (!(e instanceof WebhookVerificationError)) throw e;
        ctx.stdout(json ? toJson({ valid: false, error: e.message }) : `Signature INVALID: ${e.message}\n`);
        return 1;
    }
}
