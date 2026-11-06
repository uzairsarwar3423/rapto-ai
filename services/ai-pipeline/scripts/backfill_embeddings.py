"""
scripts/backfill_embeddings.py — one-time / repeatable embedding backfill.

  # 1. ALWAYS dry-run first and get the cost signed off (no API calls are made)
  python -m scripts.backfill_embeddings --team-id <id> --source-types transcript_chunk commitment --dry-run

  # 2. run it (creates an embedding_jobs row; Ctrl+C is graceful and resumable)
  python -m scripts.backfill_embeddings --team-id <id> --source-types transcript_chunk commitment decision

  # 3. resume a job that was interrupted / released
  python -m scripts.backfill_embeddings --team-id <id> --resume-job <job-uuid>

Idempotent by construction (identity upsert + content-hash diff): re-running makes
0 API calls for anything already embedded. Needs the same environment as the
service: RAG_DATABASE_URL (vocaply_ai_app), OPENAI_API_KEY, MONGODB_URL, and
RAG_SOURCE_DATABASE_URL for commitment/action_item/decision/summary.

USE A DIRECT (session) DATABASE CONNECTION for RAG_DATABASE_URL here, not the
transaction pooler (RAG_DB_POOLED=false). `--rebuild-index` prints the ADR-7
bulk-load runbook; it does not touch the index itself.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import signal
import sys
from datetime import date
from typing import Optional
from uuid import UUID

import asyncpg

from src.config.rag_config import RagSettings
from src.config.settings import get_settings
from src.db.mongo_client import MongoClientWrapper
from src.rag import jobs
from src.rag.backfill import BackfillRunner
from src.rag.db import create_database
from src.services.openai_client import OpenAIClient

REBUILD_RUNBOOK = """\
ADR-7 bulk-load runbook (> ~100k rows). Run as the OWNER role, not vocaply_ai_app:
  SET maintenance_work_mem = '2GB';  SET max_parallel_maintenance_workers = 7;
  DROP INDEX rag.idx_embeddings_hnsw;
  -- run this script (inserts are far faster without the HNSW index) --
  CREATE INDEX CONCURRENTLY idx_embeddings_hnsw ON rag.embeddings
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
  ANALYZE rag.embeddings;
Search falls back to a sequential scan while the index is missing — do this off-peak."""


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--team-id", help="team to backfill (required unless --all-teams)")
    p.add_argument("--all-teams", action="store_true", help="not implemented here: loop teams from your own list")
    p.add_argument("--source-types", nargs="+", default=["transcript_chunk"])
    p.add_argument("--since", type=date.fromisoformat, help="only sources created on/after YYYY-MM-DD")
    p.add_argument("--concurrency", type=int, help="override EMBEDDING_CONCURRENCY")
    p.add_argument("--tpm-budget", type=int, help="override EMBEDDING_TPM_BUDGET")
    p.add_argument("--dry-run", action="store_true", help="estimate sources/chunks/tokens/cost; no API calls")
    p.add_argument("--resume-job", type=UUID, help="resume a queued job by id")
    p.add_argument("--rebuild-index", action="store_true", help="print the ADR-7 runbook and exit")
    return p.parse_args(argv)


async def amain(args: argparse.Namespace) -> int:
    if args.rebuild_index:
        print(REBUILD_RUNBOOK)
        return 0
    if args.all_teams or not args.team_id:
        print("ERROR: pass --team-id <id> (one team per job keeps cost sign-off and isolation explicit)")
        return 2

    overrides: dict[str, object] = {}
    if args.concurrency:
        overrides["embedding_concurrency"] = args.concurrency
    if args.tpm_budget:
        overrides["embedding_tpm_budget"] = args.tpm_budget
    rag_settings = RagSettings(rag_enabled=True, **overrides)    # type: ignore[arg-type]
    app_settings = get_settings()

    db = await create_database(rag_settings)
    mongo = MongoClientWrapper(app_settings)
    await mongo.connect()
    source_pool = None
    if rag_settings.rag_source_database_url is not None:
        source_pool = await asyncpg.create_pool(
            rag_settings.rag_source_database_url.get_secret_value(), min_size=1, max_size=3,
            statement_cache_size=0 if rag_settings.rag_db_pooled else 100,
        )
    runner = BackfillRunner(db, OpenAIClient(app_settings, role="backfill"),
                            mongo_db=mongo.db.client[rag_settings.rag_mongo_database], source_pool=source_pool)
    try:
        if args.dry_run:
            est = await runner.estimate(args.team_id, args.source_types, args.since)
            print(json.dumps({
                "team_id": args.team_id, "sources": est.sources, "chunks": est.chunks, "tokens": est.tokens,
                "estimated_cost_usd": est.cost_usd, "estimated_minutes": round(est.seconds / 60, 1),
                "by_type": est.by_type,
                "note": "UPPER BOUND: already-embedded and reusable chunks cost nothing. Verify the "
                        "embedding price on OpenAI's pricing page before sign-off.",
            }, indent=2))
            return 0

        if args.resume_job:
            job = await jobs.get_job(db, args.team_id, args.resume_job)
            if job is None:
                print("ERROR: job not found for this team")
                return 2
        else:
            job = await jobs.create_job(db, args.team_id, args.source_types, args.since, "cli")
        # Claim it for THIS process (a worker pod could grab it otherwise).
        claimed = await jobs.claim_next_job(db)
        if claimed is None or claimed[0] != job.id:
            if claimed is not None:                    # we grabbed someone else's job: hand it back
                await jobs.release(db, claimed[1], claimed[0])
            print(f"job {job.id} is not claimable by this process (already running elsewhere?)")
            return 1
        job = await jobs.get_job(db, args.team_id, job.id) or job

        stop = asyncio.Event()
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(sig, stop.set)    # finish page → checkpoint → release → exit 0
            except NotImplementedError:                    # Windows
                signal.signal(sig, lambda *_: stop.set())

        print(f"job {job.id} running (Ctrl+C is safe; resume with --resume-job {job.id})")
        outcome = await runner.run_job(job, stop)
        final = await jobs.get_job(db, args.team_id, job.id)
        print(json.dumps({"outcome": outcome, **(final.model_dump(mode="json") if final else {})}, indent=2))
        return 0
    finally:
        if source_pool is not None:
            await source_pool.close()
        await mongo.disconnect()
        await db.close()


def main(argv: Optional[list[str]] = None) -> int:
    return asyncio.run(amain(parse_args(argv)))


if __name__ == "__main__":
    sys.exit(main())
