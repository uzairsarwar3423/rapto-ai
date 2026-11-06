"""
rag/embedder.py — chunk → hash → diff → batch → embed → validate → persist.

INVARIANTS (asserted in tests):
  * an identical re-run makes 0 OpenAI calls and 0 row writes,
  * OpenAI calls <= number of token-aware batches over the *unique, uncached* texts,
  * a failed batch never discards the batches that succeeded (per-batch isolation),
  * a malformed vector (wrong dim / NaN / not unit-length) never reaches the DB,
  * vectors are reused ONLY within one team (cross-team reuse is a side channel).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from collections import OrderedDict, defaultdict
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Protocol

import numpy as np
import structlog

from src.config.rag_config import EMBEDDING_DIMENSIONS, EMBEDDING_MAX_ATTEMPTS, EMBEDDING_MODEL, RagSettings
from src.models.common import AICallResult, CostRecord, ModelTier
from src.models.exceptions import (
    AINonRetryableError,
    AIRateLimitExhaustedError,
    AITimeoutError,
)
from src.models.rag_models import (
    ChunkFailure,
    ChunkToEmbed,
    EmbeddedChunk,
    UpsertMode,
    UpsertResult,
)
from src.rag import vector_store as vs
from src.rag.batching import build_batches, count_tokens, truncate_to_tokens
from src.rag.db import RagDatabase
from src.rag.errors import EmbeddingValidationError, RagValidationError
from src.rag.hashing import compute_content_hash, normalize_text
from src.rag.metrics import metrics
from src.rag.rate_limit import TokenBucket

log = structlog.get_logger(__name__)

_NORM_TOLERANCE = 1e-3          # OpenAI embeddings are unit length
_PERSIST_CONCURRENCY = 4


class EmbeddingClient(Protocol):
    async def generate_embeddings(
        self, texts: list[str], *, model: str | None = ..., request_id: str | None = ...,
        max_attempts: int = ...,
    ) -> AICallResult[list[list[float]]]: ...


class _Class(str, Enum):
    UNCHANGED = "unchanged"
    REUSE = "reused"
    EMBED = "embedded"


# ─── embed_batch ──────────────────────────────────────────────────────────────


@dataclass
class EmbedBatchResult:
    vectors: list[list[float]]
    tokens: int
    cost: CostRecord
    latency_ms: float


def validate_vectors(vectors: list[list[float]], expected: int) -> None:
    """Reject the WHOLE batch on any malformed vector (config/model mismatch signal)."""
    if len(vectors) != expected:
        raise EmbeddingValidationError(f"expected {expected} vectors, got {len(vectors)}")
    try:
        arr = np.asarray(vectors, dtype=np.float32)
    except (ValueError, TypeError) as exc:
        raise EmbeddingValidationError(f"ragged or non-numeric vectors: {exc}") from exc
    if arr.ndim != 2 or arr.shape[1] != EMBEDDING_DIMENSIONS:
        raise EmbeddingValidationError(
            f"expected dimension {EMBEDDING_DIMENSIONS}, got shape {tuple(arr.shape)}"
        )
    if not np.isfinite(arr).all():
        raise EmbeddingValidationError("embedding contains NaN or Infinity")
    norms = np.linalg.norm(arr, axis=1)
    if np.any(np.abs(norms - 1.0) > _NORM_TOLERANCE):
        raise EmbeddingValidationError(
            f"embedding not unit length (norm range {norms.min():.4f}..{norms.max():.4f})"
        )


async def embed_batch(
    texts: list[str],
    client: EmbeddingClient,
    *,
    bucket: TokenBucket,
    settings: RagSettings,
    request_id: str | None = None,
) -> EmbedBatchResult:
    """One OpenAI request: defensive truncate → rate-limit → call → validate."""
    prepared: list[str] = []
    tokens = 0
    for text in texts:
        cut, truncated, _original = truncate_to_tokens(text, settings.embedding_max_input_tokens)
        if truncated:
            metrics.inc("embedding_truncations_total")
        prepared.append(cut)
        tokens += count_tokens(cut)

    waited = await bucket.acquire(tokens)
    if waited:
        metrics.inc("embedding_rate_limit_wait_seconds_total", waited)
    started = time.monotonic()
    call = await client.generate_embeddings(
        prepared, model=EMBEDDING_MODEL, request_id=request_id, max_attempts=EMBEDDING_MAX_ATTEMPTS
    )
    try:
        validate_vectors(call.data, len(prepared))
    except EmbeddingValidationError:
        metrics.inc("embedding_validation_failures_total")
        raise
    metrics.inc("embedding_api_calls_total")
    metrics.inc("embedding_tokens_total", call.cost.input_tokens)
    metrics.inc("embedding_cost_usd_total", call.cost.estimated_cost_usd)
    metrics.observe("embedding_api_latency_seconds", time.monotonic() - started)
    return EmbedBatchResult(call.data, call.cost.input_tokens, call.cost, call.latency_ms)


def _zero_cost() -> CostRecord:
    return CostRecord(input_tokens=0, output_tokens=0, model_tier=ModelTier.EMBED,
                      model_name=EMBEDDING_MODEL, estimated_cost_usd=0.0)


def _sum_cost(costs: list[CostRecord]) -> CostRecord:
    if not costs:
        return _zero_cost()
    return CostRecord(
        input_tokens=sum(c.input_tokens for c in costs),
        output_tokens=0,
        model_tier=ModelTier.EMBED,
        model_name=EMBEDDING_MODEL,
        estimated_cost_usd=sum(c.estimated_cost_usd for c in costs),
    )


# ─── embed_chunks ─────────────────────────────────────────────────────────────


def _guard(chunks: list[ChunkToEmbed], mode: UpsertMode, settings: RagSettings) -> str:
    team_ids = {c.team_id for c in chunks}
    if len(team_ids) != 1:
        raise RagValidationError("all chunks in one request must share a single team_id")
    seen: set[tuple[str, str, int]] = set()
    per_source: dict[tuple[str, str], list[int]] = defaultdict(list)
    for c in chunks:
        key = (c.source_type.value, c.source_id, c.chunk_index)
        if key in seen:
            raise RagValidationError(
                f"duplicate chunk identity in request: {key[0]}/{key[1]}#{key[2]}"
            )
        seen.add(key)
        per_source[(key[0], key[1])].append(c.chunk_index)
    for (stype, sid), indices in per_source.items():
        if len(indices) > settings.max_chunks_per_source:
            raise RagValidationError(
                f"{stype}/{sid} has {len(indices)} chunks (max {settings.max_chunks_per_source})"
            )
        if mode is UpsertMode.REPLACE and sorted(indices) != list(range(len(indices))):
            raise RagValidationError(
                f"mode=replace requires contiguous chunk_index 0..n-1 for {stype}/{sid}"
            )
    return next(iter(team_ids))


def _json_normal(metadata: dict[str, Any]) -> dict[str, Any]:
    return json.loads(json.dumps(metadata, ensure_ascii=False))


@dataclass
class _Pending:
    chunk: ChunkToEmbed
    content_hash: str
    vector: list[float] | None = None
    origin: str = "api"
    token_count: int = 0


@dataclass
class _Failures:
    items: list[ChunkFailure] = field(default_factory=list)


def _failure_reason(exc: BaseException) -> tuple[str, str]:
    if isinstance(exc, EmbeddingValidationError):
        return "validation_failed", str(exc)[:300]
    if isinstance(exc, AIRateLimitExhaustedError):
        return "rate_limited", str(exc)[:300]
    if isinstance(exc, AITimeoutError):
        return "timeout", str(exc)[:300]
    if isinstance(exc, AINonRetryableError):
        return "invalid_input", str(exc)[:300]
    return "upstream_error", f"{type(exc).__name__}: {str(exc)[:240]}"


async def embed_chunks(
    chunks: list[ChunkToEmbed],
    client: EmbeddingClient,
    db: RagDatabase,
    *,
    mode: UpsertMode = UpsertMode.REPLACE,
    request_id: str | None = None,
    bucket: TokenBucket | None = None,
) -> UpsertResult:
    started = time.monotonic()
    settings = db.settings
    if not chunks:
        return UpsertResult(total_cost=_zero_cost())
    team_id = _guard(chunks, mode, settings)
    bucket = bucket or TokenBucket(settings.embedding_tpm_budget)

    # 1-2. hash + diff against the DB (one tenant-scoped read)
    hashes = [compute_content_hash(c.content, EMBEDDING_MODEL) for c in chunks]
    existing = await vs.fetch_existing(db, team_id, {(c.source_type.value, c.source_id) for c in chunks})

    # 3-4. classify
    pending: list[_Pending] = []
    unchanged = 0
    for chunk, content_hash in zip(chunks, hashes):
        row = existing.get((chunk.source_type.value, chunk.source_id, chunk.chunk_index))
        if (row is not None and row.content_hash == content_hash
                and row.source_date == chunk.source_date
                and row.metadata == _json_normal(chunk.metadata)):
            unchanged += 1
        else:
            pending.append(_Pending(chunk, content_hash))

    unique_hashes = list(dict.fromkeys(p.content_hash for p in pending))
    reusable = await vs.fetch_vectors_by_hash(db, team_id, unique_hashes, EMBEDDING_MODEL) if unique_hashes else {}
    to_embed = [h for h in unique_hashes if h not in reusable]

    # 5. in-request dedup: one text per unique hash
    text_for: dict[str, str] = {}
    tokens_for: dict[str, int] = {}
    for p in pending:
        if p.content_hash in to_embed and p.content_hash not in text_for:
            cut, truncated, original = truncate_to_tokens(p.chunk.content, settings.embedding_max_input_tokens)
            if truncated:
                metrics.inc("embedding_truncations_total")
                log.warning("embedding_input_truncated", source_type=p.chunk.source_type.value,
                            source_id=p.chunk.source_id, chunk_index=p.chunk.chunk_index,
                            original_tokens=original, limit=settings.embedding_max_input_tokens)
            text_for[p.content_hash] = cut
            tokens_for[p.content_hash] = count_tokens(cut)

    # 6. embed: token-aware batches, bounded concurrency, per-batch failure isolation
    api_vectors: dict[str, list[float]] = {}
    failed_hashes: dict[str, tuple[str, str]] = {}
    costs: list[CostRecord] = []
    batches = build_batches([tokens_for[h] for h in to_embed],
                            settings.embedding_batch_size, settings.embedding_batch_max_tokens)
    semaphore = asyncio.Semaphore(settings.embedding_concurrency)

    async def _run(indices: list[int]) -> None:
        batch_hashes = [to_embed[i] for i in indices]
        async with semaphore:
            try:
                out = await embed_batch([text_for[h] for h in batch_hashes], client,
                                        bucket=bucket, settings=settings, request_id=request_id)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 — isolate; classified into a failure reason
                reason = _failure_reason(exc)
                for h in batch_hashes:
                    failed_hashes[h] = reason
                log.warning("embedding_batch_failed", request_id=request_id, batch_size=len(batch_hashes),
                            reason=reason[0], error_type=type(exc).__name__)
                return
        costs.append(out.cost)
        for h, vec in zip(batch_hashes, out.vectors):
            api_vectors[h] = vec

    await asyncio.gather(*(_run(b) for b in batches))

    # assemble persistable chunks; first occurrence of an embedded hash is "api", rest "reused"
    claimed: set[str] = set()
    embedded: list[EmbeddedChunk] = []
    failures: list[ChunkFailure] = []
    for p in pending:
        h = p.content_hash
        if h in reusable:
            vector, origin = reusable[h], "reused"
        elif h in api_vectors:
            vector, origin = api_vectors[h], ("reused" if h in claimed else "api")
            claimed.add(h)
        else:
            reason, detail = failed_hashes.get(h, ("upstream_error", "no vector produced"))
            failures.append(ChunkFailure(source_type=p.chunk.source_type, source_id=p.chunk.source_id,
                                         chunk_index=p.chunk.chunk_index, reason=reason, detail=detail))  # type: ignore[arg-type]
            continue
        embedded.append(EmbeddedChunk(
            **p.chunk.model_dump(),
            embedding=vector,
            content_hash=h,
            model_name=EMBEDDING_MODEL,
            token_count=tokens_for.get(h) or count_tokens(p.chunk.content),
            vector_origin=origin,  # type: ignore[arg-type]
        ))

    # 7. persist
    stats = vs.WriteStats()
    if mode is UpsertMode.REPLACE:
        by_source: dict[tuple[str, str], list[EmbeddedChunk]] = defaultdict(list)
        for e in embedded:
            by_source[(e.source_type.value, e.source_id)].append(e)
        sizes: dict[tuple[str, str], int] = defaultdict(int)
        for c in chunks:
            sizes[(c.source_type.value, c.source_id)] += 1
        persist_sem = asyncio.Semaphore(_PERSIST_CONCURRENCY)

        async def _persist(source: tuple[str, str]) -> vs.WriteStats:
            n = sizes[source]
            rows = by_source.get(source, [])
            has_orphans = any(k[0] == source[0] and k[1] == source[1] and k[2] >= n for k in existing)
            if not rows and not has_orphans:
                return vs.WriteStats()
            async with persist_sem:
                return await vs.replace_source_chunks(db, team_id, source[0], source[1], rows, keep_count=n)

        for part in await asyncio.gather(*(_persist(s) for s in sizes)):
            stats.add(part)
    else:
        stats = await vs.upsert(db, team_id, embedded)

    result = UpsertResult(
        upserted_count=stats.inserted,
        updated_count=stats.updated,
        unchanged_count=unchanged + stats.unchanged,
        reused_vector_count=sum(1 for e in embedded if e.vector_origin == "reused"),
        deleted_orphans=stats.deleted_orphans,
        failed_count=len(failures),
        failures=failures,
        total_cost=_sum_cost(costs),
        api_calls=len(costs),
        duration_ms=round((time.monotonic() - started) * 1000, 2),
    )
    metrics.inc("embedding_chunks_total", sum(1 for e in embedded if e.vector_origin == "api"),
                outcome="embedded")
    metrics.inc("embedding_chunks_total", result.reused_vector_count, outcome="reused")
    metrics.inc("embedding_chunks_total", result.unchanged_count, outcome="unchanged")
    metrics.inc("embedding_chunks_total", result.failed_count, outcome="failed")
    log.info(
        "embed_chunks_complete", request_id=request_id, team_id=team_id, mode=mode.value,
        chunks=len(chunks), upserted=result.upserted_count, updated=result.updated_count,
        unchanged=result.unchanged_count, reused=result.reused_vector_count,
        orphans=result.deleted_orphans, failed=result.failed_count, api_calls=result.api_calls,
        cost_usd=result.total_cost.estimated_cost_usd, duration_ms=result.duration_ms,
    )
    return result


# ─── Query embedding ──────────────────────────────────────────────────────────


@dataclass
class QueryEmbedding:
    vector: list[float]
    cost: CostRecord          # zero on a cache hit
    cache_hit: bool


class _TTLCache:
    def __init__(self, size: int, ttl_s: float, clock: Callable[[], float]) -> None:
        self._size, self._ttl, self._clock = size, ttl_s, clock
        self._data: OrderedDict[str, tuple[float, list[float]]] = OrderedDict()

    def get(self, key: str) -> list[float] | None:
        hit = self._data.get(key)
        if hit is None:
            return None
        expires, value = hit
        if self._clock() >= expires:
            del self._data[key]
            return None
        self._data.move_to_end(key)
        return value

    def put(self, key: str, value: list[float]) -> None:
        if self._size <= 0 or self._ttl <= 0:
            return
        self._data[key] = (self._clock() + self._ttl, value)
        self._data.move_to_end(key)
        while len(self._data) > self._size:
            self._data.popitem(last=False)


class QueryEmbedder:
    """embed_query with a TTL cache and a singleflight guard.

    * KEY = sha256(team_id | model | normalised text): team-scoped, so one
      tenant's query activity can never be inferred from another's cache hits,
      and a model change can never serve a stale vector.
    * SINGLEFLIGHT: concurrent identical misses share ONE API call.
    * Process-local (a stateless cache; a shared Redis cache is a drop-in later).
    """

    def __init__(
        self,
        client: EmbeddingClient,
        settings: RagSettings,
        bucket: TokenBucket | None = None,
        *,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._client = client
        self._settings = settings
        self._bucket = bucket or TokenBucket(settings.embedding_tpm_budget)
        self._cache = _TTLCache(settings.query_embedding_cache_size, settings.query_embed_cache_ttl_s, clock)
        self._inflight: dict[str, asyncio.Future[QueryEmbedding]] = {}

    @staticmethod
    def cache_key(text: str, team_id: str) -> str:
        digest = hashlib.sha256(f"{team_id}|{compute_content_hash(text, EMBEDDING_MODEL)}".encode("utf-8"))
        return digest.hexdigest()

    async def embed_query_detailed(
        self, text: str, *, team_id: str = "", request_id: str | None = None
    ) -> QueryEmbedding:
        if not normalize_text(text):
            raise RagValidationError("query text must not be blank")
        key = self.cache_key(text, team_id)
        cached = self._cache.get(key)
        if cached is not None:
            metrics.inc("query_embedding_cache_hits_total")
            return QueryEmbedding(cached, _zero_cost(), True)

        pending = self._inflight.get(key)
        if pending is not None:                                  # someone is already fetching it
            metrics.inc("query_embedding_singleflight_joins_total")
            shared = await asyncio.shield(pending)
            return QueryEmbedding(shared.vector, _zero_cost(), True)

        future: asyncio.Future[QueryEmbedding] = asyncio.get_running_loop().create_future()
        self._inflight[key] = future
        try:
            out = await embed_batch([text.strip()], self._client, bucket=self._bucket,
                                    settings=self._settings, request_id=request_id)
            result = QueryEmbedding(out.vectors[0], out.cost, False)
            self._cache.put(key, result.vector)
            future.set_result(result)
            return result
        except BaseException as exc:
            future.set_exception(exc)
            future.exception()                                   # mark retrieved: no "never retrieved" warning
            raise
        finally:
            self._inflight.pop(key, None)

    async def embed_query(self, text: str, *, team_id: str = "", request_id: str | None = None) -> list[float]:
        return (await self.embed_query_detailed(text, team_id=team_id, request_id=request_id)).vector
