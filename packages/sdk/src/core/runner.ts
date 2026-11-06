/** Executes generated operations by id using the route table. */
import { ROUTES, type RouteId } from "../generated/routes.js";
import type { RouteInfo } from "./catalog-types.js";
import type { HttpClient, HttpRequest } from "./http.js";
import { Paginator } from "./pagination.js";
import type { PathParams, RequestOptions, Requester } from "./requester.js";
import type { ItemOf, OperationId, PageShape, QueryValue, ResponseOf } from "./types.js";
import { fillPath } from "./url.js";

function asQuery(params: unknown): Record<string, QueryValue> | undefined {
    if (params === undefined || params === null) return undefined;
    if (typeof params !== "object" || Array.isArray(params)) throw new TypeError("Query parameters must be an object.");
    return params as Record<string, QueryValue>;
}

export function toHttpRequest(route: RouteInfo, path: PathParams, params: unknown): HttpRequest {
    const req: HttpRequest = { method: route.method, path: fillPath(route.path, path), idempotent: route.idempotent };
    if (route.params === "query") {
        const query = asQuery(params);
        if (query) req.query = query;
    } else if (route.params === "body") {
        req.body = params ?? {};
    }
    return req;
}

type ListResponse<K extends OperationId> = ResponseOf<K> & PageShape<ItemOf<K>>;

export class OperationRunner implements Requester {
    constructor(private readonly http: HttpClient) {}

    async call<K extends OperationId & RouteId>(id: K, path: PathParams, params: unknown, options?: RequestOptions): Promise<ResponseOf<K>> {
        const res = await this.http.request<ResponseOf<K>>(toHttpRequest(ROUTES[id], path, params), options);
        return res.data;
    }

    paginate<K extends OperationId & RouteId>(id: K, path: PathParams, params: unknown, options?: RequestOptions): Paginator<ItemOf<K>, ListResponse<K>> {
        const base = asQuery(params) ?? {};
        const fetchPage = (cursor: string | undefined): Promise<ListResponse<K>> => {
            const query = cursor ? { ...base, cursor } : base;
            return this.call(id, path, query, options) as Promise<ListResponse<K>>;
        };
        return new Paginator<ItemOf<K>, ListResponse<K>>(fetchPage);
    }
}
