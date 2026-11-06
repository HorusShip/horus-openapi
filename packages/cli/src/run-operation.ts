/** `horus <resource> <verb> …`: run one generated operation. */
import { ROUTES, type Job, type RequestOptions, type RouteId } from "@horusship/sdk";
import type { OperationInfo } from "@horusship/sdk/catalog";
import { boolFlag, stringFlag, type ParsedArgs } from "./argv.js";
import type { CliContext } from "./context.js";
import { GLOBAL_FLAG_NAMES, printResult, sessionOptions } from "./globals.js";
import { buildParams, loadData, missingRequired, pathParams, UsageError } from "./params.js";
import { openSession, type Session } from "./session.js";

const DEFAULT_WAIT_S = 600;

function routeId(op: OperationInfo): RouteId {
    if (!(op.id in ROUTES)) throw new UsageError(`Unknown operation ${op.id}.`);
    return op.id as RouteId;
}

function isJob(v: unknown): v is Job {
    return typeof v === "object" && v !== null && (v as { object?: unknown }).object === "job" && typeof (v as { id?: unknown }).id === "string";
}

function requestOptions(args: ParsedArgs): RequestOptions {
    const key = stringFlag(args, "idempotency-key");
    return key ? { idempotencyKey: key } : {};
}

async function collectParams(op: OperationInfo, args: ParsedArgs, ctx: CliContext): Promise<Record<string, unknown> | undefined> {
    const raw = stringFlag(args, "data");
    const data = raw === undefined ? undefined : await loadData(raw, ctx);
    const params = buildParams(op, args, data, GLOBAL_FLAG_NAMES);
    const missing = missingRequired(op, params);
    if (missing.length) throw new UsageError(`Missing required ${missing.join(", ")}. Run with --help to see the flags.`);
    return params;
}

async function fetchResult(session: Session, op: OperationInfo, path: Record<string, string>, params: unknown, args: ParsedArgs): Promise<unknown> {
    const id = routeId(op);
    const options = requestOptions(args);
    if (op.paginated && boolFlag(args, "all")) {
        const data = await session.horus.paginate(id, path, params, options).toArray();
        return { object: "list", data, has_more: false, next_cursor: null };
    }
    return session.horus.call(id, path, params, options);
}

async function waitIfAsked(session: Session, result: unknown, args: ParsedArgs, ctx: CliContext): Promise<unknown> {
    if (!boolFlag(args, "wait") || !isJob(result)) return result;
    const seconds = Number(stringFlag(args, "wait-timeout") ?? DEFAULT_WAIT_S);
    if (!Number.isFinite(seconds) || seconds <= 0) throw new UsageError("--wait-timeout expects a number of seconds.");
    const interval = Number(stringFlag(args, "wait-interval") ?? 2);
    if (!Number.isFinite(interval) || interval <= 0) throw new UsageError("--wait-interval expects a number of seconds.");
    const quiet = boolFlag(args, "json");
    let last = "";
    return session.horus.jobs.wait(result.id, {
        timeoutMs: seconds * 1000,
        intervalMs: interval * 1000,
        onPoll: (job): void => {
            if (quiet || job.status === last) return;
            last = job.status;
            ctx.stderr(`job ${job.id}: ${job.status}\n`);
        },
    });
}

/** Exit status: 0, or 1 when a waited-for job did not succeed. */
export async function runOperation(op: OperationInfo, args: ParsedArgs, rest: readonly string[], ctx: CliContext): Promise<number> {
    const path = pathParams(op, rest, args);
    const params = await collectParams(op, args, ctx);
    const session = await openSession(ctx, sessionOptions(args));
    const result = await waitIfAsked(session, await fetchResult(session, op, path, params, args), args, ctx);
    printResult(ctx, args, result);
    return isJob(result) && boolFlag(args, "wait") && result.status !== "SUCCEEDED" ? 1 : 0;
}
