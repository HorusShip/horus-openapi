#!/usr/bin/env python3
"""Verify a Horus webhook delivery (Standard Webhooks, v1 HMAC-SHA256). No dependencies.

Library use:
    from verify_signature import verify
    ok = verify(secret, headers["webhook-id"], headers["webhook-timestamp"], headers["webhook-signature"], raw_body)

CLI (e.g. on a delivery copied from `webhooks_deliveries_get`):
    HORUS_WEBHOOK_SECRET=whsec_... python verify_signature.py --id evt_... --timestamp 1762516800 \
        --signature "v1,..." --body-file body.json [--no-time-check]
Exit code 0 = valid, 1 = invalid.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import os
import sys
import time

TOLERANCE_SECONDS = 300


def verify(secret: str, msg_id: str, timestamp: str, signature: str, raw_body: bytes,
           *, check_time: bool = True, now: float | None = None) -> bool:
    """True when any `v1,` signature in the header matches and the timestamp is fresh."""
    try:
        ts = int(timestamp)
    except (TypeError, ValueError):
        return False
    if check_time and abs((now if now is not None else time.time()) - ts) > TOLERANCE_SECONDS:
        return False
    key = base64.b64decode(secret.removeprefix("whsec_"))
    signed = f"{msg_id}.{timestamp}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
    return any(
        part.startswith("v1,") and hmac.compare_digest(part[3:], expected)
        for part in signature.split(" ")
    )


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--id", required=True, help="webhook-id header")
    p.add_argument("--timestamp", required=True, help="webhook-timestamp header")
    p.add_argument("--signature", required=True, help="webhook-signature header")
    p.add_argument("--body-file", required=True, help="file with the exact raw request body")
    p.add_argument("--no-time-check", action="store_true", help="skip the 5-minute freshness check (old deliveries)")
    a = p.parse_args()
    secret = os.environ.get("HORUS_WEBHOOK_SECRET")
    if not secret:
        print("set HORUS_WEBHOOK_SECRET", file=sys.stderr)
        return 2
    with open(a.body_file, "rb") as f:
        body = f.read()
    ok = verify(secret, a.id, a.timestamp, a.signature, body, check_time=not a.no_time_check)
    print("valid" if ok else "INVALID")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
