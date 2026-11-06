/**
 * Bulk-list products on eBay from a CSV of ASINs.
 *
 *   npm install @horusship/sdk
 *   HORUS_API_KEY=ak_… npx tsx bulk-list.ts asins.csv --group <listing group id> --ebay <eBay account id>[,<id>…] [--markup 70] [--yes]
 *
 * CSV: a header row with an `asin` column (an Amazon URL or a bundle like "B07…;2, B09…;1" also works);
 * an optional `markup` column overrides --markup per row. Rows are grouped by markup, checked with
 * `listings.validate`, sent in batches of up to 2000 with a deterministic Idempotency-Key (re-running
 * the script never double-lists), then watched until every listing is LISTED or FAILED.
 *
 * Scopes: listings:write (and ebay:read to check the eBay accounts first).
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Horus } from "@horusship/sdk";

const horus = new Horus();
const BATCH = 2000;
const POLL_MS = 30_000;
const MAX_WAIT_MS = 30 * 60_000;

function arg(name: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : undefined;
}

function parseCsv(path: string, defaultMarkup: number | undefined): Map<number | undefined, string[]> {
    const [header = "", ...rows] =readFileSync(path, "utf8").split(/\r?\n/).filter((l) => l.trim());
    const cols = header.split(",").map((c) => c.trim().toLowerCase());
    const asinCol = cols.indexOf("asin");
    const markupCol = cols.indexOf("markup");
    if (asinCol < 0) throw new Error("CSV needs an `asin` column");
    const byMarkup = new Map<number | undefined, string[]>();
    for (const row of rows) {
        // Bundles contain commas, so a bundle cell must be quoted: "B07…;2, B09…;1"
        const cells = row.match(/("([^"]*)"|[^,]*)(,|$)/g)?.map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").trim()) ?? [];
        const item = cells[asinCol];
        if (!item) continue;
        const markup = markupCol >= 0 && cells[markupCol] ? Number(cells[markupCol]) : defaultMarkup;
        byMarkup.set(markup, [...(byMarkup.get(markup) ?? []), item]);
    }
    return byMarkup;
}

const chunk = <T>(xs: T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const file = process.argv[2];
const groupId = arg("group");
const ebayIds = arg("ebay")?.split(",");
if (!file || !groupId || !ebayIds) {
    console.error("usage: bulk-list.ts <file.csv> --group <id> --ebay <id>[,<id>] [--markup N] [--yes]");
    process.exit(2);
}
const markupArg = arg("markup");
const byMarkup = parseCsv(file, markupArg ? Number(markupArg) : undefined);

// 1. Make sure every eBay account can list.
for (const id of ebayIds) {
    const a = await horus.ebay.accounts.get(id);
    if (!a.is_active || !a.health.policies_ok || !a.health.ship_from_ok) {
        console.error(`eBay ${a.username} can't list yet (active=${a.is_active}, policies=${a.health.policies_ok}, ship_from=${a.health.ship_from_ok}).`);
        process.exit(1);
    }
}

// 2. Dry-run the input and drop the lines that won't parse.
const plan: { markup: number | undefined; items: string[] }[] = [];
for (const [markup, items] of byMarkup) {
    const good: string[] = [];
    for (const part of chunk(items, BATCH)) {
        const v = await horus.listings.validate({ items: part });
        for (const line of v.lines) {
            if (line.error) console.warn(`skip ${line.input}: ${line.error}`);
            else good.push(line.input);
        }
    }
    if (good.length) plan.push({ markup, items: good });
}
const total = plan.reduce((n, p) => n + p.items.length, 0);
console.log(`${total} item(s) × ${ebayIds.length} eBay account(s) = ${total * ebayIds.length} listing(s) into group ${groupId}.`);
if (!process.argv.includes("--yes")) {
    console.log("Dry run. Re-run with --yes to create them.");
    process.exit(0);
}

// 3. Create, with a key derived from the batch so a re-run replays instead of duplicating.
const ids: string[] = [];
let duplicates = 0;
for (const { markup, items } of plan) {
    for (const part of chunk(items, BATCH)) {
        const key = "bulk-list-" + createHash("sha256").update(JSON.stringify([groupId, ebayIds, markup, [...part].sort()])).digest("hex").slice(0, 32);
        const batch = await horus.listings.create(
            { group_id: groupId, ebay_account_ids: ebayIds, items: part, ...(markup !== undefined ? { advantage_pct: markup } : {}) },
            { idempotencyKey: key },
        );
        ids.push(...batch.listings.map((l) => l.id));
        for (const s of batch.skipped) {
            if (s.reason === "duplicate") duplicates++;
            else console.warn(`skipped ${s.input}: ${s.message}`);
        }
        console.log(`queued ${batch.created_count} (markup ${markup ?? "default"})`);
    }
}

// 4. Watch until every listing is LISTED or FAILED (ids filter takes ≤100 per call).
const done = new Map<string, string>();
const started = Date.now();
while (done.size < ids.length && Date.now() - started < MAX_WAIT_MS) {
    await sleep(POLL_MS);
    for (const part of chunk(ids.filter((id) => !done.has(id)), 100)) {
        const page = await horus.listings.list({ ids: part.join(","), limit: 100 });
        for (const l of page.data) if (l.status !== "PENDING") done.set(l.id, l.status);
    }
    console.log(`${done.size}/${ids.length} finished`);
}
const counts = [...done.values()].reduce<Record<string, number>>((acc, s) => ({ ...acc, [s]: (acc[s] ?? 0) + 1 }), {});
console.log(`Listed ${counts.LISTED ?? 0}, failed ${counts.FAILED ?? 0}, still pending ${ids.length - done.size}, already listed (skipped) ${duplicates}.`);
if (counts.FAILED) console.log("Failure reasons arrive on the listing.failed webhook (data.error); fix the cause, then listings.retry.");
