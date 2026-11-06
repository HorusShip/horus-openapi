import { describe, expect, expectTypeOf, it } from "vitest";
import { HorusError, Paginator, type Listing, type ListingList } from "../src/index.js";
import { client, json, mockFetch, page } from "./helpers.js";

function threePages(): ReturnType<typeof mockFetch> {
    return mockFetch((call) => {
        const cursor = call.url.searchParams.get("cursor");
        if (!cursor) return json(200, page(["a", "b"], "c1"));
        if (cursor === "c1") return json(200, page(["c"], "c2"));
        return json(200, page(["d"], null));
    });
}

describe("pagination", () => {
    it("for await iterates every item across pages, keeping filters", async () => {
        const { fetch, calls } = threePages();
        const ids: string[] = [];
        for await (const l of client(fetch).listings.list({ status: "LISTED" })) {
            expectTypeOf(l).toEqualTypeOf<Listing>();
            ids.push(l.id);
        }
        expect(ids).toEqual(["a", "b", "c", "d"]);
        expect(calls.map((c) => c.url.search)).toEqual(["?status=LISTED", "?status=LISTED&cursor=c1", "?status=LISTED&cursor=c2"]);
    });

    it("awaiting the paginator gives the first page", async () => {
        const { fetch, calls } = threePages();
        const first = await client(fetch).listings.list();
        expectTypeOf(first).toMatchTypeOf<ListingList>();
        expect(first.data.map((l) => l.id)).toEqual(["a", "b"]);
        expect(first.has_more).toBe(true);
        expect(calls).toHaveLength(1);
    });

    it(".page() fetches one page once, and starts from a given cursor", async () => {
        const { fetch, calls } = threePages();
        const p = client(fetch).listings.list({ cursor: "c1", limit: 1 });
        const a = await p.page();
        const b = await p.page();
        expect(a).toBe(b);
        expect(a.data.map((l) => l.id)).toEqual(["c"]);
        expect(calls).toHaveLength(1);
        expect(calls[0]?.url.searchParams.get("cursor")).toBe("c1");
    });

    it(".pages() yields page objects", async () => {
        const { fetch } = threePages();
        const sizes: number[] = [];
        for await (const pg of client(fetch).listings.list().pages()) sizes.push(pg.data.length);
        expect(sizes).toEqual([2, 1, 1]);
    });

    it(".toArray({ max }) stops early", async () => {
        const { fetch, calls } = threePages();
        const items = await client(fetch).listings.list().toArray({ max: 3 });
        expect(items.map((l) => l.id)).toEqual(["a", "b", "c"]);
        expect(calls).toHaveLength(2);
        expect(await client(fetch).listings.list().toArray({ max: 0 })).toEqual([]);
    });

    it("breaking out of the loop stops fetching", async () => {
        const { fetch, calls } = threePages();
        for await (const l of client(fetch).listings.list()) {
            if (l.id === "a") break;
        }
        expect(calls).toHaveLength(1);
    });

    it("detects a cursor loop", async () => {
        const { fetch } = mockFetch(json(200, page(["x"], "same")));
        await expect(client(fetch).listings.list().toArray()).rejects.toBeInstanceOf(HorusError);
    });

    it("stops when has_more is true but next_cursor is null", async () => {
        const { fetch, calls } = mockFetch(json(200, { ...page(["x"], null), has_more: true }));
        expect(await client(fetch).listings.list().toArray()).toHaveLength(1);
        expect(calls).toHaveLength(1);
    });

    it("lists without cursor support return a plain promise", async () => {
        const { fetch } = mockFetch(json(200, { object: "list", data: [{ type: "sale.shipped" }], has_more: false, next_cursor: null }));
        const types = client(fetch).eventTypes.list();
        expect(types).toBeInstanceOf(Promise);
        expect(types).not.toBeInstanceOf(Paginator);
        expect((await types).data).toHaveLength(1);
    });

    it("cursor-paginated lists return a Paginator", () => {
        const { fetch } = threePages();
        expect(client(fetch).sales.list()).toBeInstanceOf(Paginator);
        expect(client(fetch).webhooks.deliveries.list("wh_1")).toBeInstanceOf(Paginator);
    });
});
