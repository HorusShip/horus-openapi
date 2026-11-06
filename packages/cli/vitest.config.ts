import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const sdk = (p: string): string => fileURLToPath(new URL(`../sdk/src/${p}`, import.meta.url));

export default defineConfig({
    resolve: {
        alias: [
            { find: /^@horusship\/sdk\/catalog$/, replacement: sdk("catalog.ts") },
            { find: /^@horusship\/sdk$/, replacement: sdk("index.ts") },
        ],
    },
    test: { include: ["test/**/*.test.ts"], environment: "node" },
});
