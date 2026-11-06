/**
 * Credentials: an API key (`ak_…` / legacy `horus_pat_…`) or an OAuth access
 * token with an optional `refresh` callback. Everything goes out as
 * `Authorization: Bearer <credential>`.
 */
import { AuthenticationError, HorusError, type APIError } from "./errors.js";
import { readEnv } from "./env.js";

/** A token, or a function that returns the current one (sync or async). */
export type TokenSource = string | (() => string | Promise<string>);

export interface AuthOptions {
    /** API key. Defaults to the `HORUS_API_KEY` environment variable. */
    apiKey?: string;
    /** OAuth access token (or a function returning it). */
    accessToken?: TokenSource;
    /**
     * Called when the API rejects the access token as expired/invalid; return
     * a fresh access token. The request is then retried once.
     */
    refresh?: () => Promise<string>;
}

/** 401 codes a token refresh can fix. */
const REFRESHABLE = new Set(["invalid_access_token", "session_expired"]);

export class Credentials {
    private token: TokenSource;
    private refreshing: Promise<string> | undefined;

    private constructor(token: TokenSource, private readonly refresher: (() => Promise<string>) | undefined) {
        this.token = token;
    }

    static from(opts: AuthOptions): Credentials {
        if (opts.apiKey && opts.accessToken) throw new HorusError("Pass either apiKey or accessToken, not both.");
        if (opts.accessToken) return new Credentials(opts.accessToken, opts.refresh);
        const key = opts.apiKey ?? readEnv("HORUS_API_KEY");
        if (!key) throw new HorusError("No credentials: pass { apiKey } or { accessToken }, or set HORUS_API_KEY.");
        return new Credentials(key, undefined);
    }

    async bearer(): Promise<string> {
        const t = typeof this.token === "function" ? await this.token() : this.token;
        if (!t) throw new HorusError("The access token source returned an empty token.");
        return t;
    }

    /** True when `err` is a 401 that a refresh may fix. */
    canRefresh(err: APIError): boolean {
        return this.refresher !== undefined && err instanceof AuthenticationError && REFRESHABLE.has(err.code);
    }

    /** Run the refresh callback once even if several requests fail together. */
    async refresh(): Promise<void> {
        if (!this.refresher) return;
        this.refreshing ??= this.refresher().finally(() => {
            this.refreshing = undefined;
        });
        this.token = await this.refreshing;
    }
}
