import { statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { credentialsPath, defaultConfigDir, getProfile, loadCredentials, setProfile, type OAuthProfile } from "../src/config.js";
import { DEFAULT_SCOPE, oauthEnvironment } from "../src/oauth.js";
import { json, makeCli, me, type Call } from "./helpers.js";

const ISSUER = "https://issuer.test";
const DISCOVERY = {
    issuer: ISSUER,
    token_endpoint: `${ISSUER}/oauth2/token`,
    device_authorization_endpoint: `${ISSUER}/oauth2/device_authorization`,
    revocation_endpoint: `${ISSUER}/oauth2/revoke`,
};
const API = "https://api.test/api/v1";
const form = (c: Call | undefined): Record<string, string> => Object.fromEntries(new URLSearchParams(c?.body ?? ""));

describe("config", () => {
    it("picks the OS config dir", () => {
        expect(defaultConfigDir({ APPDATA: "C:\\Users\\u\\AppData\\Roaming" }, "win32", "C:\\Users\\u")).toMatch(/Roaming[\\/]horus$/);
        expect(defaultConfigDir({}, "darwin", "/Users/u")).toMatch(/Library[\\/]Application Support[\\/]horus$/);
        expect(defaultConfigDir({ XDG_CONFIG_HOME: "/x" }, "linux", "/home/u")).toMatch(/[\\/]x[\\/]horus$/);
        expect(defaultConfigDir({}, "linux", "/home/u")).toMatch(/\.config[\\/]horus$/);
    });

    it("ignores malformed profiles and missing files", async () => {
        const cli = makeCli(() => json(200, {}));
        expect(await loadCredentials(cli.ctx.configDir)).toEqual({ version: 1, profiles: {} });
    });
});

describe("login --api-key", () => {
    it("validates the key, stores it with 0600 permissions", async () => {
        const cli = makeCli(() => json(200, me));
        expect(await cli.run("login", "--api-key", "ak_123_secret", "--base-url", API)).toBe(0);
        expect(cli.calls[0]?.headers.authorization).toBe("Bearer ak_123_secret");
        expect(cli.out()).toBe('Logged in as seller@example.com (profile "default", api_key).\n');
        expect(await getProfile(cli.ctx.configDir, "default")).toEqual({ type: "api_key", api_key: "ak_123_secret", base_url: API });
        if (process.platform !== "win32") expect(statSync(credentialsPath(cli.ctx.configDir)).mode & 0o777).toBe(0o600);
    });

    it("reads the key from stdin with --api-key - and stores per profile", async () => {
        const cli = makeCli(() => json(200, me), { stdin: "ak_from_stdin\n" });
        await cli.run("login", "--api-key", "-", "--profile", "work");
        expect(cli.calls[0]?.url.origin).toBe("https://horusship.com");
        expect(await getProfile(cli.ctx.configDir, "work")).toEqual({ type: "api_key", api_key: "ak_from_stdin" });
        expect(await getProfile(cli.ctx.configDir, "default")).toBeUndefined();
    });

    it("does not store a rejected key", async () => {
        const cli = makeCli(() => json(401, { error: { type: "authentication", code: "invalid_api_key", message: "bad" } }));
        expect(await cli.run("login", "--api-key", "ak_bad")).toBe(1);
        expect(await getProfile(cli.ctx.configDir, "default")).toBeUndefined();
    });

    it("then whoami and other commands use the stored profile", async () => {
        const cli = makeCli(() => json(200, me));
        await setProfile(cli.ctx.configDir, "work", { type: "api_key", api_key: "ak_work", base_url: API });
        expect(await cli.run("whoami", "--profile", "work")).toBe(0);
        expect(cli.calls[0]?.url.toString()).toBe(`${API}/me`);
        expect(cli.calls[0]?.headers.authorization).toBe("Bearer ak_work");
        expect(cli.out()).toContain("seller@example.com");
        expect(cli.out()).toContain("scopes      listings:read");
    });

    it("HORUS_API_KEY overrides the profile", async () => {
        const cli = makeCli(() => json(200, me), { env: { HORUS_API_KEY: "ak_env" } });
        await setProfile(cli.ctx.configDir, "default", { type: "api_key", api_key: "ak_stored" });
        await cli.run("whoami", "--json");
        expect(cli.calls[0]?.headers.authorization).toBe("Bearer ak_env");
        expect(JSON.parse(cli.out())).toMatchObject({ source: "env", profile: "default" });
    });
});

describe("login (OAuth device flow)", () => {
    function authServer(tokenReplies: Record<string, unknown>[]): ReturnType<typeof makeCli> {
        return makeCli((c) => {
            if (c.url.pathname.startsWith("/.well-known/oauth-protected-resource")) return new Response("<html>", { status: 200, headers: { "content-type": "text/html" } });
            if (c.url.href === `${ISSUER}/.well-known/openid-configuration`) return json(200, DISCOVERY);
            if (c.url.pathname === "/oauth2/device_authorization") {
                return json(200, { device_code: "dev_1", user_code: "ABCD-EFGH", verification_uri: `${ISSUER}/device`, verification_uri_complete: `${ISSUER}/device?code=ABCD-EFGH`, expires_in: 600, interval: 5 });
            }
            if (c.url.pathname === "/oauth2/token") {
                const reply = tokenReplies.shift() ?? { error: "access_denied" };
                return json("error" in reply ? 400 : 200, reply);
            }
            if (c.url.pathname === "/api/v1/me") return json(200, { ...me, credential: { ...me.credential, kind: "oauth" } });
            return json(404, {});
        }, { env: { HORUS_ISSUER: ISSUER }, isTTY: true });
    }

    it("shows the code, polls through pending/slow_down and stores the tokens", async () => {
        const cli = authServer([{ error: "authorization_pending" }, { error: "slow_down" }, { access_token: "at_1", refresh_token: "rt_1", expires_in: 3600, scope: "openid listings:write" }]);
        expect(await cli.run("login")).toBe(0);
        const device = cli.calls.find((c) => c.url.pathname === "/oauth2/device_authorization");
        expect(form(device)).toEqual({ client_id: "client_l-jl-kdtR9r2Z-P4XfguzZ-N", scope: DEFAULT_SCOPE, resource: "https://horusship.com/api/v1" });
        const tokenCalls = cli.calls.filter((c) => c.url.pathname === "/oauth2/token");
        expect(tokenCalls).toHaveLength(3);
        expect(form(tokenCalls[0])).toEqual({ grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: "dev_1", client_id: "client_l-jl-kdtR9r2Z-P4XfguzZ-N" });
        expect(cli.err()).toContain("ABCD-EFGH");
        expect(cli.opened).toEqual([`${ISSUER}/device?code=ABCD-EFGH`]);
        expect(cli.out()).toContain("(profile \"default\", oauth)");
        const p = await getProfile(cli.ctx.configDir, "default");
        expect(p).toMatchObject({ type: "oauth", access_token: "at_1", refresh_token: "rt_1", token_endpoint: DISCOVERY.token_endpoint, revocation_endpoint: DISCOVERY.revocation_endpoint, client_id: "client_l-jl-kdtR9r2Z-P4XfguzZ-N" });
        expect((p as OAuthProfile).expires_at).toBeGreaterThan(Date.now());
    });

    it("stops on access_denied and stores nothing", async () => {
        const cli = authServer([{ error: "access_denied", error_description: "The user said no" }]);
        expect(await cli.run("login", "--no-browser", "--json")).toBe(1);
        expect(JSON.parse(cli.out())).toMatchObject({ error: { code: "access_denied", message: "The user said no" } });
        expect(cli.opened).toEqual([]);
        expect(await getProfile(cli.ctx.configDir, "default")).toBeUndefined();
    });

    it("passes --scopes through", async () => {
        const cli = authServer([{ access_token: "at" }]);
        await cli.run("login", "--scopes", "openid offline_access listings:read");
        expect(form(cli.calls.find((c) => c.url.pathname === "/oauth2/device_authorization")).scope).toBe("openid offline_access listings:read");
    });

    it("uses the dev client for a localhost API (issuer comes from discovery or HORUS_ISSUER)", () => {
        expect(oauthEnvironment("http://localhost:3000/api/v1", {})).toEqual({
            resource: "http://localhost:3000/api/v1", clientId: "client_mldnGhMKiY1tnZnF59pZZS5q", issuers: [],
        });
    });

    it("fails clearly when no issuer answers", async () => {
        const cli = makeCli(() => json(404, {}), { env: { HORUS_ISSUER: ISSUER } });
        expect(await cli.run("login")).toBe(1);
        expect(cli.err()).toContain("Could not reach the Horus sign-in service");
    });
});

describe("OAuth sessions", () => {
    const oauthProfile = (over: Partial<OAuthProfile> = {}): OAuthProfile => ({
        type: "oauth", access_token: "at_old", refresh_token: "rt_old", expires_at: Date.now() + 3_600_000,
        issuer: ISSUER, token_endpoint: DISCOVERY.token_endpoint, revocation_endpoint: DISCOVERY.revocation_endpoint, client_id: "cid", base_url: API, ...over,
    });

    it("refreshes an expired token before calling and saves the rotated refresh token", async () => {
        const cli = makeCli((c) => (c.url.pathname === "/oauth2/token" ? json(200, { access_token: "at_new", refresh_token: "rt_new", expires_in: 3600 }) : json(200, me)));
        await setProfile(cli.ctx.configDir, "default", oauthProfile({ expires_at: Date.now() - 1000 }));
        expect(await cli.run("me", "get")).toBe(0);
        expect(form(cli.calls[0])).toEqual({ grant_type: "refresh_token", refresh_token: "rt_old", client_id: "cid" });
        expect(cli.calls[1]?.headers.authorization).toBe("Bearer at_new");
        expect(await getProfile(cli.ctx.configDir, "default")).toMatchObject({ access_token: "at_new", refresh_token: "rt_new" });
    });

    it("refreshes after a 401 invalid_access_token and retries once", async () => {
        let first = true;
        const cli = makeCli((c) => {
            if (c.url.pathname === "/oauth2/token") return json(200, { access_token: "at_new", refresh_token: "rt_new" });
            if (first) {
                first = false;
                return json(401, { error: { type: "authentication", code: "invalid_access_token", message: "expired" } });
            }
            return json(200, me);
        });
        await setProfile(cli.ctx.configDir, "default", oauthProfile());
        expect(await cli.run("me", "get")).toBe(0);
        expect(cli.calls.map((c) => c.headers.authorization ?? "form")).toEqual(["Bearer at_old", "form", "Bearer at_new"]);
    });

    it("logout revokes the refresh token and removes the profile", async () => {
        const cli = makeCli(() => new Response(null, { status: 200 }));
        await setProfile(cli.ctx.configDir, "default", oauthProfile());
        expect(await cli.run("logout")).toBe(0);
        expect(cli.calls[0]?.url.href).toBe(DISCOVERY.revocation_endpoint);
        expect(form(cli.calls[0])).toEqual({ token: "rt_old", client_id: "cid" });
        expect(cli.out()).toBe('Logged out of profile "default" (token revoked).\n');
        expect(await getProfile(cli.ctx.configDir, "default")).toBeUndefined();
    });

    it("logout still forgets credentials when revocation fails, and warns about HORUS_API_KEY", async () => {
        const cli = makeCli(() => {
            throw new Error("offline");
        }, { env: { HORUS_API_KEY: "ak" } });
        await setProfile(cli.ctx.configDir, "default", oauthProfile());
        await cli.run("logout", "--json");
        expect(JSON.parse(cli.out())).toEqual({ object: "logout", profile: "default", removed: true, revoked: false });
        expect(cli.err()).toContain("HORUS_API_KEY is still set");
    });
});
