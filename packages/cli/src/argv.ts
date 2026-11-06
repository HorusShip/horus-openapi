/**
 * Argument tokenizer. Flags are `--name value`, `--name=value`, repeated
 * flags accumulate, `--` ends flags, `-h` is `--help`. Boolean flags only
 * consume a following `true`/`false`; `--no-name` sets false.
 */

export type FlagValue = string | boolean;

export interface ParsedArgs {
    positionals: string[];
    flags: Map<string, FlagValue[]>;
}

/** Whether a flag is boolean (doesn't take the next token unless it's true/false). */
export type IsBooleanFlag = (name: string) => boolean;

const BOOL_WORDS = new Set(["true", "false"]);

/** `--tracking_number` and `--trackingNumber` → `tracking-number`. */
export function normalizeFlag(name: string): string {
    return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/_/g, "-").toLowerCase();
}

function push(flags: Map<string, FlagValue[]>, name: string, value: FlagValue): void {
    const list = flags.get(name) ?? [];
    list.push(value);
    flags.set(name, list);
}

function parseFlag(tokens: readonly string[], i: number, flags: Map<string, FlagValue[]>, isBool: IsBooleanFlag): number {
    const body = tokens[i]?.slice(2) ?? "";
    const eq = body.indexOf("=");
    if (eq >= 0) {
        push(flags, normalizeFlag(body.slice(0, eq)), body.slice(eq + 1));
        return i;
    }
    const name = normalizeFlag(body);
    if (name.startsWith("no-") && isBool(name.slice(3))) {
        push(flags, name.slice(3), false);
        return i;
    }
    const next = tokens[i + 1];
    if (isBool(name)) {
        if (next !== undefined && BOOL_WORDS.has(next)) {
            push(flags, name, next === "true");
            return i + 1;
        }
        push(flags, name, true);
        return i;
    }
    if (next === undefined || (next.startsWith("--") && next.length > 2)) {
        push(flags, name, true);
        return i;
    }
    push(flags, name, next);
    return i + 1;
}

export function parseArgs(tokens: readonly string[], isBool: IsBooleanFlag): ParsedArgs {
    const positionals: string[] = [];
    const flags = new Map<string, FlagValue[]>();
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i] ?? "";
        if (t === "--") {
            positionals.push(...tokens.slice(i + 1));
            break;
        }
        if (t === "-h") push(flags, "help", true);
        else if (t.startsWith("--") && t.length > 2) i = parseFlag(tokens, i, flags, isBool);
        else positionals.push(t);
    }
    return { positionals, flags };
}

/** Last value of a flag. */
export function flag(args: ParsedArgs, name: string): FlagValue | undefined {
    const list = args.flags.get(name);
    return list?.[list.length - 1];
}

/** Last string value of a flag (a bare flag counts as missing). */
export function stringFlag(args: ParsedArgs, name: string): string | undefined {
    const v = flag(args, name);
    return typeof v === "string" ? v : undefined;
}

export function boolFlag(args: ParsedArgs, name: string): boolean {
    const v = flag(args, name);
    return v === true || v === "true";
}
