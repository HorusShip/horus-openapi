/**
 * Everything the CLI touches in the outside world, injected so commands can
 * be tested without a terminal, a network or a real config directory.
 */
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import type { FetchLike } from "@horusship/sdk";
import { defaultConfigDir } from "./config.js";

export interface CliContext {
    env: Readonly<Record<string, string | undefined>>;
    stdout(text: string): void;
    stderr(text: string): void;
    fetch: FetchLike;
    readFile(path: string): Promise<string>;
    readStdin(): Promise<string>;
    sleep(ms: number): Promise<void>;
    /** Best-effort: open a URL in the user's browser. */
    openUrl(url: string): void;
    configDir: string;
    isTTY: boolean;
}

async function readAllStdin(): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer));
    return Buffer.concat(chunks).toString("utf8");
}

function openInBrowser(url: string): void {
    const [cmd, args] = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
        : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
    try {
        spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", (): void => undefined).unref();
    } catch {
        // printing the URL is enough
    }
}

export function nodeContext(): CliContext {
    return {
        env: process.env,
        stdout: (t) => process.stdout.write(t),
        stderr: (t) => process.stderr.write(t),
        fetch: (input, init) => fetch(input, init),
        readFile: (p) => readFile(p, "utf8"),
        readStdin: readAllStdin,
        sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
        openUrl: openInBrowser,
        configDir: process.env.HORUS_CONFIG_DIR ?? defaultConfigDir(process.env, process.platform),
        isTTY: process.stdout.isTTY === true,
    };
}
