/**
 * Shapes of the generated operation tables (`src/generated/routes.ts`,
 * `src/generated/catalog.ts`). Shared by the generator, the client and the CLI.
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Where an operation's single `params` argument goes on the wire. */
export type ParamsLocation = "body" | "query" | "none";

/** The minimum the client needs at runtime to make a call. */
export interface RouteInfo {
    readonly method: HttpMethod;
    /** OpenAPI path template, e.g. `/sales/{id}/ship`. */
    readonly path: string;
    readonly params: ParamsLocation;
    /** Accepts `Idempotency-Key` (the SDK sends one automatically). */
    readonly idempotent: boolean;
    /** Cursor-paginated list (`limit` + `cursor` → `has_more` + `next_cursor`). */
    readonly paginated: boolean;
}

export type ParamType = "string" | "integer" | "number" | "boolean" | "array" | "object" | "unknown";

export interface ParamInfo {
    readonly name: string;
    readonly type: ParamType;
    /** Element type for arrays. */
    readonly itemType?: ParamType;
    readonly enum?: readonly string[];
    readonly required: boolean;
    readonly nullable?: boolean;
    readonly description?: string;
    readonly default?: unknown;
}

export interface BodyInfo {
    readonly required: boolean;
    /** Component name when the body is a named schema. */
    readonly schema: string | null;
    /** Top-level properties (empty when the body is not a plain object). */
    readonly properties: readonly ParamInfo[];
}

/** Everything known about one operation: used for CLI commands and help. */
export interface OperationInfo extends RouteInfo {
    readonly id: string;
    readonly summary: string;
    readonly description?: string;
    readonly tag: string;
    readonly scopes: readonly string[];
    readonly requiresDesktop: boolean;
    /** Success status code (200, 201, 202, 204). */
    readonly status: number;
    /** Component name of the success response, when named. */
    readonly response: string | null;
    readonly pathParams: readonly ParamInfo[];
    readonly query: readonly ParamInfo[];
    readonly body: BodyInfo | null;
}
