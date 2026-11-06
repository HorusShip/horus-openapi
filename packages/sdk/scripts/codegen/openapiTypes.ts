/** `src/generated/openapi.ts`: raw spec types from openapi-typescript. */
import openapiTS, { astToString, COMMENT_HEADER } from "openapi-typescript";

export async function emitOpenapiTypes(specUrl: URL): Promise<string> {
    const ast = await openapiTS(specUrl);
    return `${COMMENT_HEADER}${astToString(ast)}`;
}
