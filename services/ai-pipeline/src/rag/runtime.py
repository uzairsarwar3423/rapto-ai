"""
rag/runtime.py — process-wide RAG singletons, started from the FastAPI lifespan.

RAG is OPT-IN. When RAG_ENABLED is false nothing here connects anywhere and
`start_runtime` returns None, so deployments without pgvector keep booting.
When it IS enabled, a failed safety check (BYPASSRLS role, RLS not forced, wrong
vector dimension, unreachable DB) aborts startup on purpose.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any, Optional

import asyncpg
import structlog

from src.config.rag_config import RagSettings
from src.config.settings import Settings
from src.rag.backfill import BackfillRunner, run_worker
from src.rag.db import RagDatabase, create_database
from src.rag.embedder import QueryEmbedder
from src.rag.rate_limit import TokenBucket
from src.services.openai_client import OpenAIClient

log = structlog.get_logger(__name__)


@dataclass
class RagRuntime:
    db: RagDatabase
    client: OpenAIClient
    bucket: TokenBucket
    query_embedder: QueryEmbedder
    upsert_slots: asyncio.Semaphore
    settings: RagSettings
    redis: Any                                  # RedisClientWrapper (idempotency store)
    runner: BackfillRunner
    source_pool: Optional[asyncpg.Pool] = None
    worker_stop: asyncio.Event = field(default_factory=asyncio.Event)
    worker_task: Optional[asyncio.Task[None]] = None


async def start_runtime(
    app_settings: Settings,
    rag_settings: RagSettings,
    *,
    redis: Any,
    mongo: Any,
) -> Optional[RagRuntime]:
    if not rag_settings.rag_enabled:
        log.info("rag_disabled")
        return None

    db = await create_database(rag_settings)       # raises → service refuses to start
    # Dedicated client: embedding traffic must not share a semaphore with extraction.
    client = OpenAIClient(app_settings, role="embeddings")
    bucket = TokenBucket(rag_settings.embedding_tpm_budget)

    source_pool: Optional[asyncpg.Pool] = None
    if rag_settings.rag_source_database_url is not None:
        source_pool = await asyncpg.create_pool(
            rag_settings.rag_source_database_url.get_secret_value(),
            min_size=1, max_size=3, command_timeout=rag_settings.rag_db_command_timeout_seconds,
            statement_cache_size=0 if rag_settings.rag_db_pooled else 100,
        )

    mongo_db = None
    if mongo is not None:
        mongo_db = mongo.db.client[rag_settings.rag_mongo_database]

    runner = BackfillRunner(db, client, bucket=bucket, mongo_db=mongo_db, source_pool=source_pool)
    runtime = RagRuntime(
        db=db, client=client, bucket=bucket,
        query_embedder=QueryEmbedder(client, rag_settings, bucket),
        upsert_slots=asyncio.Semaphore(rag_settings.rag_max_concurrent_upserts),
        settings=rag_settings, redis=redis, runner=runner, source_pool=source_pool,
    )
    if rag_settings.rag_worker_enabled:
        runtime.worker_task = asyncio.create_task(run_worker(db, runner, runtime.worker_stop), name="rag-worker")
    log.info("rag_runtime_started", worker=rag_settings.rag_worker_enabled,
             source_db=source_pool is not None, mongo=mongo_db is not None)
    return runtime


async def stop_runtime(runtime: Optional[RagRuntime]) -> None:
    if runtime is None:
        return
    runtime.worker_stop.set()
    if runtime.worker_task is not None:
        try:
            await asyncio.wait_for(runtime.worker_task, timeout=30)   # finishes its page, checkpoints, releases the job
        except asyncio.TimeoutError:
            runtime.worker_task.cancel()
    if runtime.source_pool is not None:
        await runtime.source_pool.close()
    await runtime.db.close()
    log.info("rag_runtime_stopped")
