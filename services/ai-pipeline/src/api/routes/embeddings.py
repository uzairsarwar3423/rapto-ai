"""
api/routes/embeddings.py — RAG write path and backfill control (Day 56).

Mounted under /api/v1 and protected by the X-Internal-Service-Key shared secret.

TENANCY NOTE: this service authenticates callers with one shared secret (no
per-request JWT carrying a team), so layer 1 of the plan's defence in depth
("token team == body team") cannot be enforced here. The Node API is the trust
boundary for which team a caller may act for; below it, the explicit
`team_id = $1` predicate and FORCE RLS (layers 2 and 3) still guarantee that a
request can only ever touch the team it names.
"""

from __future__ import annotations

import hashlib
import json
import re
from typing import Annotated, Optional
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, Header, Query, Request, status
from fastapi.responses import PlainTextResponse

from src.api.deps import verify_internal_service_key
from src.config.logging import request_id_var
from src.models.rag_models import (
    BackfillAccepted,
    BackfillRequest,
    DeleteSourceRequest,
    DeleteSourceResponse,
    EmbeddingJob,
    IdStr,
    UpsertRequest,
    UpsertResult,
)
from src.rag import jobs
from src.rag import vector_store as vs
from src.rag.embedder import embed_chunks
from src.rag.errors import (
    PayloadTooLargeError,
    RagBusyError,
    RagConflictError,
    RagDisabledError,
    RagNotFoundError,
    RagValidationError,
    UpstreamEmbeddingError,
)
from src.rag.metrics import metrics
from src.rag.runtime import RagRuntime

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/embeddings", tags=["embeddings"],
                   dependencies=[Depends(verify_internal_service_key)])

_IDEMPOTENCY_KEY = re.compile(r"^[A-Za-z0-9_\-:.]{1,128}$")
_PENDING_TTL_SECONDS = 600


def get_rag(request: Request) -> RagRuntime:
    runtime: Optional[RagRuntime] = getattr(request.app.state, "rag", None)
    if runtime is None:
        raise RagDisabledError("RAG is disabled on this deployment (RAG_ENABLED=false)")
    return runtime


RagDep = Annotated[RagRuntime, Depends(get_rag)]


# ─── Idempotency (Redis) ──────────────────────────────────────────────────────


def _body_hash(payload: UpsertRequest) -> str:
    return hashlib.sha256(payload.model_dump_json().encode("utf-8")).hexdigest()


async def _idem_begin(rag: RagRuntime, key: str, team_id: str, body_hash: str) -> Optional[UpsertResult]:
    """Claim the key. Returns a cached result for a completed identical request,
    None when this request should run. Raises 409 for in-flight / mismatched reuse."""
    redis = rag.redis.client
    redis_key = f"rag:idem:{team_id}:{key}"
    pending = json.dumps({"state": "pending", "body": body_hash})
    for _ in range(2):
        if await redis.set(redis_key, pending, nx=True, ex=_PENDING_TTL_SECONDS):
            return None
        raw = await redis.get(redis_key)
        if raw is None:          # expired between SET NX and GET → try to claim again
            continue
        record = json.loads(raw)
        if record.get("body") != body_hash:
            raise RagConflictError("Idempotency-Key was already used with a different payload")
        if record["state"] == "pending":
            raise RagConflictError("a request with this Idempotency-Key is still in progress")
        metrics.inc("embedding_idempotent_replays_total")
        return UpsertResult.model_validate(record["result"])
    raise RagConflictError("could not acquire idempotency key")


async def _idem_finish(rag: RagRuntime, key: str, team_id: str, body_hash: str, result: UpsertResult) -> None:
    await rag.redis.client.set(
        f"rag:idem:{team_id}:{key}",
        json.dumps({"state": "done", "body": body_hash, "result": result.model_dump(mode="json")}),
        ex=rag.settings.idempotency_ttl_seconds,
    )


async def _idem_abort(rag: RagRuntime, key: str, team_id: str) -> None:
    try:
        await rag.redis.client.delete(f"rag:idem:{team_id}:{key}")
    except Exception:  # noqa: BLE001 — best effort; the pending key expires anyway
        pass


# ─── Routes ───────────────────────────────────────────────────────────────────


@router.post("/upsert", response_model=UpsertResult)
async def upsert_embeddings(
    payload: UpsertRequest,
    rag: RagDep,
    idempotency_key: Annotated[Optional[str], Header(alias="Idempotency-Key")] = None,
) -> UpsertResult:
    """Embed and store chunks for ONE team. Safe to retry: identical input makes no
    OpenAI calls and no writes; an Idempotency-Key also replays the stored response."""
    if len(payload.chunks) > rag.settings.max_upsert_request_chunks:
        raise PayloadTooLargeError(
            f"{len(payload.chunks)} chunks exceeds the limit of {rag.settings.max_upsert_request_chunks}"
        )
    if idempotency_key is not None and not _IDEMPOTENCY_KEY.match(idempotency_key):
        raise RagValidationError("Idempotency-Key must match [A-Za-z0-9_-:.]{1,128}")
    if rag.upsert_slots.locked():
        raise RagBusyError("too many concurrent upserts; retry shortly")

    request_id = request_id_var.get() or "unknown"
    body_hash = _body_hash(payload)
    if idempotency_key:
        cached = await _idem_begin(rag, idempotency_key, payload.team_id, body_hash)
        if cached is not None:
            return cached

    try:
        async with rag.upsert_slots:
            result = await embed_chunks(
                [c.to_chunk(payload.team_id) for c in payload.chunks],
                rag.client, rag.db, mode=payload.mode, request_id=request_id, bucket=rag.bucket,
            )
        # Nothing could be embedded because OpenAI kept failing → 502, not a silent 200.
        if result.failed_count and not (result.upserted_count + result.updated_count + result.unchanged_count):
            raise UpstreamEmbeddingError(
                f"all {result.failed_count} chunk(s) failed: {result.failures[0].reason}"
            )
    except BaseException:
        if idempotency_key:
            await _idem_abort(rag, idempotency_key, payload.team_id)
        raise

    if idempotency_key:
        if result.failed_count:                       # partial → let the retry re-attempt the failures
            await _idem_abort(rag, idempotency_key, payload.team_id)
        else:
            await _idem_finish(rag, idempotency_key, payload.team_id, body_hash, result)
    return result


@router.post("/backfill", response_model=BackfillAccepted, status_code=status.HTTP_202_ACCEPTED)
async def start_backfill(payload: BackfillRequest, rag: RagDep) -> BackfillAccepted:
    """Queue a resumable backfill for one team (one active job per team → 409)."""
    for source_type in payload.source_types:
        rag.runner.reader_for(source_type.value)       # 400 now, not a failed job later
    job = await jobs.create_job(
        rag.db, payload.team_id, [s.value for s in payload.source_types], payload.since, payload.created_by
    )
    metrics.inc("embedding_jobs_created_total")
    return BackfillAccepted(
        job_id=job.id, status=job.status,
        status_url=f"/api/v1/embeddings/backfill/{job.id}?team_id={payload.team_id}",
    )


@router.get("/backfill/{job_id}", response_model=EmbeddingJob)
async def get_backfill(job_id: UUID, rag: RagDep, team_id: Annotated[IdStr, Query()]) -> EmbeddingJob:
    job = await jobs.get_job(rag.db, team_id, job_id)
    if job is None:
        raise RagNotFoundError("backfill job not found")
    return job


@router.delete("/source", response_model=DeleteSourceResponse)
async def delete_source(payload: DeleteSourceRequest, rag: RagDep) -> DeleteSourceResponse:
    """Remove every chunk of one source (meeting/commitment deletion, GDPR erasure)."""
    deleted = await vs.delete_by_source(rag.db, payload.team_id, payload.source_type, payload.source_id)
    log.info("embeddings_source_deleted", team_id=payload.team_id, source_type=payload.source_type.value,
             source_id=payload.source_id, deleted=deleted)
    metrics.inc("embedding_source_deletions_total")
    return DeleteSourceResponse(deleted=deleted)


@router.get("/metrics", response_class=PlainTextResponse)
async def embeddings_metrics() -> str:
    """Prometheus text format. Protected by the internal key like every other route."""
    return metrics.render()


__all__ = ["router", "get_rag"]
