/**
 * Turns the OpenAPI document into a flat, normalized list of operations
 * (`OperationInfo`) that every emitter works from.
 */
import type { BodyInfo, OperationInfo, ParamInfo, ParamType, ParamsLocation } from "../../src/core/catalog-types.js";
import { eachOperation, refName, resolveSchema, type OpenApiDocument, type OperationObject, type ParameterObject, type SchemaObject } from "./spec.js";

const SUCCESS = ["200", "201", "202", "204"];

function schemaTypes(schema: SchemaObject): string[] {
    if (Array.isArray(schema.type)) return schema.type;
    return schema.type ? [schema.type] : [];
}

function toParamType(schema: SchemaObject | undefined): ParamType {
    if (!schema) return "unknown";
    if (schema.$ref) return "object";
    const types = schemaTypes(schema).filter((t) => t !== "null");
    if (types.length !== 1) return types.length === 0 && schema.enum ? "string" : "unknown";
    const t = types[0];
    if (t === "string" || t === "integer" || t === "number" || t === "boolean" || t === "array" || t === "object") return t;
    return "unknown";
}

function stringEnum(schema: SchemaObject): string[] | undefined {
    if (!schema.enum) return undefined;
    const values = schema.enum.filter((v): v is string => typeof v === "string");
    return values.length === schema.enum.length ? values : undefined;
}

export function toParamInfo(name: string, schema: SchemaObject, required: boolean, description?: string): ParamInfo {
    const type = toParamType(schema);
    const values = stringEnum(schema);
    const desc = description ?? schema.description;
    const info: { -readonly [K in keyof ParamInfo]: ParamInfo[K] } = { name, type, required };
    if (type === "array") info.itemType = toParamType(schema.items);
    if (values) info.enum = values;
    if (schemaTypes(schema).includes("null")) info.nullable = true;
    if (desc) info.description = desc;
    if (schema.default !== undefined) info.default = schema.default;
    return info;
}

function paramsIn(op: OperationObject, where: ParameterObject["in"]): ParamInfo[] {
    return (op.parameters ?? [])
        .filter((p) => p.in === where)
        .map((p) => toParamInfo(p.name, p.schema, where === "path" || p.required === true, p.description));
}

function objectProperties(doc: OpenApiDocument, schema: SchemaObject | undefined): { props: ParamInfo[]; required: string[] } {
    const resolved = resolveSchema(doc, schema);
    if (!resolved?.properties) return { props: [], required: [] };
    const required = resolved.required ?? [];
    const props = Object.entries(resolved.properties).map(([name, s]) => toParamInfo(name, s, required.includes(name)));
    return { props, required };
}

function bodyInfo(doc: OpenApiDocument, op: OperationObject): BodyInfo | null {
    const schema = op.requestBody?.content["application/json"]?.schema;
    if (!op.requestBody || !schema) return null;
    const { props, required } = objectProperties(doc, schema);
    return { required: op.requestBody.required === true || required.length > 0, schema: refName(schema), properties: props };
}

function successResponse(op: OperationObject): { status: number; schema: SchemaObject | undefined } {
    const code = SUCCESS.find((c) => op.responses[c] !== undefined);
    if (!code) throw new Error(`${op.operationId}: no 2xx response`);
    return { status: Number(code), schema: op.responses[code]?.content?.["application/json"]?.schema };
}

function isPaginated(doc: OpenApiDocument, op: OperationObject, response: SchemaObject | undefined): boolean {
    const hasCursor = (op.parameters ?? []).some((p) => p.in === "query" && p.name === "cursor");
    const props = resolveSchema(doc, response)?.properties;
    return hasCursor && props?.has_more !== undefined && props.next_cursor !== undefined && props.data !== undefined;
}

function paramsLocation(id: string, query: ParamInfo[], body: BodyInfo | null): ParamsLocation {
    if (body && query.length > 0) throw new Error(`${id}: has both a query and a body; the generator maps one params object to one location`);
    if (body) return "body";
    return query.length > 0 ? "query" : "none";
}

function hasIdempotencyHeader(op: OperationObject): boolean {
    return (op.parameters ?? []).some((p) => p.in === "header" && p.name.toLowerCase() === "idempotency-key");
}

export function buildOperations(doc: OpenApiDocument): OperationInfo[] {
    const seen = new Set<string>();
    return eachOperation(doc).map(({ path, method, op }) => {
        const id = op.operationId;
        if (!id) throw new Error(`${method} ${path}: missing operationId`);
        if (seen.has(id)) throw new Error(`duplicate operationId ${id}`);
        seen.add(id);
        const query = paramsIn(op, "query");
        const body = bodyInfo(doc, op);
        const success = successResponse(op);
        const info: OperationInfo = {
            id, method, path,
            params: paramsLocation(id, query, body),
            idempotent: method !== "GET" && hasIdempotencyHeader(op),
            paginated: isPaginated(doc, op, success.schema),
            summary: op.summary ?? id,
            ...(op.description ? { description: op.description } : {}),
            tag: op.tags?.[0] ?? id.split(".")[0] ?? id,
            scopes: op["x-horus-scopes"] ?? [],
            requiresDesktop: op["x-horus-requires-desktop"] === true,
            status: success.status,
            response: refName(success.schema),
            pathParams: paramsIn(op, "path"),
            query,
            body,
        };
        return info;
    }).sort((a, b) => a.id.localeCompare(b.id));
}

/** Whether a call needs its params argument (any required query param or body field). */
export function paramsRequired(op: OperationInfo): boolean {
    if (op.params === "body") return op.body?.required === true;
    if (op.params === "query") return op.query.some((q) => q.required);
    return false;
}

/** Webhook event name → payload component name, in document order. */
export function buildEvents(doc: OpenApiDocument): { type: string; schema: string; summary: string }[] {
    return Object.entries(doc.webhooks ?? {}).map(([type, item]) => {
        const schema = refName(item.post?.requestBody?.content["application/json"]?.schema);
        if (!schema) throw new Error(`webhook ${type}: payload must be a named schema`);
        return { type, schema, summary: item.post?.summary ?? type };
    });
}
