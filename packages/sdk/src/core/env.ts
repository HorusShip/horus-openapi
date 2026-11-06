/** Runtime helpers that work in Node, Bun, Deno and browsers. */

interface MaybeProcess {
    process?: { env?: Record<string, string | undefined> };
    Deno?: { env?: { get(name: string): string | undefined } };
}

/** An environment variable, or undefined where there is no environment (browsers, Deno without --allow-env). */
export function readEnv(name: string): string | undefined {
    const g = globalThis as MaybeProcess;
    const fromProcess = g.process?.env?.[name];
    if (fromProcess !== undefined) return fromProcess.trim() || undefined;
    try {
        return g.Deno?.env?.get(name)?.trim() || undefined;
    } catch {
        return undefined;
    }
}

/** A random v4 UUID; uses Web Crypto when present. */
export function randomId(): string {
    const c = (globalThis as { crypto?: Crypto }).crypto;
    if (c && typeof c.randomUUID === "function") return c.randomUUID();
    const bytes = new Uint8Array(16);
    if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
    else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
