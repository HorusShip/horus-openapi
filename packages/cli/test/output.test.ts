import { describe, expect, it } from "vitest";
import { formatCell, pickColumns, renderHuman, renderObject, renderTable, toJson } from "../src/output.js";

describe("output", () => {
    it("prints JSON verbatim and pretty", () => {
        expect(toJson({ a: 1 })).toBe('{\n  "a": 1\n}\n');
        expect(toJson(undefined)).toBe("null\n");
    });

    it("picks preferred scalar columns, skipping object and nested values", () => {
        const rows = [{ object: "listing", title: "T", id: "l1", status: "LISTED", images: ["a"], price: { amount: 1, currency: "USD" } }];
        expect(pickColumns(rows)).toEqual(["id", "status", "title", "price"]);
    });

    it("renders aligned tables", () => {
        const t = renderTable([{ id: "a", status: "LISTED" }, { id: "bbbb", status: null }]);
        expect(t).toBe("ID    STATUS\na     LISTED\nbbbb  -\n");
        expect(renderTable([])).toBe("(no results)\n");
    });

    it("formats money, objects and long strings", () => {
        expect(formatCell({ amount: 12.5, currency: "USD" })).toBe("12.50 USD");
        expect(formatCell({ a: 1 })).toBe('{"a":1}');
        expect(formatCell("x".repeat(100))).toHaveLength(48);
        expect(formatCell("a\n  b")).toBe("a b");
    });

    it("renders lists with a pagination hint and objects as key/value", () => {
        const page = renderHuman({ object: "list", data: [{ id: "a" }], has_more: true, next_cursor: "c1" });
        expect(page).toContain("--cursor c1");
        expect(renderObject({ object: "sale", id: "s1", status: "SHIPPED" })).toBe("sale\nid      s1\nstatus  SHIPPED\n");
        expect(renderHuman(undefined)).toBe("OK\n");
        expect(renderHuman("text")).toBe("text\n");
    });
});
