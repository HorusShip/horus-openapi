import { run } from "./cli.js";
import { nodeContext } from "./context.js";

run(process.argv.slice(2), nodeContext()).then(
    (code): void => {
        process.exitCode = code;
    },
    (e: unknown): void => {
        console.error(e);
        process.exitCode = 1;
    },
);
