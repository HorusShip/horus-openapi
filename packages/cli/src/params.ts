/**
 * Turn flags, positionals and `--data` into an operation's path params and
 * its single params object (query or body), coercing values by the spec type.
 */
import type { OperationInfo, ParamInfo, ParamType } from "@horusship/sdk/catalog";
import { normalizeFlag, type FlagValue, type ParsedArgs } from "./argv.js";
import type { CliContext } from "./context.js";

export class UsageError extends Error {
    override readonly name = "UsageError";
}

export const flagName = (p: ParamInfo): string => normalizeFlag(p.name);

/** Query params or body properties: what the flags map onto. */
export function flagParams(op: OperationInfo): readonly ParamInfo[] {
    if (op.params === "body") return op.body?.properties ?? [];
    return op.params === "query" ? op.query : [];
}

export const isBoolLike = (p: ParamInfo): boolean =>
    p.type === "boolean" || (p.enum?.length === 2 && p.enum.includes("true") && p.enum.includes("false"));

/** `--data '{"a":1}'`, `--data @file.json` or `--data -` (stdin). */
export async function loadData(value: string, ctx: CliContext): Promise<unknown> {
    const text = value === "-" ? await ctx.readStdin() : value.startsWith("@") ? await ctx.readFile(value.slice(1)) : value;
    try {
        return JSON.parse(text) as unknown;
    } catch {
        throw new UsageError(`--data is not valid JSON${value.startsWith("@") ? ` (${value.slice(1)})` : ""}.`);
    }
}

function parseJson(p: ParamInfo, raw: string): unknown {
    try {
        return JSON.parse(raw) as unknown;
    } catch {
        if (p.type === "unknown") return raw;
        throw new UsageError(`--${flagName(p)} expects JSON.`);
    }
}

function scalar(p: ParamInfo, type: ParamType, raw: string): unknown {
    if (p.nullable && raw === "null") return null;
    if (type === "integer" || type === "number") {
        const n = Number(raw);
        if (raw.trim() === "" || !Number.isFinite(n) || (type === "integer" && !Number.isInteger(n))) throw new UsageError(`--${flagName(p)} expects ${type === "integer" ? "an integer" : "a number"}, got "${raw}".`);
        return n;
    }
    if (type === "boolean") {
        if (raw === "true" || raw === "1") return true;
        if (raw === "false" || raw === "0") return false;
        throw new UsageError(`--${flagName(p)} expects true or false.`);
    }
    if (type === "object" || type === "unknown") return parseJson(p, raw);
    if (p.enum && !p.enum.includes(raw)) throw new UsageError(`--${flagName(p)} must be one of: ${p.enum.join(", ")}.`);
    return raw;
}

function arrayValue(p: ParamInfo, values: FlagValue[]): unknown[] {
    const strings = values.map((v) => (typeof v === "string" ? v : String(v)));
    if (strings.length === 1 && strings[0]?.trim().startsWith("[")) {
        const parsed = parseJson(p, strings[0]);
        if (!Array.isArray(parsed)) throw new UsageError(`--${flagName(p)} expects a JSON array.`);
        return parsed;
    }
    const item = p.itemType ?? "string";
    const parts = item === "object" || item === "unknown" ? strings : strings.flatMap((s) => s.split(","));
    return parts.map((s) => scalar({ ...p, enum: undefined, nullable: false }, item, s.trim()));
}

export function coerce(p: ParamInfo, values: FlagValue[]): unknown {
    if (p.type === "array") return arrayValue(p, values);
    const last = values[values.length - 1];
    if (typeof last === "boolean") {
        if (p.type === "boolean") return last;
        if (isBoolLike(p)) return String(last);
        throw new UsageError(`--${flagName(p)} needs a value.`);
    }
    return scalar(p, p.type, last ?? "");
}

function asObject(data: unknown, op: OperationInfo): Record<string, unknown> {
    if (data === undefined) return {};
    if (typeof data !== "object" || data === null || Array.isArray(data)) throw new UsageError(`--data for ${op.id} must be a JSON object.`);
    return { ...(data as Record<string, unknown>) };
}

/** Merge `--data` with per-field flags (flags win). */
export function buildParams(op: OperationInfo, args: ParsedArgs, data: unknown, reserved: ReadonlySet<string>): Record<string, unknown> | undefined {
    if (op.params === "none") {
        if (data !== undefined) throw new UsageError(`${op.id} takes no parameters.`);
        return undefined;
    }
    const out = asObject(data, op);
    const byFlag = new Map(flagParams(op).map((p) => [flagName(p), p]));
    const pathFlags = new Set(op.pathParams.map(flagName));
    for (const [name, values] of args.flags) {
        if (reserved.has(name) || pathFlags.has(name)) continue;
        const p = byFlag.get(name);
        if (!p) throw new UsageError(`Unknown flag --${name}. Run with --help to see the flags.`);
        out[p.name] = coerce(p, values);
    }
    return out;
}

/** Path params from positionals (in order) or `--<name>` flags. */
export function pathParams(op: OperationInfo, rest: readonly string[], args: ParsedArgs): Record<string, string> {
    if (rest.length > op.pathParams.length) throw new UsageError(`Unexpected argument "${rest[op.pathParams.length] ?? ""}".`);
    const out: Record<string, string> = {};
    op.pathParams.forEach((p, i) => {
        const fromFlag = args.flags.get(flagName(p));
        const value = rest[i] ?? (typeof fromFlag?.[0] === "string" ? fromFlag[0] : undefined);
        if (!value) throw new UsageError(`Missing <${p.name}>.`);
        out[p.name] = value;
    });
    return out;
}

export function missingRequired(op: OperationInfo, params: Record<string, unknown> | undefined): string[] {
    return flagParams(op).filter((p) => p.required && params?.[p.name] === undefined).map((p) => `--${flagName(p)}`);
}
