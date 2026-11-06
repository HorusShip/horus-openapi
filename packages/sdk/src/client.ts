/**
 * The Horus API client.
 *
 *   const horus = new Horus({ apiKey: process.env.HORUS_API_KEY });
 *   for await (const listing of horus.listings.list({ status: "LISTED" })) { ... }
 *   const job = await horus.accounts.jobs.create(accountId, { kind: "VERIFY_SESSION" });
 *   const done = await horus.jobs.wait(job.id);
 */
import { Credentials, type AuthOptions } from "./core/auth.js";
import type { HttpMethod } from "./core/catalog-types.js";
import { readEnv } from "./core/env.js";
import { HorusError } from "./core/errors.js";
import { HttpClient, type FetchLike, type HttpRequest } from "./core/http.js";
import type { Paginator } from "./core/pagination.js";
import type { PathParams, RequestOptions } from "./core/requester.js";
import { DEFAULT_MAX_RETRIES } from "./core/retry.js";
import { OperationRunner } from "./core/runner.js";
import type { ItemOf, ListPage, OperationId, QueryValue, ResponseOf } from "./core/types.js";
import { createResources, type Resources } from "./generated/resources.js";
import type { RouteId } from "./generated/routes.js";
import type { Job } from "./generated/schemas.js";
import { waitForJob, type WaitForJobOptions } from "./jobs.js";
import { SDK_VERSION } from "./version.js";

export const DEFAULT_BASE_URL = "https://horusship.com/api/v1";
export const DEFAULT_TIMEOUT_MS = 60_000;

export interface HorusOptions extends AuthOptions {
    /** API root (default `https://horusship.com/api/v1`, or `HORUS_BASE_URL`). */
    baseUrl?: string;
    /** Per-attempt timeout in ms (default 60 000). */
    timeoutMs?: number;
    /** Retries for 429 / 5xx / network errors (default 2). Writes reuse one Idempotency-Key. */
    maxRetries?: number;
    /** Custom fetch (default: global fetch). */
    fetch?: FetchLike;
    /** Headers sent with every request. */
    defaultHeaders?: Record<string, string>;
}

export interface RawRequestOptions extends RequestOptions {
    query?: Record<string, QueryValue>;
    body?: unknown;
    /** Send an Idempotency-Key (default: true for anything but GET). */
    idempotent?: boolean;
}

type JobsResource = Resources["jobs"] & {
    /** Poll `GET /jobs/{id}` until the job is SUCCEEDED, FAILED or CANCELLED. */
    wait(job: string | Pick<Job, "id">, options?: WaitForJobOptions): Promise<Job>;
};

function resolveFetch(custom?: FetchLike): FetchLike {
    if (custom) return custom;
    if (typeof globalThis.fetch !== "function") throw new HorusError("No global fetch; pass { fetch } (Node 18+, Bun, Deno and browsers have one).");
    return (input, init) => globalThis.fetch(input, init);
}

/** Every generated namespace (`horus.listings`, `horus.sales`, ...) is merged onto the class. */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Horus extends Readonly<Omit<Resources, "jobs">> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Horus {
    static readonly VERSION = SDK_VERSION;

    readonly baseUrl: string;
    private readonly http: HttpClient;
    private readonly runner: OperationRunner;

    readonly jobs: JobsResource;

    constructor(options: HorusOptions = {}) {
        this.baseUrl = (options.baseUrl ?? readEnv("HORUS_BASE_URL") ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
        this.http = new HttpClient({
            baseUrl: this.baseUrl,
            timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
            maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
            fetch: resolveFetch(options.fetch),
            defaultHeaders: options.defaultHeaders ?? {},
        }, Credentials.from(options));
        this.runner = new OperationRunner(this.http);
        const r = createResources(this.runner);
        Object.assign(this, r);
        const jobs = r.jobs;
        this.jobs = { ...jobs, wait: (job, opts) => waitForJob((id) => jobs.get(id), job, opts) };
    }

    /**
     * Call an operation by its operationId: `horus.call("sales.ship", { id }, { tracking_number })`.
     * Same as the namespaced method; handy for dynamic dispatch (agents, the CLI).
     */
    call<K extends OperationId & RouteId>(id: K, path: PathParams, params?: unknown, options?: RequestOptions): Promise<ResponseOf<K>> {
        return this.runner.call(id, path, params, options);
    }

    /** `call()` for cursor-paginated list operations, returning a `Paginator`. */
    paginate<K extends OperationId & RouteId>(id: K, path: PathParams, params?: unknown, options?: RequestOptions): Paginator<ItemOf<K>, ListPage<K>> {
        return this.runner.paginate(id, path, params, options);
    }

    /**
     * Call any endpoint by method and path (relative to the API root), with
     * the same auth, retries and errors as the typed methods.
     */
    async request<T = unknown>(method: HttpMethod, path: string, options: RawRequestOptions = {}): Promise<T> {
        const { query, body, idempotent, ...rest } = options;
        const req: HttpRequest = { method, path, idempotent: idempotent ?? method !== "GET" };
        if (query) req.query = query;
        if (body !== undefined) req.body = body;
        const res = await this.http.request<T>(req, rest);
        return res.data;
    }
}
