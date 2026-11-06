/**
 * `@horusship/sdk/catalog`: full operation metadata (summaries, parameters,
 * scopes) for tools built on the SDK, such as the CLI. Kept out of the main
 * entry so apps don't ship it.
 */
export { CATALOG } from "./generated/catalog.js";
export { EVENT_TYPES } from "./generated/events.js";
export { API_VERSION } from "./generated/routes.js";
export type { BodyInfo, HttpMethod, OperationInfo, ParamInfo, ParamType, ParamsLocation, RouteInfo } from "./core/catalog-types.js";
