/**
 * `jobs.wait()`: poll a 202 desktop job until it finishes. Desktop-dependent
 * calls (`accounts.verify`, `accounts.jobs.create`, `returns.initiate`, ...)
 * return a `Job` straight away; the user's Horus Desktop runs it.
 */
import { APIUserAbortError, JobTimeoutError } from "./core/errors.js";
import { sleep } from "./core/retry.js";
import type { Job } from "./generated/schemas.js";

export type JobStatus = Job["status"];

export const TERMINAL_JOB_STATUSES: readonly JobStatus[] = ["SUCCEEDED", "FAILED", "CANCELLED"];

export interface WaitForJobOptions {
    /** Give up after this long (default 10 minutes). Throws `JobTimeoutError`. */
    timeoutMs?: number;
    /** Delay between polls (default 2 s). */
    intervalMs?: number;
    /** Cancel the wait (the job itself keeps running; use `jobs.cancel` to stop it). */
    signal?: AbortSignal;
    /** Called with every polled state. */
    onPoll?: (job: Job) => void;
}

export const DEFAULT_JOB_TIMEOUT_MS = 10 * 60_000;
export const DEFAULT_JOB_INTERVAL_MS = 2_000;

export function isTerminal(job: Pick<Job, "status">): boolean {
    return TERMINAL_JOB_STATUSES.includes(job.status);
}

/** Resolves with the finished job (check `status`: SUCCEEDED, FAILED or CANCELLED). */
export async function waitForJob(getJob: (id: string) => Promise<Job>, job: string | Pick<Job, "id">, options: WaitForJobOptions = {}): Promise<Job> {
    const id = typeof job === "string" ? job : job.id;
    const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_JOB_TIMEOUT_MS);
    const interval = options.intervalMs ?? DEFAULT_JOB_INTERVAL_MS;
    for (;;) {
        if (options.signal?.aborted) throw new APIUserAbortError("Job wait aborted.");
        const current = await getJob(id);
        options.onPoll?.(current);
        if (isTerminal(current)) return current;
        const left = deadline - Date.now();
        if (left <= 0) throw new JobTimeoutError(id, current.status);
        await sleep(Math.min(interval, left), options.signal).catch((cause: unknown): never => {
            throw new APIUserAbortError("Job wait aborted.", { cause });
        });
    }
}
