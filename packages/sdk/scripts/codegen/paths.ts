import { readFileSync } from "node:fs";
import type { OpenApiDocument } from "./spec.js";

/** The pinned spec at the repo root. */
export const SPEC_URL = new URL("../../../../openapi/openapi.json", import.meta.url);
/** packages/sdk/src/generated/ */
export const OUT_DIR = new URL("../../src/generated/", import.meta.url);

export function loadSpec(): OpenApiDocument {
    return JSON.parse(readFileSync(SPEC_URL, "utf8")) as OpenApiDocument;
}
