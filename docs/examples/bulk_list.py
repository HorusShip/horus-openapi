"""Bulk-list products on eBay from a CSV of ASINs.

    pip install horus-sdk
    HORUS_API_KEY=ak_... python bulk_list.py asins.csv --group <listing group id> --ebay <eBay id>[,<id>...] [--markup 70] [--yes]

CSV: a header row with an ``asin`` column (an Amazon URL or a quoted bundle like
"B07...;2, B09...;1" also works); an optional ``markup`` column overrides --markup per row.
Rows are grouped by markup, checked with ``listings.validate``, sent in batches of up to 2000
with a deterministic idempotency key (re-running never double-lists), then watched until every
listing is LISTED or FAILED.

Scopes: listings:write (and ebay:read to check the eBay accounts first).
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sys
import time
from collections import Counter, defaultdict
from typing import Dict, Iterator, List, Optional, Sequence

from horus import NOT_GIVEN, Horus

BATCH = 2000
POLL_SECONDS = 30
MAX_WAIT_SECONDS = 30 * 60

client = Horus()


def chunks(xs: Sequence[str], n: int) -> Iterator[List[str]]:
    for i in range(0, len(xs), n):
        yield list(xs[i:i + n])


def read_csv(path: str, default_markup: Optional[float]) -> Dict[Optional[float], List[str]]:
    by_markup: Dict[Optional[float], List[str]] = defaultdict(list)
    with open(path, newline="", encoding="utf8") as f:
        for row in csv.DictReader(f):
            row = {k.strip().lower(): (v or "").strip() for k, v in row.items() if k}
            if not row.get("asin"):
                continue
            markup = float(row["markup"]) if row.get("markup") else default_markup
            by_markup[markup].append(row["asin"])
    return by_markup


def check_ebay(ids: List[str]) -> None:
    for id_ in ids:
        a = client.ebay.accounts.get(id_)
        if not (a.is_active and a.health.policies_ok and a.health.ship_from_ok):
            sys.exit(f"eBay {a.username} can't list yet (active={a.is_active}, policies={a.health.policies_ok}, "
                     f"ship_from={a.health.ship_from_ok}).")


def validated(items: List[str]) -> List[str]:
    good: List[str] = []
    for part in chunks(items, BATCH):
        for line in client.listings.validate(items=part).lines:
            if line.error:
                print(f"skip {line.input}: {line.error}")
            else:
                good.append(line.input)
    return good


def create(group: str, ebay: List[str], markup: Optional[float], items: List[str]) -> tuple[List[str], int]:
    ids: List[str] = []
    duplicates = 0
    for part in chunks(items, BATCH):
        key = "bulk-list-" + hashlib.sha256(json.dumps([group, ebay, markup, sorted(part)]).encode()).hexdigest()[:32]
        batch = client.listings.create(
            group_id=group, ebay_account_ids=ebay, items=part,
            advantage_pct=markup if markup is not None else NOT_GIVEN,  # omitted = the user's default markup
            idempotency_key=key,
        )
        ids += [l.id for l in batch.listings]
        for s in batch.skipped:
            if s.reason == "duplicate":
                duplicates += 1
            else:
                print(f"skipped {s.input}: {s.message}")
        print(f"queued {batch.created_count} (markup {markup if markup is not None else 'default'})")
    return ids, duplicates


def watch(ids: List[str]) -> Dict[str, str]:
    done: Dict[str, str] = {}
    started = time.monotonic()
    while len(done) < len(ids) and time.monotonic() - started < MAX_WAIT_SECONDS:
        time.sleep(POLL_SECONDS)
        for part in chunks([i for i in ids if i not in done], 100):
            for listing in client.listings.list(ids=",".join(part), limit=100).data:
                if listing.status != "PENDING":
                    done[listing.id] = listing.status
        print(f"{len(done)}/{len(ids)} finished")
    return done


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("csv")
    p.add_argument("--group", required=True)
    p.add_argument("--ebay", required=True, help="comma-separated eBay account ids")
    p.add_argument("--markup", type=float)
    p.add_argument("--yes", action="store_true", help="actually create the listings")
    a = p.parse_args()
    ebay = a.ebay.split(",")

    check_ebay(ebay)
    plan = {m: good for m, items in read_csv(a.csv, a.markup).items() if (good := validated(items))}
    total = sum(len(v) for v in plan.values())
    print(f"{total} item(s) x {len(ebay)} eBay account(s) = {total * len(ebay)} listing(s) into group {a.group}.")
    if not a.yes:
        print("Dry run. Re-run with --yes to create them.")
        return

    ids: List[str] = []
    duplicates = 0
    for markup, items in plan.items():
        new_ids, dupes = create(a.group, ebay, markup, items)
        ids += new_ids
        duplicates += dupes

    counts = Counter(watch(ids).values())
    pending = len(ids) - sum(counts.values())
    print(f"Listed {counts['LISTED']}, failed {counts['FAILED']}, still pending {pending}, already listed (skipped) {duplicates}.")
    if counts["FAILED"]:
        print("Failure reasons arrive on the listing.failed webhook (data.error); fix the cause, then listings.retry.")


if __name__ == "__main__":
    main()
