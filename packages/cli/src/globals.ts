/** Flags every command understands, and the shared output step. */
import { boolFlag, stringFlag, type ParsedArgs } from "./argv.js";
import type { CliContext } from "./context.js";
import { renderHuman, toJson } from "./output.js";
import { UsageError } from "./params.js";
import type { SessionOptions } from "./session.js";

export const GLOBAL_BOOLEANS: ReadonlySet<string> = new Set(["json", "all", "wait", "help", "version"]);
export const GLOBAL_FLAG_NAMES: ReadonlySet<string> = new Set([
    ...GLOBAL_BOOLEANS, "wait-timeout", "wait-interval", "data", "idempotency-key", "profile", "base-url", "timeout",
]);

export function sessionOptions(args: ParsedArgs): SessionOptions {
    const opts: SessionOptions = {};
    const profile = stringFlag(args, "profile");
    const baseUrl = stringFlag(args, "base-url");
    const timeout = stringFlag(args, "timeout");
    if (profile) opts.profile = profile;
    if (baseUrl) opts.baseUrl = baseUrl;
    if (timeout !== undefined) {
        const ms = Number(timeout);
        if (!Number.isInteger(ms) || ms <= 0) throw new UsageError("--timeout expects milliseconds.");
        opts.timeoutMs = ms;
    }
    return opts;
}

export function printResult(ctx: CliContext, args: ParsedArgs, result: unknown): void {
    ctx.stdout(boolFlag(args, "json") ? toJson(result) : renderHuman(result));
}
