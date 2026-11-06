"""
rag/jobs.py — durable, resumable backfill jobs (replaces in-process BackgroundTasks).

Why a table and not BackgroundTasks: tasks die with the pod, have no progress,
cannot resume and cannot stop two backfills for one team. Here:
  * the partial unique index admits ONE active (queued|running) job per team,
  * claim_next_embedding_job() (SECURITY DEFINER, FOR UPDATE SKIP LOCKED) lets
    several workers share the queue safely,
  * every checkpoint stores a cursor, so a crashed job resumes where it stopped,
  * a heartbeat + reaper re-queues jobs whose worker vanished.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Optional
from uuid import UUID

import asyncpg
import structlog

from src.models.rag_models import EmbeddingJob, JobStatus
from src.rag.db import RagDatabase
from src.rag.errors import RagConflictError
from src.rag.tenant_context import run_tenant_tx, system_tx

log = structlog.get_logger(__name__)

_COLUMNS = (
    "id, team_id, source_types, since, status, cursor, total_sources, processed_sources, "
    "upserted, reused, skipped, failed, cost_usd, error, created_at, started_at, "
    "finished_at, heartbeat_at, created_by"
)
_ACTIVE = "status IN ('queued','running')"


def _row_to_job(row: asyncpg.Record) -> EmbeddingJob:
    data = dict(row)
    data["cost_usd"] = float(data["cost_usd"])
    data["source_types"] = list(data["source_types"])
    data["cursor"] = data["cursor"] or {}
    return EmbeddingJob.model_validate(data)


async def create_job(
    db: RagDatabase,
    team_id: str,
    source_types: list[str],
    since: Optional[date] = None,
    created_by: Optional[str] = None,
) -> EmbeddingJob:
    async def _fn(conn: asyncpg.Connection) -> EmbeddingJob:
        try:
            async with conn.transaction():          # savepoint: keep the txn usable after a conflict
                row = await conn.fetchrow(
                    f"INSERT INTO rag.embedding_jobs (team_id, source_types, since, created_by) "
                    f"VALUES ($1, $2::text[], $3, $4) RETURNING {_COLUMNS}",
                    team_id, source_types, since, created_by,
                )
        except asyncpg.UniqueViolationError:
            active = await conn.fetchval(
                f"SELECT id FROM rag.embedding_jobs WHERE team_id = $1 AND {_ACTIVE}", team_id
            )
            raise RagConflictError(
                f"a backfill is already active for this team (job_id={active})", job_id=str(active)
            ) from None
        return _row_to_job(row)

    return await run_tenant_tx(db, team_id, _fn)


async def get_job(db: RagDatabase, team_id: str, job_id: UUID) -> Optional[EmbeddingJob]:
    async def _fn(conn: asyncpg.Connection) -> Optional[EmbeddingJob]:
        row = await conn.fetchrow(
            f"SELECT {_COLUMNS} FROM rag.embedding_jobs WHERE id = $1 AND team_id = $2", job_id, team_id
        )
        return _row_to_job(row) if row else None

    return await run_tenant_tx(db, team_id, _fn, readonly=True)


async def claim_next_job(db: RagDatabase) -> Optional[tuple[UUID, str]]:
    """Atomically take the oldest queued job (any team) → (job_id, team_id)."""
    async with system_tx(db) as conn:
        row = await conn.fetchrow("SELECT job_id, job_team_id FROM rag.claim_next_embedding_job()")
    return (row["job_id"], row["job_team_id"]) if row and row["job_id"] else None


async def requeue_stale(db: RagDatabase, max_age_seconds: int) -> int:
    async with system_tx(db) as conn:
        return int(await conn.fetchval(
            "SELECT rag.requeue_stale_embedding_jobs(make_interval(secs => $1::double precision))",
            float(max_age_seconds),
        ))


async def checkpoint(
    db: RagDatabase,
    team_id: str,
    job_id: UUID,
    *,
    cursor: dict[str, Any],
    processed: int = 0,
    upserted: int = 0,
    reused: int = 0,
    skipped: int = 0,
    failed: int = 0,
    cost_usd: float = 0.0,
    total_sources: Optional[int] = None,
) -> bool:
    """Persist progress. Returns False when the job is no longer `running`
    (cancelled / re-queued) — the runner must stop."""
    async def _fn(conn: asyncpg.Connection) -> bool:
        status = await conn.execute(
            "UPDATE rag.embedding_jobs SET cursor = $3::jsonb, "
            "processed_sources = processed_sources + $4, upserted = upserted + $5, "
            "reused = reused + $6, skipped = skipped + $7, failed = failed + $8, "
            "cost_usd = cost_usd + $9, total_sources = COALESCE($10, total_sources), "
            "heartbeat_at = now() WHERE id = $1 AND team_id = $2 AND status = 'running'",
            job_id, team_id, cursor, processed, upserted, reused, skipped, failed,
            round(cost_usd, 6), total_sources,
        )
        return status.endswith(" 1")

    return await run_tenant_tx(db, team_id, _fn)


async def _set_status(db: RagDatabase, team_id: str, job_id: UUID, status: JobStatus,
                      error: Optional[str] = None, *, only_if_running: bool = True) -> None:
    terminal = status in (JobStatus.SUCCEEDED, JobStatus.FAILED, JobStatus.CANCELLED)

    async def _fn(conn: asyncpg.Connection) -> None:
        guard = "AND status = 'running'" if only_if_running else ""
        await conn.execute(
            f"UPDATE rag.embedding_jobs SET status = $3, error = $4, "
            f"finished_at = CASE WHEN $5 THEN now() ELSE finished_at END, "
            f"heartbeat_at = CASE WHEN $5 THEN heartbeat_at ELSE NULL END "
            f"WHERE id = $1 AND team_id = $2 {guard}",
            job_id, team_id, status.value, error[:2000] if error else None, terminal,
        )

    await run_tenant_tx(db, team_id, _fn)


async def complete(db: RagDatabase, team_id: str, job_id: UUID) -> None:
    await _set_status(db, team_id, job_id, JobStatus.SUCCEEDED)


async def fail(db: RagDatabase, team_id: str, job_id: UUID, error: str) -> None:
    await _set_status(db, team_id, job_id, JobStatus.FAILED, error)


async def release(db: RagDatabase, team_id: str, job_id: UUID) -> None:
    """Hand a running job back to the queue (graceful shutdown); keeps its cursor."""
    await _set_status(db, team_id, job_id, JobStatus.QUEUED)


async def cancel(db: RagDatabase, team_id: str, job_id: UUID) -> bool:
    async def _fn(conn: asyncpg.Connection) -> bool:
        status = await conn.execute(
            f"UPDATE rag.embedding_jobs SET status = 'cancelled', finished_at = now() "
            f"WHERE id = $1 AND team_id = $2 AND {_ACTIVE}", job_id, team_id,
        )
        return status.endswith(" 1")

    return await run_tenant_tx(db, team_id, _fn)

