/**
 * Daily summary: what needs attention in a Horus store right now.
 *
 *   npm install @horusship/sdk
 *   HORUS_API_KEY=ak_… npx tsx daily-summary.ts
 *
 * Read-only. Needs: account:read accounts:read ebay:read listings:read sales:read
 * returns:read messages:read leads:read analytics:read desktop:read (sections whose
 * scope is missing are skipped, not fatal).
 */
import { Horus, PermissionError } from "@horusship/sdk";

const horus = new Horus();
const HOUR = 3_600_000;
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const since = iso(24 * HOUR);

type Finding = { priority: 0 | 1 | 2; text: string };
const findings: Finding[] = [];
const skipped: string[] = [];

/** Run one section; a missing scope just skips it. */
async function section(name: string, fn: () => Promise<void>): Promise<void> {
    try {
        await fn();
    } catch (err) {
        if (err instanceof PermissionError) skipped.push(`${name} (${err.code})`);
        else throw err;
    }
}

/** Count a filtered list without walking every page ("100+" when there are more). */
async function count<T>(page: PromiseLike<{ data: T[]; has_more: boolean }>): Promise<{ n: string; items: T[] }> {
    const p = await page;
    return { n: p.has_more ? `${p.data.length}+` : String(p.data.length), items: p.data };
}

await section("desktop", async () => {
    const d = await horus.desktop.status.get();
    if (!d.paired) findings.push({ priority: 0, text: "Horus Desktop is not paired: orders can't be bought." });
    else if (!d.online) findings.push({ priority: 0, text: `Horus Desktop is offline (last seen ${d.last_seen_at ?? "never"}); ${d.held_sale_count} sale(s) held.` });
    else if (!d.account_automation_ready) findings.push({ priority: 1, text: `Horus Desktop is online but not ready (${d.engine_status}).` });
});

await section("ebay accounts", async () => {
    for await (const a of horus.ebay.accounts.list({ limit: 100 })) {
        const problems = [
            !a.is_active && `inactive${a.deactivated_reason ? ` (${a.deactivated_reason})` : ""}`,
            a.missing_scopes.length > 0 && "needs reconnect (missing scopes)",
            a.onboarding_required && "eBay onboarding not finished",
            !a.health.policies_ok && "business policies not set",
            !a.health.ship_from_ok && "no ship-from location",
            a.risk?.level === "danger" && `seller standards at risk: ${a.risk.reasons.join(", ")}`,
        ].filter(Boolean);
        if (problems.length) findings.push({ priority: a.is_active ? 1 : 0, text: `eBay ${a.username}: ${problems.join("; ")}` });
    }
});

await section("buyer accounts", async () => {
    const out = await count(horus.accounts.list({ session_valid: "false", limit: 100 }));
    if (out.items.length) findings.push({ priority: 1, text: `${out.n} buyer account(s) signed out: ${out.items.slice(0, 5).map((a) => a.email).join(", ")}` });
});

await section("sales", async () => {
    const manual = await count(horus.sales.list({ needs_manual_fulfillment: "true", limit: 100 }));
    if (manual.items.length) findings.push({ priority: 0, text: `${manual.n} sale(s) need manual fulfilment (source cancelled or checkout failed).` });
    const held = await count(horus.sales.list({ held: "true", limit: 100 }));
    if (held.items.length) {
        const releasable = held.items.filter((s) => s.fulfillment.releasable).length;
        findings.push({ priority: 0, text: `${held.n} sale(s) held (${releasable} only because the desktop was offline).` });
    }
    const stuck = await count(horus.sales.list({ status: "PENDING", sold_before: iso(2 * HOUR), limit: 100 }));
    if (stuck.items.length) findings.push({ priority: 1, text: `${stuck.n} sale(s) still not bought after 2 h.` });
    const noTracking = await count(horus.sales.list({ status: "PURCHASED", sold_before: iso(72 * HOUR), limit: 100 }));
    if (noTracking.items.length) findings.push({ priority: 1, text: `${noTracking.n} purchase(s) with no tracking after 3 days: ${noTracking.items.slice(0, 3).map((s) => s.product_name ?? s.ebay_order_id).join(", ")}` });
});

await section("returns", async () => {
    const open = await count(horus.returns.list({ status: "open", limit: 100 }));
    const review = await count(horus.returns.list({ status: "manual_review", limit: 100 }));
    const soon = [...open.items, ...review.items].filter((r) => r.eligible_until && Date.parse(r.eligible_until) - Date.now() < 72 * HOUR);
    if (review.items.length) findings.push({ priority: 1, text: `${review.n} return(s) need a decision (manual review).` });
    if (soon.length) findings.push({ priority: 1, text: `${soon.length} return(s) close their source-store window within 3 days.` });
    if (open.items.length) findings.push({ priority: 2, text: `${open.n} open return(s).` });
});

await section("messages", async () => {
    const unread = await horus.messages.list({ unread: "true", limit: 100 });
    const threads = new Set(unread.data.map((m) => m.thread_id));
    const vero = unread.data.filter((m) => m.vero.is_vero);
    if (vero.length) findings.push({ priority: 1, text: `${vero.length} VeRO notice(s): ${[...new Set(vero.map((m) => m.vero.brand ?? "?"))].join(", ")}` });
    if (unread.data.length) findings.push({ priority: 2, text: `${unread.has_more ? "100+" : unread.data.length} unread message(s) in ${threads.size} thread(s).` });
});

await section("listings", async () => {
    const failed = await count(horus.listings.list({ status: "FAILED", created_after: since, limit: 100 }));
    if (failed.items.length) findings.push({ priority: 2, text: `${failed.n} listing(s) failed in the last 24 h.` });
});

await section("jobs", async () => {
    const failed = await horus.jobs.list({ status: "FAILED", requested_after: since, limit: 100 });
    const byKind = new Map<string, number>();
    for (const j of failed.data) byKind.set(j.kind, (byKind.get(j.kind) ?? 0) + 1);
    if (byKind.size) findings.push({ priority: 2, text: `Failed desktop jobs: ${[...byKind].map(([k, n]) => `${n} ${k}`).join(", ")}.` });
});

let numbers = "";
await section("numbers", async () => {
    const [day, profit, usage, leads] = await Promise.all([
        horus.analytics.dashboard({ period: "day" }),
        horus.analytics.skuProfit({ days: 1 }),
        horus.account.usage.get(),
        horus.leads.list({ status: "ASSIGNED", limit: 100 }),
    ]);
    const money = (m: { amount: number; currency: string } | null | undefined) => (m ? `${m.currency} ${m.amount.toFixed(2)}` : "n/a");
    numbers = `Revenue ${money(day.revenue)} · ${day.units_sold} unit(s) · profit ${money(profit.totals.profit)} · ` +
        `${day.listings} new listing(s) · ${usage.counts.live_listings} live · ${leads.has_more ? "100+" : leads.data.length} lead(s) waiting`;
});

const label = ["NOW", "SOON", "LATER"] as const;
findings.sort((a, b) => a.priority - b.priority);
const urgent = findings.filter((f) => f.priority === 0).length;
console.log(`Horus check-in, ${new Date().toUTCString()}: ${urgent ? `${urgent} thing(s) need you now` : "nothing urgent"}\n`);
for (const f of findings) console.log(`[${label[f.priority]}] ${f.text}`);
if (!findings.length) console.log("All clear.");
if (numbers) console.log(`\nToday: ${numbers}`);
if (skipped.length) console.log(`\nSkipped (missing scope): ${skipped.join(", ")}`);
