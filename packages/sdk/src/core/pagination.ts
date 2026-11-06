/**
 * Cursor pagination. A list call returns a `Paginator`, which is:
 *   - awaitable → the first page (`const page = await horus.listings.list()`),
 *   - async-iterable over every item across pages (`for await (const l of horus.listings.list())`),
 *   - `.page()` for one page, `.pages()` to walk pages, `.toArray({ max })` to collect.
 */
import { HorusError } from "./errors.js";
import type { PageShape } from "./types.js";

export type PageFetcher<P> = (cursor: string | undefined) => Promise<P>;

export class Paginator<Item, P extends PageShape<Item> = PageShape<Item>> implements AsyncIterable<Item>, PromiseLike<P> {
    private first: Promise<P> | undefined;

    constructor(private readonly fetchPage: PageFetcher<P>, private readonly startCursor?: string) {}

    /** The first page (fetched once and cached). */
    page(): Promise<P> {
        this.first ??= this.fetchPage(this.startCursor);
        return this.first;
    }

    then<A = P, B = never>(onFulfilled?: ((value: P) => A | PromiseLike<A>) | null, onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null): Promise<A | B> {
        return this.page().then(onFulfilled, onRejected);
    }

    /** Every page, following `next_cursor` until `has_more` is false. */
    async *pages(): AsyncGenerator<P, void, undefined> {
        let page = await this.page();
        const seen = new Set<string>();
        yield page;
        while (page.has_more && page.next_cursor) {
            if (seen.has(page.next_cursor)) throw new HorusError(`Pagination loop: cursor ${page.next_cursor} was returned twice.`);
            seen.add(page.next_cursor);
            page = await this.fetchPage(page.next_cursor);
            yield page;
        }
    }

    async *[Symbol.asyncIterator](): AsyncGenerator<Item, void, undefined> {
        for await (const page of this.pages()) {
            yield* page.data;
        }
    }

    /** Collect items across pages; stops after `max` items when given. */
    async toArray(options: { max?: number } = {}): Promise<Item[]> {
        const out: Item[] = [];
        const max = options.max ?? Number.POSITIVE_INFINITY;
        if (max <= 0) return out;
        for await (const item of this) {
            out.push(item);
            if (out.length >= max) break;
        }
        return out;
    }
}
