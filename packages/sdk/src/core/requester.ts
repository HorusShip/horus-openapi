/** The contract between the generated resource methods and the HTTP client. */
import type { RouteId } from "../generated/routes.js";
import type { Paginator } from "./pagination.js";
import type { ItemOf, OperationId, ResponseOf } from "./types.js";

/** Per-call overrides. */
export interface RequestOptions {
    /** Reuse your own key to make a write idempotent across processes (default: one generated per call). */
    idempotencyKey?: string;
    /** Abort after this many ms (per attempt). */
    timeoutMs?: number;
    /** Retries for 429 / 5xx / network errors. */
    maxRetries?: number;
    /** Cancel the request. */
    signal?: AbortSignal;
    /** Extra headers. */
    headers?: Record<string, string>;
}

export type PathParams = Record<string, string | number>;

export interface Requester {
    call<K extends OperationId & RouteId>(id: K, path: PathParams, params: unknown, options?: RequestOptions): Promise<ResponseOf<K>>;
    paginate<K extends OperationId & RouteId>(id: K, path: PathParams, params: unknown, options?: RequestOptions): Paginator<ItemOf<K>, ResponseOf<K> & { object: "list"; data: ItemOf<K>[]; has_more: boolean; next_cursor: string | null }>;
}
