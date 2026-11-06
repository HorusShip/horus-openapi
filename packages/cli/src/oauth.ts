/**
 * OAuth for `horus login` (docs/public-api/AUTH.md §4): Atlas device flow
 * with the first-party public client, refresh-token rotation and revocation.
 * The issuer is discovered, never assumed: RFC 9728 protected-resource
 * metadata first, then known Atlas issuers (overridable with HORUS_ISSUER).
 */
import type { FetchLike } from "@horusship/sdk";

const PROD = {
    clientId: "client_l-jl-kdtR9r2Z-P4XfguzZ-N",
    issuers: ["https://auth.horusship.com", "https://noble-koala-13-fapi.atlasauth.net"],
};
const DEV = {
    clientId: "client_mldnGhMKiY1tnZnF59pZZS5q",
    issuers: ["https://gentle-narwhal-19-fapi.atlasauth.net"],
};

export const SCOPE_AREAS = [
    "account", "accounts", "ebay", "listings", "sales", "returns", "sourcing", "leads", "messages",
    "settings", "proxies", "inboxes", "studio", "analytics", "webhooks", "desktop",
] as const;

/** Full access (write implies read) plus a refresh token. */
export const DEFAULT_SCOPE = ["openid", "offline_access", ...SCOPE_AREAS.map((a) => `${a}:write`)].join(" ");

export interface OAuthEnvironment {
    resource: string;
    clientId: string;
    issuers: string[];
}

export interface AuthServer {
    issuer: string;
    token_endpoint: string;
    device_authorization_endpoint: string;
    revocation_endpoint?: string;
}

export interface DeviceCode {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete?: string;
    expires_in: number;
    interval?: number;
}

export interface TokenResponse {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
}

export class OAuthError extends Error {
    override readonly name = "OAuthError";
    constructor(readonly code: string, message: string) {
        super(message);
    }
}

type Env = Readonly<Record<string, string | undefined>>;

function isLocal(url: string): boolean {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

export function oauthEnvironment(baseUrl: string, env: Env): OAuthEnvironment {
    const known = isLocal(baseUrl) ? DEV : PROD;
    const issuers = env.HORUS_ISSUER ? [env.HORUS_ISSUER] : known.issuers;
    return { resource: baseUrl.replace(/\/+$/, ""), clientId: env.HORUS_CLIENT_ID ?? known.clientId, issuers };
}

async function getJson(fetch: FetchLike, url: string): Promise<Record<string, unknown> | undefined> {
    try {
        const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
        if (!res.ok) return undefined;
        const body = (await res.json()) as unknown;
        return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : undefined;
    } catch {
        return undefined;
    }
}

/** RFC 9728: `https://host/.well-known/oauth-protected-resource/<resource path>`. */
async function resourceMetadataIssuer(fetch: FetchLike, resource: string): Promise<string | undefined> {
    const u = new URL(resource);
    const meta = await getJson(fetch, `${u.origin}/.well-known/oauth-protected-resource${u.pathname.replace(/\/+$/, "")}`);
    const servers = meta?.authorization_servers;
    return Array.isArray(servers) && typeof servers[0] === "string" ? servers[0] : undefined;
}

function asAuthServer(meta: Record<string, unknown> | undefined): AuthServer | undefined {
    if (!meta) return undefined;
    const { issuer, token_endpoint, device_authorization_endpoint, revocation_endpoint } = meta;
    if (typeof issuer !== "string" || typeof token_endpoint !== "string" || typeof device_authorization_endpoint !== "string") return undefined;
    return { issuer, token_endpoint, device_authorization_endpoint, ...(typeof revocation_endpoint === "string" ? { revocation_endpoint } : {}) };
}

export async function discover(fetch: FetchLike, oauth: OAuthEnvironment): Promise<AuthServer> {
    const advertised = await resourceMetadataIssuer(fetch, oauth.resource);
    const candidates = [...new Set([...(advertised ? [advertised] : []), ...oauth.issuers])];
    for (const issuer of candidates) {
        const base = issuer.replace(/\/+$/, "");
        const server = asAuthServer(await getJson(fetch, `${base}/.well-known/openid-configuration`))
            ?? asAuthServer(await getJson(fetch, `${base}/.well-known/oauth-authorization-server`));
        if (server) return server;
    }
    throw new OAuthError("discovery_failed", `Could not reach the Horus sign-in service (tried ${candidates.join(", ")}). Set HORUS_ISSUER or use --api-key.`);
}

async function postForm(fetch: FetchLike, url: string, form: Record<string, string>): Promise<{ status: number; body: Record<string, unknown> }> {
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams(form).toString(),
        signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
        const parsed = JSON.parse(text) as unknown;
        if (typeof parsed === "object" && parsed !== null) body = parsed as Record<string, unknown>;
    } catch {
        body = { error: "invalid_response", error_description: text.slice(0, 200) };
    }
    return { status: res.status, body };
}

function oauthFailure(body: Record<string, unknown>, fallback: string): OAuthError {
    const code = typeof body.error === "string" ? body.error : fallback;
    const desc = typeof body.error_description === "string" ? body.error_description : code;
    return new OAuthError(code, desc);
}

function asToken(body: Record<string, unknown>): TokenResponse {
    if (typeof body.access_token !== "string") throw oauthFailure(body, "invalid_token_response");
    return body as unknown as TokenResponse;
}

export async function startDeviceFlow(fetch: FetchLike, server: AuthServer, oauth: OAuthEnvironment, scope: string): Promise<DeviceCode> {
    const { status, body } = await postForm(fetch, server.device_authorization_endpoint, { client_id: oauth.clientId, scope, resource: oauth.resource });
    if (status >= 400 || typeof body.device_code !== "string" || typeof body.user_code !== "string") throw oauthFailure(body, "device_authorization_failed");
    return body as unknown as DeviceCode;
}

export interface PollOptions {
    sleep: (ms: number) => Promise<void>;
    now?: () => number;
}

/** Poll the token endpoint per RFC 8628 (`authorization_pending`, `slow_down`). */
export async function pollDeviceToken(fetch: FetchLike, server: AuthServer, oauth: OAuthEnvironment, device: DeviceCode, opts: PollOptions): Promise<TokenResponse> {
    const now = opts.now ?? Date.now;
    const deadline = now() + device.expires_in * 1000;
    let interval = (device.interval ?? 5) * 1000;
    for (;;) {
        await opts.sleep(interval);
        if (now() > deadline) throw new OAuthError("expired_token", "The sign-in code expired. Run `horus login` again.");
        const { status, body } = await postForm(fetch, server.token_endpoint, {
            grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: device.device_code, client_id: oauth.clientId,
        });
        if (status < 400 && typeof body.access_token === "string") return asToken(body);
        if (body.error === "authorization_pending") continue;
        if (body.error === "slow_down") {
            interval += 5000;
            continue;
        }
        throw oauthFailure(body, "device_token_failed");
    }
}

export async function refreshAccessToken(fetch: FetchLike, tokenEndpoint: string, clientId: string, refreshToken: string): Promise<TokenResponse> {
    const { status, body } = await postForm(fetch, tokenEndpoint, { grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId });
    if (status >= 400) throw oauthFailure(body, "refresh_failed");
    return asToken(body);
}

/** Best effort: revocation failures never block a local logout. */
export async function revokeToken(fetch: FetchLike, revocationEndpoint: string, clientId: string, token: string): Promise<boolean> {
    try {
        const { status } = await postForm(fetch, revocationEndpoint, { token, client_id: clientId });
        return status < 400;
    } catch {
        return false;
    }
}
