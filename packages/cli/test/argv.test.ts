import { describe, expect, it } from "vitest";
import { boolFlag, flag, normalizeFlag, parseArgs, stringFlag } from "../src/argv.js";

const bools = (...names: string[]) => (n: string): boolean => names.includes(n);

describe("parseArgs", () => {
    it("splits positionals and flags in any order", () => {
        const a = parseArgs(["sales", "--json", "ship", "s_1", "--tracking-number", "1Z", "--carrier=UPS"], bools("json"));
        expect(a.positionals).toEqual(["sales", "ship", "s_1"]);
        expect(boolFlag(a, "json")).toBe(true);
        expect(stringFlag(a, "tracking-number")).toBe("1Z");
        expect(stringFlag(a, "carrier")).toBe("UPS");
    });

    it("normalizes snake_case and camelCase flag names to kebab-case", () => {
        expect(normalizeFlag("tracking_number")).toBe("tracking-number");
        expect(normalizeFlag("trackingNumber")).toBe("tracking-number");
        const a = parseArgs(["--tracking_number", "x"], bools());
        expect(stringFlag(a, "tracking-number")).toBe("x");
    });

    it("boolean flags never swallow a positional, but take true/false", () => {
        const a = parseArgs(["--wait", "acc_1", "--json", "false"], bools("wait", "json"));
        expect(a.positionals).toEqual(["acc_1"]);
        expect(flag(a, "wait")).toBe(true);
        expect(flag(a, "json")).toBe(false);
    });

    it("supports --no-<flag> for booleans only", () => {
        expect(flag(parseArgs(["--no-active"], bools("active")), "active")).toBe(false);
        expect(stringFlag(parseArgs(["--no-thing", "v"], bools()), "no-thing")).toBe("v");
    });

    it("treats a value flag followed by another flag (or nothing) as bare", () => {
        const a = parseArgs(["--status", "--json", "--limit"], bools("json"));
        expect(flag(a, "status")).toBe(true);
        expect(flag(a, "limit")).toBe(true);
        expect(stringFlag(a, "status")).toBeUndefined();
    });

    it("accumulates repeated flags and keeps values that look like negative numbers", () => {
        const a = parseArgs(["--item", "A", "--item", "B", "--min", "-5"], bools());
        expect(a.flags.get("item")).toEqual(["A", "B"]);
        expect(stringFlag(a, "min")).toBe("-5");
    });

    it("-h is --help and -- ends flags", () => {
        const a = parseArgs(["-h", "--", "--not-a-flag"], bools("help"));
        expect(boolFlag(a, "help")).toBe(true);
        expect(a.positionals).toEqual(["--not-a-flag"]);
    });

    it("keeps = inside values", () => {
        expect(stringFlag(parseArgs(["--query=a=b"], bools()), "query")).toBe("a=b");
    });
});
