export { Horus, DEFAULT_BASE_URL, DEFAULT_TIMEOUT_MS, type HorusOptions, type RawRequestOptions } from "./client.js";
export { SDK_VERSION } from "./version.js";

export type { AuthOptions, TokenSource } from "./core/auth.js";
export type { FetchLike } from "./core/http.js";
export type { RequestOptions } from "./core/requester.js";
export { Paginator } from "./core/pagination.js";
export type { BodyOf, ItemOf, ListPage, OperationId, PageShape, PathOf, QueryOf, ResponseOf } from "./core/types.js";
export type { BodyInfo, HttpMethod, OperationInfo, ParamInfo, ParamType, ParamsLocation, RouteInfo } from "./core/catalog-types.js";
export { isRetryable } from "./core/retry.js";

export {
    HorusError,
    APIError,
    InvalidRequestError,
    AuthenticationError,
    PermissionError,
    NotFoundError,
    ConflictError,
    RateLimitError,
    UnavailableError,
    DesktopOfflineError,
    InternalServerError,
    APIConnectionError,
    APITimeoutError,
    APIUserAbortError,
    JobTimeoutError,
    type ApiErrorPayload,
    type ApiErrorType,
} from "./core/errors.js";

export { waitForJob, isTerminal, TERMINAL_JOB_STATUSES, type JobStatus, type WaitForJobOptions } from "./jobs.js";

export {
    verifyWebhook,
    verifyWebhookSignature,
    signWebhook,
    signLegacyWebhook,
    WebhookVerificationError,
    DEFAULT_TOLERANCE_SECONDS,
    type LegacyHorusEvent,
    type VerifyWebhookOptions,
    type WebhookHeaders,
} from "./webhooks/verify.js";

export { ROUTES, API_VERSION, type RouteId } from "./generated/routes.js";
export { EVENT_TYPES, type HorusEvent, type HorusEventMap, type HorusEventOf, type HorusEventType } from "./generated/events.js";
export type { Resources } from "./generated/resources.js";
export type * from "./generated/schemas.js";
export type { components, operations, paths, webhooks } from "./generated/openapi.js";
