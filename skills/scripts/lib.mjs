// Shared helpers for the skills scripts: load the OpenAPI document and index it.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SKILLS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_SPEC = resolve(SKILLS_DIR, "..", "openapi", "openapi.json");

/** Load the spec from a file path or an http(s) URL. */
export async function loadSpec(source = DEFAULT_SPEC) {
    if (/^https?:\/\//.test(source)) {
        const res = await fetch(source);
        if (!res.ok) throw new Error(`GET ${source} → ${res.status}`);
        return res.json();
    }
    return JSON.parse(readFileSync(source, "utf8"));
}

const METHODS = ["get", "post", "put", "patch", "delete"];

/** Every operation as { id, tool, method, path, summary, scopes, async, desktop }. */
export function operations(spec) {
    const out = [];
    for (const [path, item] of Object.entries(spec.paths ?? {})) {
        for (const method of METHODS) {
            const op = item[method];
            if (!op?.operationId) continue;
            const codes = Object.keys(op.responses ?? {});
            out.push({
                id: op.operationId,
                tool: toolName(op.operationId),
                method: method.toUpperCase(),
                path,
                summary: op.summary ?? "",
                scopes: op["x-horus-scopes"] ?? [],
                async: codes.includes("202"),
                desktop: codes.includes("503"),
            });
        }
    }
    return out;
}

/** Webhook events as { type, summary, schema }. */
export function events(spec) {
    return Object.entries(spec.webhooks ?? {}).map(([type, item]) => {
        const body = item.post?.requestBody?.content?.["application/json"]?.schema;
        return { type, summary: item.post?.summary ?? "", schema: body?.$ref?.split("/").pop() ?? null };
    });
}

/** operationId → MCP tool name (dots become underscores). */
export function toolName(operationId) {
    return operationId.replace(/\./g, "_");
}

/** operationId → CLI words (`sales.markRefunded` → `sales mark-refunded`). */
export function cliWords(operationId) {
    return operationId.split(".").map((s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)).join(" ");
}
