"""Daily summary: what needs attention in a Horus store right now.

    pip install horus-sdk
    HORUS_API_KEY=ak_... python daily_summary.py

Read-only. Needs: account:read accounts:read ebay:read listings:read sales:read
returns:read messages:read leads:read analytics:read desktop:read (sections whose
scope is missing are skipped, not fatal).
"""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, List, Optional, Tuple

from horus import Horus, PermissionDeniedError, SyncPage
from horus.types import Money

client = Horus()
now = datetime.now(timezone.utc)
since = now - timedelta(hours=24)

findings: List[Tuple[int, str]] = []  # (priority 0 = now, 1 = soon, 2 = later, text)
skipped: List[str] = []


def section(name: str, fn: Callable[[], None]) -> None:
    """Run one section; a missing scope just skips it."""
    try:
        fn()
    except PermissionDeniedError as err:
        skipped.append(f"{name} ({err.code})")


def first_page_count(page: SyncPage[Any]) -> str:
    return f"{len(page.data)}+" if page.has_more else str(len(page.data))


def money(m: Optional[Money]) -> str:
    return f"{m.currency} {m.amount:.2f}" if m else "n/a"


def desktop() -> None:
    d = client.desktop.status.get()
    if not d.paired:
        findings.append((0, "Horus Desktop is not paired: orders can't be bought."))
    elif not d.online:
        findings.append((0, f"Horus Desktop is offline (last seen {d.last_seen_at or 'never'}); {d.held_sale_count} sale(s) held."))
    elif not d.account_automation_ready:
        findings.append((1, f"Horus Desktop is online but not ready ({d.engine_status})."))


def ebay_accounts() -> None:
    for a in client.ebay.accounts.list(limit=100):
        problems = [p for p in [
            not a.is_active and f"inactive ({a.deactivated_reason or 'unknown reason'})",
            a.missing_scopes and "needs reconnect (missing scopes)",
            a.onboarding_required and "eBay onboarding not finished",
            not a.health.policies_ok and "business policies not set",
            not a.health.ship_from_ok and "no ship-from location",
            a.risk is not None and a.risk.level == "danger" and f"seller standards at risk: {', '.join(a.risk.reasons)}",
        ] if p]
        if problems:
            findings.append((1 if a.is_active else 0, f"eBay {a.username}: {'; '.join(problems)}"))


def buyer_accounts() -> None:
    page = client.accounts.list(session_valid=False, limit=100)
    if page.data:
        emails = ", ".join(a.email for a in page.data[:5])
        findings.append((1, f"{first_page_count(page)} buyer account(s) signed out: {emails}"))


def sales() -> None:
    manual = client.sales.list(needs_manual_fulfillment=True, limit=100)
    if manual.data:
        findings.append((0, f"{first_page_count(manual)} sale(s) need manual fulfilment (source cancelled or checkout failed)."))
    held = client.sales.list(held=True, limit=100)
    if held.data:
        releasable = sum(1 for s in held.data if s.fulfillment.releasable)
        findings.append((0, f"{first_page_count(held)} sale(s) held ({releasable} only because the desktop was offline)."))
    stuck = client.sales.list(status="PENDING", sold_before=now - timedelta(hours=2), limit=100)
    if stuck.data:
        findings.append((1, f"{first_page_count(stuck)} sale(s) still not bought after 2 h."))
    no_tracking = client.sales.list(status="PURCHASED", sold_before=now - timedelta(days=3), limit=100)
    if no_tracking.data:
        names = ", ".join((s.product_name or s.ebay_order_id or s.id) for s in no_tracking.data[:3])
        findings.append((1, f"{first_page_count(no_tracking)} purchase(s) with no tracking after 3 days: {names}"))


def _closes_soon(eligible_until: Optional[str]) -> bool:
    if not eligible_until:
        return False
    return datetime.fromisoformat(eligible_until.replace("Z", "+00:00")) - now < timedelta(days=3)


def returns() -> None:
    open_ = client.returns.list(status="open", limit=100)
    review = client.returns.list(status="manual_review", limit=100)
    soon = [r for r in [*open_.data, *review.data] if _closes_soon(r.eligible_until)]
    if review.data:
        findings.append((1, f"{first_page_count(review)} return(s) need a decision (manual review)."))
    if soon:
        findings.append((1, f"{len(soon)} return(s) close their source-store window within 3 days."))
    if open_.data:
        findings.append((2, f"{first_page_count(open_)} open return(s)."))


def messages() -> None:
    unread = client.messages.list(unread=True, limit=100)
    vero = [m for m in unread.data if m.vero.is_vero]
    if vero:
        brands = ", ".join(sorted({m.vero.brand or "?" for m in vero}))
        findings.append((1, f"{len(vero)} VeRO notice(s): {brands}"))
    if unread.data:
        threads = len({m.thread_id for m in unread.data})
        findings.append((2, f"{first_page_count(unread)} unread message(s) in {threads} thread(s)."))


def listings() -> None:
    failed = client.listings.list(status="FAILED", created_after=since, limit=100)
    if failed.data:
        findings.append((2, f"{first_page_count(failed)} listing(s) failed in the last 24 h."))


def jobs() -> None:
    failed = client.jobs.list(status="FAILED", requested_after=since, limit=100)
    kinds = Counter(j.kind for j in failed.data)
    if kinds:
        findings.append((2, "Failed desktop jobs: " + ", ".join(f"{n} {k}" for k, n in kinds.items()) + "."))


numbers: List[str] = []


def today() -> None:
    day = client.analytics.dashboard(period="day")
    profit = client.analytics.sku_profit(days=1)
    usage = client.account.usage.get()
    leads = client.leads.list(status="ASSIGNED", limit=100)
    numbers.append(
        f"Revenue {money(day.revenue)} · {day.units_sold} unit(s) · profit {money(profit.totals.profit)} · "
        f"{day.listings} new listing(s) · {usage.counts.live_listings} live · {first_page_count(leads)} lead(s) waiting"
    )


for name, fn in [("desktop", desktop), ("ebay accounts", ebay_accounts), ("buyer accounts", buyer_accounts),
                 ("sales", sales), ("returns", returns), ("messages", messages), ("listings", listings),
                 ("jobs", jobs), ("numbers", today)]:
    section(name, fn)

findings.sort(key=lambda f: f[0])
urgent = sum(1 for p, _ in findings if p == 0)
print(f"Horus check-in, {now:%a %d %b %H:%M} UTC: {f'{urgent} thing(s) need you now' if urgent else 'nothing urgent'}\n")
for priority, text in findings:
    print(f"[{('NOW', 'SOON', 'LATER')[priority]}] {text}")
if not findings:
    print("All clear.")
if numbers:
    print(f"\nToday: {numbers[0]}")
if skipped:
    print(f"\nSkipped (missing scope): {', '.join(skipped)}")
