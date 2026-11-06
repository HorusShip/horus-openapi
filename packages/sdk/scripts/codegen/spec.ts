/**
 * Minimal, typed view of the OpenAPI 3.1 document the generator needs.
 * Only the fields we read are modelled; everything else is ignored.
 */
export interface SchemaObject {
    $ref?: string;
    type?: string | string[];
    enum?: unknown[];
    const?: unknown;
    description?: string;
    default?: unknown;
    properties?: Record<string, SchemaObject>;
    required?: string[];
    items?: SchemaObject;
    allOf?: SchemaObject[];
    anyOf?: SchemaObject[];
    oneOf?: SchemaObject[];
    format?: string;
    minimum?: number;
    maximum?: number;
}

export interface ParameterObject {
    name: string;
    in: "query" | "path" | "header" | "cookie";
    required?: boolean;
    description?: string;
    schema: SchemaObject;
}

export interface MediaTypeObject {
    schema?: SchemaObject;
}

export interface RequestBodyObject {
    required?: boolean;
    content: Record<string, MediaTypeObject>;
}

export interface ResponseObject {
    description: string;
    content?: Record<string, MediaTypeObject>;
}

export interface OperationObject {
    operationId?: string;
    summary?: string;
    description?: string;
    tags?: string[];
    parameters?: ParameterObject[];
    requestBody?: RequestBodyObject;
    responses: Record<string, ResponseObject>;
    "x-horus-scopes"?: string[];
    "x-horus-requires-desktop"?: boolean;
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export const HTTP_METHODS: readonly HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

export type PathItem = Partial<Record<Lowercase<HttpMethod>, OperationObject>>;

export interface WebhookItem {
    post?: OperationObject;
}

export interface OpenApiDocument {
    openapi: string;
    info: { title: string; version: string; description?: string };
    servers?: { url: string }[];
    paths: Record<string, PathItem>;
    webhooks?: Record<string, WebhookItem>;
    components: { schemas: Record<string, SchemaObject> };
}

/** Name of the component a `$ref` points at, or null. */
export function refName(schema: SchemaObject | undefined): string | null {
    const ref = schema?.$ref;
    if (!ref) return null;
    const name = ref.split("/").pop();
    return name ?? null;
}

/** Follow one level of `$ref` (component refs only). */
export function resolveSchema(doc: OpenApiDocument, schema: SchemaObject | undefined): SchemaObject | undefined {
    const name = refName(schema);
    if (!name) return schema;
    return doc.components.schemas[name];
}

/** Every `(path, method, operation)` in document order. */
export function eachOperation(doc: OpenApiDocument): { path: string; method: HttpMethod; op: OperationObject }[] {
    const out: { path: string; method: HttpMethod; op: OperationObject }[] = [];
    for (const [path, item] of Object.entries(doc.paths)) {
        for (const method of HTTP_METHODS) {
            const op = item[method.toLowerCase() as Lowercase<HttpMethod>];
            if (op) out.push({ path, method, op });
        }
    }
    return out;
}
