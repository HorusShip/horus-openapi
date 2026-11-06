/**
 * Builds an authenticated SDK client for a command: HORUS_API_KEY wins, then
 * the selected profile. OAuth profiles refresh before expiry and on a 401,
 * and every rotated refresh token is written back to the profile.
 */
import { DEFAULT_BASE_URL, Horus } from "@horusship/sdk";
import { DEFAULT_PROFILE, getProfile, setProfile, type OAuthProfile, type Profile } from "./config.js";
import type { CliContext } from "./context.js";
import { refreshAccessToken, type TokenResponse } from "./oauth.js";
import { UsageError } from "./params.js";

export interface SessionOptions {
    profile?: string;
    baseUrl?: string;
    timeoutMs?: number;
}

export interface Session {
    horus: Horus;
    profileName: string;
    /** "env" (HORUS_API_KEY), "api_key" or "oauth". */
    source: "env" | "api_key" | "oauth";
    baseUrl: string;
}

const EXPIRY_MARGIN_MS = 60_000;

export function profileName(ctx: CliContext, opts: SessionOptions): string {
    return opts.profile ?? ctx.env.HORUS_PROFILE ?? DEFAULT_PROFILE;
}

export function resolveBaseUrl(ctx: CliContext, opts: SessionOptions, profile?: Profile): string {
    return (opts.baseUrl ?? ctx.env.HORUS_BASE_URL ?? profile?.base_url ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export function applyToken(profile: OAuthProfile, t: TokenResponse, now: number): OAuthProfile {
    const next: OAuthProfile = { ...profile, access_token: t.access_token };
    if (t.refresh_token) next.refresh_token = t.refresh_token;
    if (t.expires_in) next.expires_at = now + t.expires_in * 1000;
    if (t.scope) next.scope = t.scope;
    return next;
}

class OAuthTokens {
    constructor(private profile: OAuthProfile, private readonly ctx: CliContext, private readonly name: string) {}

    async current(): Promise<string> {
        const exp = this.profile.expires_at;
        if (exp !== undefined && exp - EXPIRY_MARGIN_MS <= Date.now() && this.profile.refresh_token) return this.refresh();
        return this.profile.access_token;
    }

    async refresh(): Promise<string> {
        const rt = this.profile.refresh_token;
        if (!rt) throw new UsageError("Your session expired. Run `horus login` again.");
        const t = await refreshAccessToken(this.ctx.fetch, this.profile.token_endpoint, this.profile.client_id, rt);
        this.profile = applyToken(this.profile, t, Date.now());
        await setProfile(this.ctx.configDir, this.name, this.profile);
        return this.profile.access_token;
    }
}

function common(ctx: CliContext, baseUrl: string, opts: SessionOptions): { baseUrl: string; fetch: CliContext["fetch"]; timeoutMs?: number } {
    return { baseUrl, fetch: ctx.fetch, ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}) };
}

export async function openSession(ctx: CliContext, opts: SessionOptions = {}): Promise<Session> {
    const name = profileName(ctx, opts);
    const envKey = ctx.env.HORUS_API_KEY?.trim();
    if (envKey) {
        const baseUrl = resolveBaseUrl(ctx, opts);
        return { horus: new Horus({ apiKey: envKey, ...common(ctx, baseUrl, opts) }), profileName: name, source: "env", baseUrl };
    }
    const profile = await getProfile(ctx.configDir, name);
    if (!profile) throw new UsageError(`Not logged in${name === DEFAULT_PROFILE ? "" : ` (profile "${name}")`}. Run \`horus login\` or set HORUS_API_KEY.`);
    const baseUrl = resolveBaseUrl(ctx, opts, profile);
    if (profile.type === "api_key") {
        return { horus: new Horus({ apiKey: profile.api_key, ...common(ctx, baseUrl, opts) }), profileName: name, source: "api_key", baseUrl };
    }
    const tokens = new OAuthTokens(profile, ctx, name);
    const horus = new Horus({ accessToken: () => tokens.current(), refresh: () => tokens.refresh(), ...common(ctx, baseUrl, opts) });
    return { horus, profileName: name, source: "oauth", baseUrl };
}
