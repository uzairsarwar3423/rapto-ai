"""Rebuild a team's Redis quota counters from the Postgres ledger and print the drift. Run after a Redis failover.

    RAG_DATABASE_URL=... REDIS_URL=... python scripts/reconcile_quota.py --team <team_id> --tz Asia/Karachi [--apply]

Without --apply it only REPORTS the drift (Redis vs ledger). The ledger (rag.chat_usage_ledger) is authoritative.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from datetime import datetime, timezone

import pytz
import redis.asyncio as aioredis

from src.config.chat_config import get_chat_settings
from src.config.rag_config import get_rag_settings
from src.rag.db import create_database
from src.services.chat.pg_chat_store import PgChatStore
from src.services.chat.quota_service import QuotaService


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--team", required=True)
    ap.add_argument("--tz", default="UTC")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    now_local = datetime.now(timezone.utc).astimezone(pytz.timezone(args.tz))
    day, month = now_local.strftime("%Y%m%d"), now_local.strftime("%Y%m")
    db = await create_database(get_rag_settings())
    r = aioredis.from_url(os.environ["REDIS_URL"])
    try:
        quota, store = QuotaService(r, get_chat_settings()), PgChatStore(db)
        redis_now = await quota.snapshot(args.team, day, month)
        queries, _usd_day, usd_month = await store.sum_usage(
            args.team, now_local.replace(hour=0, minute=0, second=0, microsecond=0),
            now_local.replace(day=1, hour=0, minute=0, second=0, microsecond=0))
        print(f"redis : used={redis_now['used']} reserved={redis_now['reserved']} month_usd={redis_now['used_u'] / 1e6:.6f}")
        print(f"ledger: used={queries} month_usd={usd_month:.6f}")
        print(f"drift : queries={redis_now['used'] - queries:+d} usd={redis_now['used_u'] / 1e6 - usd_month:+.6f}")
        if args.apply:
            print("rebuilt:", await quota.rebuild_from_ledger(store, args.team, now_local))
    finally:
        await r.aclose()
        await db.close()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
