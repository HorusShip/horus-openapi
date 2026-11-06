import type { QueryValue } from "./types.js";
import type { PathParams } from "./requester.js";

/** `/sales/{id}/ship` + `{ id: "s_1" }` → `/sales/s_1/ship` (segments URL-encoded). */
export function fillPath(template: string, params: PathParams): string {
    return template.replace(/\{(\w+)\}/g, (_m, name: string) => {
        const value = params[name];
        if (value === undefined || value === "") throw new TypeError(`Missing path parameter "${name}" for ${template}`);
        return encodeURIComponent(String(value));
    });
}

function queryString(value: Exclude<QueryValue, null | undefined>): string {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(String).join(",");
    return String(value);
}

/** Join base URL, path and query (undefined/null values are skipped). */
export function buildUrl(baseUrl: string, path: string, query?: Record<string, QueryValue>): string {
    const base = baseUrl.replace(/\/+$/, "");
    const url = new URL(`${base}${path.startsWith("/") ? path : `/${path}`}`);
    for (const [key, value] of Object.entries(query ?? {})) {
        if (value === undefined || value === null) continue;
        url.searchParams.set(key, queryString(value));
    }
    return url.toString();
}
