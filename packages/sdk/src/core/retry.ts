/** Retry policy: which failures are worth another attempt, and how long to wait. */
import { APIConnectionError, APIError } from "./errors.js";

export const DEFAULT_MAX_RETRIES = 2;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8_000;
/** Never sleep longer than this, even if Retry-After asks for more. */
const MAX_RETRY_AFTER_MS = 60_000;

/** Server codes that mean "try again later" even though the status alone is not retryable. */
const RETRYABLE_CODES = new Set(["idempotency_in_progress"]);
/** 503s that will not fix themselves in seconds. */
const PERMANENT_CODES = new Set(["desktop_offline"]);

export function isRetryable(err: unknown): boolean {
    if (err instanceof APIConnectionError) return true;
    if (!(err instanceof APIError)) return false;
    if (PERMANENT_CODES.has(err.code)) return false;
    if (RETRYABLE_CODES.has(err.code)) return true;
    const s = err.status;
    return s === 408 || s === 429 || (s >= 500 && s !== 501);
}

/**
 * Delay before retry number `attempt` (1-based): exponential with full
 * jitter, or the server's Retry-After when it gave one.
 */
export function retryDelayMs(attempt: number, retryAfterSeconds?: number, random: () => number = Math.random): number {
    if (retryAfterSeconds !== undefined) return Math.min(retryAfterSeconds * 1000, MAX_RETRY_AFTER_MS);
    const ceiling = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
    return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(signal.reason);
            return;
        }
        const onAbort = (): void => {
            clearTimeout(timer);
            reject(signal?.reason);
        };
        const timer = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, ms);
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}
