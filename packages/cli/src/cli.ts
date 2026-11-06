/**
 * Entry point: parse argv, route to a built-in or a generated operation,
 * print, and map failures to exit codes (0 ok, 1 API/runtime error, 2 usage).
 */
import { APIError, HorusError, SDK_VERSION } from "@horusship/sdk";
import { CATALOG, type OperationInfo } from "@horusship/sdk/catalog";
import { apiCommand, API_FLAGS } from "./api-command.js";
import { parseArgs, boolFlag, type ParsedArgs } from "./argv.js";
import { login, logout, LOGIN_BOOLEANS, whoami } from "./auth-commands.js";
import { buildCommandTree, resolveCommand, type CommandNode } from "./commands.js";
import type { CliContext } from "./context.js";
import { GLOBAL_BOOLEANS } from "./globals.js";
import { groupHelp, operationHelp, rootHelp } from "./help.js";
import { OAuthError } from "./oauth.js";
import { toJson } from "./output.js";
import { flagName, flagParams, isBoolLike, UsageError } from "./params.js";
import { runOperation } from "./run-operation.js";
import { VERIFY_BOOLEANS, verifyCommand } from "./webhooks-verify.js";

export const CLI_VERSION = "0.1.0";
export const EXIT = { ok: 0, error: 1, usage: 2 } as const;

const TREE: CommandNode = buildCommandTree(CATALOG);

type Builtin = (ctx: CliContext, args: ParsedArgs, rest: readonly string[]) => Promise<number>;

const BUILTINS: Record<string, Builtin> = {
    login: (ctx, args) => login(ctx, args),
    logout: (ctx, args) => logout(ctx, args),
    whoami: (ctx, args) => whoami(ctx, args),
    api: (ctx, args, rest) => apiCommand(ctx, args, rest),
};

const baseBooleans = (name: string): boolean => GLOBAL_BOOLEANS.has(name) || LOGIN_BOOLEANS.has(name) || VERIFY_BOOLEANS.has(name);

function opBooleans(op: OperationInfo): (name: string) => boolean {
    const bools = new Set(flagParams(op).filter(isBoolLike).map(flagName));
    return (name) => baseBooleans(name) || bools.has(name);
}

function checkFlags(args: ParsedArgs, allowed: ReadonlySet<string>, command: string): void {
    for (const name of args.flags.keys()) {
        if (!allowed.has(name) && !GLOBAL_BOOLEANS.has(name) && !["profile", "base-url", "timeout", "data", "idempotency-key"].includes(name)) {
            throw new UsageError(`Unknown flag --${name} for ${command}.`);
        }
    }
}

async function runGenerated(argv: readonly string[], ctx: CliContext, first: ParsedArgs): Promise<number> {
    const { node, rest } = resolveCommand(TREE, first.positionals);
    if (node.op) {
        const args = parseArgs(argv, opBooleans(node.op));
        const again = resolveCommand(TREE, args.positionals);
        if (boolFlag(args, "help")) return print(ctx, operationHelp(node.op));
        return runOperation(node.op, args, again.rest, ctx);
    }
    if (node.path.join(" ") === "webhooks" && rest[0] === "verify") {
        if (boolFlag(first, "help")) return print(ctx, VERIFY_HELP);
        return verifyCommand(ctx, first);
    }
    if (rest.length > 0) {
        const hint = ["horus", ...node.path, "--help"].join(" ");
        throw new UsageError(`Unknown command "${[...node.path, rest[0]].join(" ")}". Run \`${hint}\`.`);
    }
    return print(ctx, node.path.length === 0 ? rootHelp(TREE, CLI_VERSION) : groupHelp(node));
}

const VERIFY_HELP = `Check a webhook delivery's signature locally (no API call).

Usage
  horus webhooks verify --secret whsec_… --payload @body.json \\
    --id <webhook-id> --timestamp <webhook-timestamp> --signature "v1,…"

Flags
  --secret <whsec_…>          Endpoint secret (or HORUS_WEBHOOK_SECRET)
  --payload <@file|-|text>    The raw request body
  --header "name: value"      Any delivery header (repeatable)
  --id / --timestamp / --signature   Standard Webhooks headers
  --legacy-signature <sha256=…>      X-Horus-Signature (v1 endpoints)
  --tolerance <s>             Max timestamp skew (default 300)
  --ignore-timestamp          Skip the timestamp check (old captured deliveries)
  --json                      { "valid", "event" | "error" }
`;

function print(ctx: CliContext, text: string): number {
    ctx.stdout(text);
    return EXIT.ok;
}

async function dispatch(argv: readonly string[], ctx: CliContext): Promise<number> {
    const first = parseArgs(argv, baseBooleans);
    if (boolFlag(first, "version")) return print(ctx, `horus ${CLI_VERSION} (sdk ${SDK_VERSION})\n`);
    const [command, ...rest] = first.positionals;
    if (command === "help") return dispatch([...rest, "--help"], ctx);
    const builtin = command ? BUILTINS[command] : undefined;
    if (!builtin) return runGenerated(argv, ctx, first);
    if (boolFlag(first, "help")) return print(ctx, rootHelp(TREE, CLI_VERSION));
    const allowed = command === "login" ? new Set(["api-key", "scopes", "no-browser"]) : command === "api" ? API_FLAGS : new Set<string>();
    checkFlags(first, allowed, `horus ${command}`);
    return builtin(ctx, first, rest);
}

function errorJson(e: unknown): Record<string, unknown> {
    if (e instanceof APIError) return { error: { status: e.status, type: e.type, code: e.code, message: e.message, details: e.details ?? null, request_id: e.requestId ?? null } };
    if (e instanceof UsageError) return { error: { type: "usage", code: "usage_error", message: e.message } };
    if (e instanceof OAuthError) return { error: { type: "authentication", code: e.code, message: e.message } };
    const name = e instanceof HorusError ? e.name : "Error";
    return { error: { type: "client", code: name, message: e instanceof Error ? e.message : String(e) } };
}

function errorText(e: unknown): string {
    if (e instanceof APIError) return `Error ${e.status} ${e.code}: ${e.message}${e.requestId ? ` (request ${e.requestId})` : ""}\n`;
    return `Error: ${e instanceof Error ? e.message : String(e)}\n`;
}

/** Run the CLI; returns the exit code. Errors go to stdout as JSON with --json, else to stderr. */
export async function run(argv: readonly string[], ctx: CliContext): Promise<number> {
    try {
        return await dispatch(argv, ctx);
    } catch (e) {
        if (argv.includes("--json")) ctx.stdout(toJson(errorJson(e)));
        else ctx.stderr(errorText(e));
        return e instanceof UsageError ? EXIT.usage : EXIT.error;
    }
}
