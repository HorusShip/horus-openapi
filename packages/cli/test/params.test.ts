import { CATALOG, type OperationInfo, type ParamInfo } from "@horusship/sdk/catalog";
import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/argv.js";
import { GLOBAL_FLAG_NAMES } from "../src/globals.js";
import { buildParams, coerce, missingRequired, pathParams, UsageError } from "../src/params.js";

const op = (id: string): OperationInfo => {
    const found = CATALOG.find((o) => o.id === id);
    if (!found) throw new Error(id);
    return found;
};
const P = (over: Partial<ParamInfo>): ParamInfo => ({ name: "x", type: "string", required: false, ...over });
const args = (...t: string[]) => parseArgs(t, (n) => n === "json" || n === "active");

describe("coerce", () => {
    it("parses numbers and integers", () => {
        expect(coerce(P({ type: "integer" }), ["25"])).toBe(25);
        expect(coerce(P({ type: "number" }), ["1.5"])).toBe(1.5);
        expect(() => coerce(P({ type: "integer" }), ["1.5"])).toThrow(UsageError);
        expect(() => coerce(P({ type: "number" }), ["abc"])).toThrow(/expects a number/);
    });

    it("parses booleans and true/false enums", () => {
        expect(coerce(P({ type: "boolean" }), [true])).toBe(true);
        expect(coerce(P({ type: "boolean" }), ["false"])).toBe(false);
        expect(coerce(P({ enum: ["true", "false"] }), [true])).toBe("true");
        expect(() => coerce(P({ type: "boolean" }), ["maybe"])).toThrow(UsageError);
    });

    it("validates enums", () => {
        expect(coerce(P({ enum: ["A", "B"] }), ["B"])).toBe("B");
        expect(() => coerce(P({ enum: ["A", "B"] }), ["C"])).toThrow(/one of: A, B/);
    });

    it("builds arrays from repeats, commas or JSON", () => {
        const arr = P({ type: "array", itemType: "string" });
        expect(coerce(arr, ["a", "b,c"])).toEqual(["a", "b", "c"]);
        expect(coerce(arr, ['["x, y"]'])).toEqual(["x, y"]);
        expect(coerce(P({ type: "array", itemType: "integer" }), ["1,2"])).toEqual([1, 2]);
        expect(coerce(P({ type: "array", itemType: "object" }), ['{"a":1}'])).toEqual([{ a: 1 }]);
    });

    it("parses JSON objects and nulls", () => {
        expect(coerce(P({ type: "object" }), ['{"a":1}'])).toEqual({ a: 1 });
        expect(() => coerce(P({ type: "object" }), ["{"])).toThrow(/expects JSON/);
        expect(coerce(P({ type: "unknown" }), ["plain"])).toBe("plain");
        expect(coerce(P({ type: "integer", nullable: true }), ["null"])).toBeNull();
    });

    it("requires a value for value flags", () => {
        expect(() => coerce(P({}), [true])).toThrow(/needs a value/);
    });
});

describe("buildParams", () => {
    it("maps flags to query params", () => {
        expect(buildParams(op("listings.list"), args("--status", "LISTED", "--limit", "5", "--json"), undefined, GLOBAL_FLAG_NAMES))
            .toEqual({ status: "LISTED", limit: 5 });
    });

    it("merges --data with flags (flags win)", () => {
        const out = buildParams(op("sales.ship"), args("--carrier", "UPS"), { tracking_number: "1Z", carrier: "USPS" }, GLOBAL_FLAG_NAMES);
        expect(out).toEqual({ tracking_number: "1Z", carrier: "UPS" });
    });

    it("rejects unknown flags and non-object --data", () => {
        expect(() => buildParams(op("sales.ship"), args("--nope", "1"), undefined, GLOBAL_FLAG_NAMES)).toThrow(/Unknown flag --nope/);
        expect(() => buildParams(op("sales.ship"), args(), [1], GLOBAL_FLAG_NAMES)).toThrow(/JSON object/);
        expect(() => buildParams(op("me.get"), args(), { a: 1 }, GLOBAL_FLAG_NAMES)).toThrow(/takes no parameters/);
    });

    it("lists missing required fields", () => {
        expect(missingRequired(op("accounts.jobs.create"), {})).toEqual(["--kind"]);
        expect(missingRequired(op("accounts.jobs.create"), { kind: "LOGIN" })).toEqual([]);
    });
});

describe("pathParams", () => {
    it("takes positionals in order, or --name flags", () => {
        const d = op("webhooks.deliveries.get");
        expect(pathParams(d, ["wh", "dl"], args())).toEqual({ id: "wh", delivery_id: "dl" });
        expect(pathParams(d, ["wh"], args("--delivery-id", "dl"))).toEqual({ id: "wh", delivery_id: "dl" });
        expect(() => pathParams(d, ["wh"], args())).toThrow(/Missing <delivery_id>/);
        expect(() => pathParams(op("listings.get"), ["a", "b"], args())).toThrow(/Unexpected argument "b"/);
    });

    it("path flags are not treated as unknown body flags", () => {
        expect(buildParams(op("sales.ship"), args("--id", "s1", "--carrier", "UPS"), undefined, GLOBAL_FLAG_NAMES)).toEqual({ carrier: "UPS" });
    });
});
