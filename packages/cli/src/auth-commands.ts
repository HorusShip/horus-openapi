/** `horus login`, `horus logout`, `horus whoami`. */
import { DEFAULT_BASE_URL, Horus, type Me } from "@horusship/sdk";
import { boolFlag, stringFlag, type ParsedArgs } from "./argv.js";
import { deleteProfile, getProfile, setProfile, type OAuthProfile, type Profile } from "./config.js";
import type { CliContext } from "./context.js";
import { printResult, sessionOptions } from "./globals.js";
import { DEFAULT_SCOPE, discover, oauthEnvironment, pollDeviceToken, revokeToken, startDeviceFlow, type AuthServer } from "./oauth.js";
import { renderObject, toJson } from "./output.js";
import { UsageError } from "./params.js";
import { applyToken, openSession, profileName, resolveBaseUrl } from "./session.js";

export const LOGIN_BOOLEANS: ReadonlySet<string> = new Set(["no-browser"]);

function withBaseUrl<P extends Profile>(profile: P, baseUrl: string): P {
    return baseUrl === DEFAULT_BASE_URL ? profile : { ...profile, base_url: baseUrl };
}

function announce(ctx: CliContext, args: ParsedArgs, me: Me, name: string): void {
    if (boolFlag(args, "json")) ctx.stdout(toJson({ object: "login", profile: name, user: me }));
    else ctx.stdout(`Logged in as ${me.email} (profile "${name}", ${me.credential.kind}).\n`);
}

async function loginWithKey(ctx: CliContext, args: ParsedArgs, keyArg: string, name: string, baseUrl: string): Promise<number> {
    const key = (keyArg === "-" ? await ctx.readStdin() : keyArg).trim();
    if (!key) throw new UsageError("--api-key needs a key (or - to read it from stdin).");
    const me = await new Horus({ apiKey: key, baseUrl, fetch: ctx.fetch }).me.get();
    await setProfile(ctx.configDir, name, withBaseUrl({ type: "api_key", api_key: key }, baseUrl));
    announce(ctx, args, me, name);
    return 0;
}

function showCode(ctx: CliContext, args: ParsedArgs, url: string, code: string): void {
    ctx.stderr(`\nTo sign in, open:\n\n  ${url}\n\nand confirm the code: ${code}\n\nWaiting for approval…\n`);
    if (ctx.isTTY && !boolFlag(args, "no-browser")) ctx.openUrl(url);
}

function oauthProfile(server: AuthServer, clientId: string, baseUrl: string): OAuthProfile {
    const p: OAuthProfile = { type: "oauth", access_token: "", issuer: server.issuer, token_endpoint: server.token_endpoint, client_id: clientId };
    if (server.revocation_endpoint) p.revocation_endpoint = server.revocation_endpoint;
    return withBaseUrl(p, baseUrl);
}

async function loginWithDevice(ctx: CliContext, args: ParsedArgs, name: string, baseUrl: string): Promise<number> {
    const env = oauthEnvironment(baseUrl, ctx.env);
    const server = await discover(ctx.fetch, env);
    const device = await startDeviceFlow(ctx.fetch, server, env, stringFlag(args, "scopes") ?? DEFAULT_SCOPE);
    showCode(ctx, args, device.verification_uri_complete ?? device.verification_uri, device.user_code);
    const token = await pollDeviceToken(ctx.fetch, server, env, device, { sleep: ctx.sleep });
    const profile = applyToken(oauthProfile(server, env.clientId, baseUrl), token, Date.now());
    const me = await new Horus({ accessToken: profile.access_token, baseUrl, fetch: ctx.fetch }).me.get();
    await setProfile(ctx.configDir, name, profile);
    announce(ctx, args, me, name);
    return 0;
}

export async function login(ctx: CliContext, args: ParsedArgs): Promise<number> {
    const opts = sessionOptions(args);
    const name = profileName(ctx, opts);
    const baseUrl = resolveBaseUrl(ctx, opts);
    const key = args.flags.get("api-key")?.at(-1);
    if (key === true) throw new UsageError("--api-key needs a key (or - to read it from stdin).");
    if (typeof key === "string") return loginWithKey(ctx, args, key, name, baseUrl);
    return loginWithDevice(ctx, args, name, baseUrl);
}

export async function logout(ctx: CliContext, args: ParsedArgs): Promise<number> {
    const name = profileName(ctx, sessionOptions(args));
    const profile = await getProfile(ctx.configDir, name);
    let revoked = false;
    if (profile?.type === "oauth" && profile.revocation_endpoint && profile.refresh_token) {
        revoked = await revokeToken(ctx.fetch, profile.revocation_endpoint, profile.client_id, profile.refresh_token);
    }
    const removed = await deleteProfile(ctx.configDir, name);
    if (boolFlag(args, "json")) ctx.stdout(toJson({ object: "logout", profile: name, removed, revoked }));
    else ctx.stdout(removed ? `Logged out of profile "${name}"${revoked ? " (token revoked)" : ""}.\n` : `Profile "${name}" was not logged in.\n`);
    if (ctx.env.HORUS_API_KEY) ctx.stderr("Note: HORUS_API_KEY is still set and will keep authenticating.\n");
    return 0;
}

export async function whoami(ctx: CliContext, args: ParsedArgs): Promise<number> {
    const session = await openSession(ctx, sessionOptions(args));
    const me = await session.horus.me.get();
    const info = { ...me, profile: session.profileName, source: session.source, base_url: session.baseUrl };
    if (boolFlag(args, "json")) printResult(ctx, args, info);
    else ctx.stdout(renderObject({ ...info, credential: `${me.credential.kind} ${me.credential.id}`, scopes: me.credential.scopes.join(" ") }));
    return 0;
}
