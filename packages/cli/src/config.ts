/**
 * Credential profiles in `<config dir>/credentials.json` (mode 0600, dir 0700):
 *   Windows  %APPDATA%\horus
 *   macOS    ~/Library/Application Support/horus
 *   Linux    $XDG_CONFIG_HOME/horus or ~/.config/horus
 * Override with HORUS_CONFIG_DIR.
 */
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface ApiKeyProfile {
    type: "api_key";
    api_key: string;
    base_url?: string;
}

export interface OAuthProfile {
    type: "oauth";
    access_token: string;
    refresh_token?: string;
    /** Epoch ms. */
    expires_at?: number;
    scope?: string;
    issuer: string;
    token_endpoint: string;
    revocation_endpoint?: string;
    client_id: string;
    base_url?: string;
}

export type Profile = ApiKeyProfile | OAuthProfile;

export interface CredentialsFile {
    version: 1;
    profiles: Record<string, Profile>;
}

export const DEFAULT_PROFILE = "default";
const FILE = "credentials.json";

export function defaultConfigDir(env: Readonly<Record<string, string | undefined>>, platform: string, home: string = homedir()): string {
    if (platform === "win32") return join(env.APPDATA ?? join(home, "AppData", "Roaming"), "horus");
    if (platform === "darwin") return join(home, "Library", "Application Support", "horus");
    return join(env.XDG_CONFIG_HOME || join(home, ".config"), "horus");
}

export function credentialsPath(dir: string): string {
    return join(dir, FILE);
}

function isProfile(v: unknown): v is Profile {
    if (typeof v !== "object" || v === null) return false;
    const p = v as Record<string, unknown>;
    if (p.type === "api_key") return typeof p.api_key === "string";
    return p.type === "oauth" && typeof p.access_token === "string" && typeof p.token_endpoint === "string" && typeof p.client_id === "string";
}

export async function loadCredentials(dir: string): Promise<CredentialsFile> {
    let raw: string;
    try {
        raw = await readFile(credentialsPath(dir), "utf8");
    } catch {
        return { version: 1, profiles: {} };
    }
    const parsed = JSON.parse(raw) as { profiles?: Record<string, unknown> };
    const profiles: Record<string, Profile> = {};
    for (const [name, p] of Object.entries(parsed.profiles ?? {})) if (isProfile(p)) profiles[name] = p;
    return { version: 1, profiles };
}

export async function saveCredentials(dir: string, file: CredentialsFile): Promise<void> {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const path = credentialsPath(dir);
    await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
    // writeFile's mode only applies on create; tighten an existing file too (no-op on Windows).
    await chmod(path, 0o600).catch((): undefined => undefined);
}

export async function getProfile(dir: string, name: string): Promise<Profile | undefined> {
    return (await loadCredentials(dir)).profiles[name];
}

export async function setProfile(dir: string, name: string, profile: Profile): Promise<void> {
    const file = await loadCredentials(dir);
    file.profiles[name] = profile;
    await saveCredentials(dir, file);
}

export async function deleteProfile(dir: string, name: string): Promise<boolean> {
    const file = await loadCredentials(dir);
    if (!file.profiles[name]) return false;
    delete file.profiles[name];
    await saveCredentials(dir, file);
    return true;
}
