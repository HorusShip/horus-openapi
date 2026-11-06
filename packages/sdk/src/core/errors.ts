/**
 * Typed errors for the API's single error shape:
 *   { "error": { "type", "code", "message", "details"?, "request_id"? } }
 * Branch on the class (`instanceof NotFoundError`) or on `code`
 * (`err.code === "desktop_offline"`).
 */

export type ApiErrorType =
    | "invalid_request"
    | "authentication"
    | "permission"
    | "not_found"
    | "conflict"
    | "rate_limited"
    | "unavailable"
    | "internal";

export interface ApiErrorPayload {
    type: ApiErrorType;
    code: string;
    message: string;
    details?: unknown;
    request_id?: string;
}

/** Base class of everything the SDK throws. */
export class HorusError extends Error {
    override readonly name: string = "HorusError";
}

/** An error response from the API. */
export class APIError extends HorusError {
    override readonly name: string = "APIError";
    readonly status: number;
    readonly type: ApiErrorType;
    readonly code: string;
    readonly details: unknown;
    readonly requestId: string | undefined;
    readonly headers: Headers;

    constructor(status: number, payload: ApiErrorPayload, headers: Headers) {
        super(payload.message);
        this.status = status;
        this.type = payload.type;
        this.code = payload.code;
        this.details = payload.details;
        this.requestId = payload.request_id ?? headers.get("request-id") ?? undefined;
        this.headers = headers;
    }
}

/** 400 / 422: the request was malformed or failed validation (`details.issues`). */
export class InvalidRequestError extends APIError {
    override readonly name: string = "InvalidRequestError";
}

/** 401: missing, invalid, expired or revoked credential. */
export class AuthenticationError extends APIError {
    override readonly name: string = "AuthenticationError";
}

/** 403: the credential lacks a scope (`details.required`) or the account may not do this. */
export class PermissionError extends APIError {
    override readonly name: string = "PermissionError";
}

/** 404: no such resource (or it belongs to someone else). */
export class NotFoundError extends APIError {
    override readonly name: string = "NotFoundError";
}

/** 409: state conflict or Idempotency-Key reuse with a different body. */
export class ConflictError extends APIError {
    override readonly name: string = "ConflictError";
}

/** 429: over the per-credential rate limit. */
export class RateLimitError extends APIError {
    override readonly name: string = "RateLimitError";
    /** Seconds to wait before retrying, when the server said. */
    readonly retryAfter: number | undefined;

    constructor(status: number, payload: ApiErrorPayload, headers: Headers) {
        super(status, payload, headers);
        this.retryAfter = retryAfterSeconds(headers, payload.details);
    }
}

/** 503: a dependency is unreachable (`desktop_offline`, eBay down, ...). */
export class UnavailableError extends APIError {
    override readonly name: string = "UnavailableError";
}

/** 503 `desktop_offline`: the work needs the user's Horus Desktop, which is offline. */
export class DesktopOfflineError extends UnavailableError {
    override readonly name: string = "DesktopOfflineError";
}

/** 5xx: something went wrong on Horus's side. */
export class InternalServerError extends APIError {
    override readonly name: string = "InternalServerError";
}

/** The request never got a response (DNS, TLS, connection reset, ...). */
export class APIConnectionError extends HorusError {
    override readonly name: string = "APIConnectionError";
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
    }
}

/** The request took longer than `timeoutMs`. */
export class APITimeoutError extends APIConnectionError {
    override readonly name: string = "APITimeoutError";
}

/** The caller aborted the request through its `signal`. */
export class APIUserAbortError extends HorusError {
    override readonly name: string = "APIUserAbortError";
}

/** Raised by `jobs.wait()` when the job does not finish in time. */
export class JobTimeoutError extends HorusError {
    override readonly name: string = "JobTimeoutError";
    constructor(readonly jobId: string, readonly lastStatus: string) {
        super(`Job ${jobId} still ${lastStatus} after the wait timeout.`);
    }
}

type ApiErrorClass = new (status: number, payload: ApiErrorPayload, headers: Headers) => APIError;

const BY_TYPE: Record<ApiErrorType, ApiErrorClass> = {
    invalid_request: InvalidRequestError,
    authentication: AuthenticationError,
    permission: PermissionError,
    not_found: NotFoundError,
    conflict: ConflictError,
    rate_limited: RateLimitError,
    unavailable: UnavailableError,
    internal: InternalServerError,
};

const BY_STATUS: Record<number, ApiErrorType> = {
    400: "invalid_request", 401: "authentication", 403: "permission", 404: "not_found",
    409: "conflict", 422: "invalid_request", 429: "rate_limited", 503: "unavailable",
};

function isErrorType(v: unknown): v is ApiErrorType {
    return typeof v === "string" && v in BY_TYPE;
}

function typeForStatus(status: number): ApiErrorType {
    return BY_STATUS[status] ?? (status >= 500 ? "internal" : "invalid_request");
}

/** Pull `{ error: {...} }` out of a body, filling gaps for non-conforming responses. */
export function toErrorPayload(status: number, body: unknown): ApiErrorPayload {
    const raw = typeof body === "object" && body !== null && "error" in body ? (body as { error: unknown }).error : undefined;
    const e = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
    const payload: ApiErrorPayload = {
        type: isErrorType(e.type) ? e.type : typeForStatus(status),
        code: typeof e.code === "string" ? e.code : `http_${status}`,
        message: typeof e.message === "string" ? e.message : typeof body === "string" && body ? body.slice(0, 500) : `HTTP ${status}`,
    };
    if (e.details !== undefined) payload.details = e.details;
    if (typeof e.request_id === "string") payload.request_id = e.request_id;
    return payload;
}

/** Build the right `APIError` subclass for a failed response. */
export function makeApiError(status: number, body: unknown, headers: Headers): APIError {
    const payload = toErrorPayload(status, body);
    if (payload.code === "desktop_offline") return new DesktopOfflineError(status, payload, headers);
    return new BY_TYPE[payload.type](status, payload, headers);
}

/** `Retry-After` (seconds or HTTP date) or `details.retry_after_seconds`. */
export function retryAfterSeconds(headers: Headers, details?: unknown, now: number = Date.now()): number | undefined {
    const header = headers.get("retry-after");
    if (header) {
        const secs = Number(header);
        if (Number.isFinite(secs) && secs >= 0) return secs;
        const date = Date.parse(header);
        if (!Number.isNaN(date)) return Math.max(0, Math.ceil((date - now) / 1000));
    }
    const fromBody = typeof details === "object" && details !== null ? (details as { retry_after_seconds?: unknown }).retry_after_seconds : undefined;
    return typeof fromBody === "number" && fromBody >= 0 ? fromBody : undefined;
}
