/**
 * HTTP transport: auth header, Idempotency-Key on writes, per-attempt
 * timeout, retries with backoff, one token refresh on 401, typed errors.
 */
import type { Credentials } from "./auth.js";
import type { HttpMethod } from "./catalog-types.js";
import { randomId } from "./env.js";
import { APIConnectionError, APIError, APITimeoutError, APIUserAbortError, makeApiError, retryAfterSeconds, RateLimitError } from "./errors.js";
import type { RequestOptions } from "./requester.js";
import { isRetryable, retryDelayMs, sleep } from "./retry.js";
import type { QueryValue } from "./types.js";
import { buildUrl } from "./url.js";

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface HttpConfig {
    baseUrl: string;
    timeoutMs: number;
    maxRetries: number;
    fetch: FetchLike;
    defaultHeaders: Record<string, string>;
}

export interface HttpRequest {
    method: HttpMethod;
    path: string;
    query?: Record<string, QueryValue>;
    body?: unknown;
    /** Send an Idempotency-Key (writes the API deduplicates). */
    idempotent: boolean;
}

export interface HttpResponse<T> {
    status: number;
    headers: Headers;
    data: T;
}

class TimeoutSignal {
    readonly controller = new AbortController();
    timedOut = false;
    private readonly timer: ReturnType<typeof setTimeout>;
    private readonly unlink: () => void;

    constructor(timeoutMs: number, parent?: AbortSignal) {
        this.timer = setTimeout(() => {
            this.timedOut = true;
            this.controller.abort();
        }, timeoutMs);
        const onAbort = (): void => this.controller.abort(parent?.reason);
        if (parent?.aborted) this.controller.abort(parent.reason);
        parent?.addEventListener("abort", onAbort, { once: true });
        this.unlink = (): void => parent?.removeEventListener("abort", onAbort);
    }

    dispose(): void {
        clearTimeout(this.timer);
        this.unlink();
    }
}

async function readBody(res: Response): Promise<unknown> {
    if (res.status === 204) return undefined;
    const text = await res.text();
    if (!text) return undefined;
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return text;
    }
}

export class HttpClient {
    constructor(private readonly config: HttpConfig, private readonly credentials: Credentials) {}

    async request<T>(req: HttpRequest, options: RequestOptions = {}): Promise<HttpResponse<T>> {
        const key = req.idempotent ? options.idempotencyKey ?? randomId() : undefined;
        const maxRetries = options.maxRetries ?? this.config.maxRetries;
        let refreshed = false;
        let retries = 0;
        for (;;) {
            try {
                return await this.attempt<T>(req, key, options);
            } catch (err) {
                if (!refreshed && err instanceof APIError && this.credentials.canRefresh(err)) {
                    refreshed = true;
                    await this.credentials.refresh();
                    continue;
                }
                if (retries >= maxRetries || !isRetryable(err)) throw err;
                retries++;
                await sleep(retryDelayMs(retries, retryAfterOf(err)), options.signal).catch((cause: unknown): never => {
                    throw new APIUserAbortError("Request aborted.", { cause });
                });
            }
        }
    }

    private async headers(req: HttpRequest, key: string | undefined, options: RequestOptions): Promise<Record<string, string>> {
        const h: Record<string, string> = {
            Accept: "application/json",
            ...this.config.defaultHeaders,
            Authorization: `Bearer ${await this.credentials.bearer()}`,
        };
        if (req.body !== undefined) h["Content-Type"] = "application/json";
        if (key) h["Idempotency-Key"] = key;
        return { ...h, ...options.headers };
    }

    private async attempt<T>(req: HttpRequest, key: string | undefined, options: RequestOptions): Promise<HttpResponse<T>> {
        const url = buildUrl(this.config.baseUrl, req.path, req.query);
        const init: RequestInit = { method: req.method, headers: await this.headers(req, key, options) };
        if (req.body !== undefined) init.body = JSON.stringify(req.body);
        if (options.signal?.aborted) throw new APIUserAbortError("Request aborted.", { cause: options.signal.reason });
        const timeout = new TimeoutSignal(options.timeoutMs ?? this.config.timeoutMs, options.signal);
        init.signal = timeout.controller.signal;
        try {
            const res = await this.config.fetch(url, init);
            const data = await readBody(res);
            if (!res.ok) throw makeApiError(res.status, data, res.headers);
            return { status: res.status, headers: res.headers, data: data as T };
        } catch (err) {
            throw classifyFailure(err, timeout, options.signal);
        } finally {
            timeout.dispose();
        }
    }
}

function classifyFailure(err: unknown, timeout: TimeoutSignal, userSignal?: AbortSignal): unknown {
    if (err instanceof APIError) return err;
    if (userSignal?.aborted) return new APIUserAbortError("Request aborted.", { cause: err });
    if (timeout.timedOut) return new APITimeoutError("Request timed out.", { cause: err });
    const message = err instanceof Error ? err.message : String(err);
    return new APIConnectionError(`Connection error: ${message}`, { cause: err });
}

function retryAfterOf(err: unknown): number | undefined {
    if (err instanceof RateLimitError) return err.retryAfter;
    if (err instanceof APIError) return retryAfterSeconds(err.headers, err.details);
    return undefined;
}
