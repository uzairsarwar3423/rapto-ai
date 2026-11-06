"""
rag/vector_store.py
────────────────────
Tenant-isolated persistence and similarity search over rag.embeddings.

SQL RULES (enforced by tests/test_vector_store_sql.py):
  * every statement carries an explicit `team_id = $1` (planner hint + layer 2
    of the defence in depth; RLS is layer 3),
  * SQL text is assembled ONLY from fixed fragments; user values are always
    bound parameters, never interpolated, and there are no dynamic identifiers,
  * ORDER BY uses the raw `embedding <=> $q` expression so the HNSW index is
    usable (ordering by `1 - distance` would force a sequential scan).
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import date
from typing import Any

import asyncpg
import numpy as np

from src.config.rag_config import EMBEDDING_MODEL
from src.models.rag_models import (
    EmbeddedChunk,
    EmbeddingSource,
    LexicalSearchQuery,
    SearchStats,
    VectorSearchQuery,
    VectorSearchResult,
)
from src.rag.db import RagDatabase
from src.rag.metrics import metrics
from src.rag.query_processing import to_tsquery_or
from src.rag.tenant_context import run_tenant_tx

# ─── Fixed SQL fragments ──────────────────────────────────────────────────────

_UPSERT_SQL = """
INSERT INTO rag.embeddings
  (team_id, source_type, source_id, chunk_index, chunk_text, content_hash,
   embedding, model_name, source_date, token_count, metadata)
SELECT $1::text, t.source_type, t.source_id, t.chunk_index, t.chunk_text, t.content_hash,
       t.embedding::vector, t.model_name, t.source_date, t.token_count, t.metadata::jsonb
FROM unnest($2::text[], $3::text[], $4::smallint[], $5::text[], $6::text[],
            $7::text[], $8::text[], $9::date[], $10::int[], $11::text[])
     AS t(source_type, source_id, chunk_index, chunk_text, content_hash,
          embedding, model_name, source_date, token_count, metadata)
ON CONFLICT (team_id, source_type, source_id, chunk_index) DO UPDATE SET
  chunk_text   = EXCLUDED.chunk_text,
  content_hash = EXCLUDED.content_hash,
  embedding    = EXCLUDED.embedding,
  model_name   = EXCLUDED.model_name,
  source_date  = EXCLUDED.source_date,
  token_count  = EXCLUDED.token_count,
  metadata     = EXCLUDED.metadata
WHERE (rag.embeddings.content_hash, rag.embeddings.metadata,
       rag.embeddings.source_date,  rag.embeddings.model_name)
      IS DISTINCT FROM
      (EXCLUDED.content_hash, EXCLUDED.metadata, EXCLUDED.source_date, EXCLUDED.model_name)
RETURNING (xmax = 0) AS inserted
"""

_DELETE_ORPHANS_SQL = (
    "DELETE FROM rag.embeddings "
    "WHERE team_id = $1 AND source_type = $2 AND source_id = $3 AND chunk_index >= $4"
)
_DELETE_SOURCE_SQL = (
    "DELETE FROM rag.embeddings WHERE team_id = $1 AND source_type = $2 AND source_id = $3"
)
_LOCK_SQL = "SELECT pg_advisory_xact_lock(hashtext($1))"

_EXISTING_SQL = """
SELECT source_type, source_id, chunk_index, content_hash, metadata, source_date
FROM rag.embeddings
WHERE team_id = $1
  AND (source_type, source_id) IN (SELECT * FROM unnest($2::text[], $3::text[]))
"""
_VECTORS_BY_HASH_SQL = """
SELECT DISTINCT ON (content_hash) content_hash, embedding
FROM rag.embeddings
WHERE team_id = $1 AND content_hash = ANY($2::text[]) AND model_name = $3
ORDER BY content_hash
"""

_SEARCH_SELECT = (
    "SELECT id, chunk_text, source_type, source_id, chunk_index, metadata, source_date, "
    "model_name, embedding <=> $2::vector AS distance FROM rag.embeddings"
)


# ─── Result types ─────────────────────────────────────────────────────────────


@dataclass
class WriteStats:
    inserted: int = 0
    updated: int = 0
    unchanged: int = 0
    deleted_orphans: int = 0

    def add(self, other: "WriteStats") -> None:
        self.inserted += other.inserted
        self.updated += other.updated
        self.unchanged += other.unchanged
        self.deleted_orphans += other.deleted_orphans


@dataclass(frozen=True)
class ExistingRow:
    content_hash: str
    metadata: dict[str, Any]
    source_date: date | None


@dataclass
class SearchOutcome:
    results: list[VectorSearchResult] = field(default_factory=list)
    stats: SearchStats = field(default_factory=lambda: SearchStats(requested_k=0, returned_k=0))


def _vec(values: list[float]) -> np.ndarray:
    return np.asarray(values, dtype=np.float32)


def _as_list(value: object) -> list[float]:
    """pgvector-python returns its own Vector type (older versions: ndarray)."""
    to_list = getattr(value, "to_list", None)
    return to_list() if callable(to_list) else [float(x) for x in value]  # type: ignore[attr-defined]


def _vec_text(values: list[float]) -> str:
    """pgvector text literal, e.g. '[0.1,0.2]'.

    Bulk writes send vectors as text[] and cast `::vector` in SQL: asyncpg treats
    a Python list of vectors as a MULTI-DIMENSIONAL array (and breaks the codec),
    and text literals also keep the statement safe behind transaction poolers.
    9 significant digits round-trips float32 exactly.
    """
    return "[" + ",".join(format(float(x), ".9g") for x in values) + "]"


# ─── Writes ───────────────────────────────────────────────────────────────────


async def _write_rows(conn: asyncpg.Connection, team_id: str, chunks: list[EmbeddedChunk],
                      batch_rows: int) -> WriteStats:
    import json

    stats = WriteStats()
    for start in range(0, len(chunks), batch_rows):
        part = chunks[start:start + batch_rows]
        rows = await conn.fetch(
            _UPSERT_SQL,
            team_id,
            [c.source_type.value for c in part],
            [c.source_id for c in part],
            [c.chunk_index for c in part],
            [c.content for c in part],
            [c.content_hash for c in part],
            [_vec_text(c.embedding) for c in part],
            [c.model_name for c in part],
            [c.source_date for c in part],
            [c.token_count for c in part],
            [json.dumps(c.metadata, sort_keys=True, ensure_ascii=False) for c in part],
        )
        inserted = sum(1 for r in rows if r["inserted"])
        stats.inserted += inserted
        stats.updated += len(rows) - inserted
        stats.unchanged += len(part) - len(rows)
    return stats


def _check_single_team(team_id: str, chunks: list[EmbeddedChunk]) -> None:
    if any(c.team_id != team_id for c in chunks):
        raise ValueError("all chunks must belong to the team_id the transaction is scoped to")


async def upsert(db: RagDatabase, team_id: str, chunks: list[EmbeddedChunk]) -> WriteStats:
    """Idempotent bulk upsert (merge semantics: nothing is deleted)."""
    if not chunks:
        return WriteStats()
    _check_single_team(team_id, chunks)
    batch_rows = db.settings.rag_upsert_write_batch_rows

    async def _fn(conn: asyncpg.Connection) -> WriteStats:
        return await _write_rows(conn, team_id, chunks, batch_rows)

    return await run_tenant_tx(db, team_id, _fn)


async def replace_source_chunks(
    db: RagDatabase,
    team_id: str,
    source_type: EmbeddingSource | str,
    source_id: str,
    chunks: list[EmbeddedChunk],
    *,
    keep_count: int,
) -> WriteStats:
    """Atomically make a source's stored chunks equal a new snapshot.

    `chunks` are the rows that need WRITING (changed/new); `keep_count` is the
    size of the FULL new snapshot (indices 0..keep_count-1). Rows with
    chunk_index >= keep_count are orphans from a longer previous version and
    are deleted in the same transaction, so readers never see a half-replaced
    source. An advisory lock serialises concurrent re-processing of one source.
    """
    source_type_value = source_type.value if isinstance(source_type, EmbeddingSource) else source_type
    _check_single_team(team_id, chunks)
    batch_rows = db.settings.rag_upsert_write_batch_rows
    lock_key = f"{team_id}:{source_type_value}:{source_id}"

    async def _fn(conn: asyncpg.Connection) -> WriteStats:
        await conn.execute(_LOCK_SQL, lock_key)
        stats = await _write_rows(conn, team_id, chunks, batch_rows) if chunks else WriteStats()
        status = await conn.execute(_DELETE_ORPHANS_SQL, team_id, source_type_value, source_id, keep_count)
        stats.deleted_orphans = int(status.rsplit(" ", 1)[-1])
        return stats

    return await run_tenant_tx(db, team_id, _fn)


async def delete_by_source(db: RagDatabase, team_id: str, source_type: EmbeddingSource | str,
                           source_id: str) -> int:
    """Delete every chunk of one source (meeting/commitment deletion, GDPR erasure)."""
    source_type_value = source_type.value if isinstance(source_type, EmbeddingSource) else source_type

    async def _fn(conn: asyncpg.Connection) -> int:
        status = await conn.execute(_DELETE_SOURCE_SQL, team_id, source_type_value, source_id)
        return int(status.rsplit(" ", 1)[-1])

    return await run_tenant_tx(db, team_id, _fn)


# ─── Diff reads (used by the embedder) ────────────────────────────────────────


async def fetch_existing(
    db: RagDatabase, team_id: str, sources: set[tuple[str, str]]
) -> dict[tuple[str, str, int], ExistingRow]:
    if not sources:
        return {}
    ordered = sorted(sources)

    async def _fn(conn: asyncpg.Connection) -> dict[tuple[str, str, int], ExistingRow]:
        rows = await conn.fetch(_EXISTING_SQL, team_id, [s[0] for s in ordered], [s[1] for s in ordered])
        return {
            (r["source_type"], r["source_id"], r["chunk_index"]):
                ExistingRow(r["content_hash"], dict(r["metadata"]), r["source_date"])
            for r in rows
        }

    return await run_tenant_tx(db, team_id, _fn, readonly=True)


async def fetch_vectors_by_hash(
    db: RagDatabase, team_id: str, hashes: list[str], model_name: str = EMBEDDING_MODEL
) -> dict[str, list[float]]:
    """Vectors already stored in THIS team for these hashes (cross-team reuse is forbidden)."""
    if not hashes:
        return {}

    async def _fn(conn: asyncpg.Connection) -> dict[str, list[float]]:
        rows = await conn.fetch(_VECTORS_BY_HASH_SQL, team_id, hashes, model_name)
        return {r["content_hash"]: _as_list(r["embedding"]) for r in rows}

    return await run_tenant_tx(db, team_id, _fn, readonly=True)


# ─── Search ───────────────────────────────────────────────────────────────────


def build_filter_sql(query: VectorSearchQuery, model_name: str, first_param: int) -> tuple[list[str], list[Any]]:
    """WHERE fragments (beyond team_id/model) and their bound args, numbered from `first_param`."""
    fragments: list[str] = []
    args: list[Any] = []

    def add(fragment: str, value: Any) -> None:
        args.append(value)
        fragments.append(fragment.replace("{n}", f"${first_param + len(args) - 1}"))

    if query.source_types:
        add("source_type = ANY({n}::text[])", [s.value for s in query.source_types])
    if query.source_ids_filter:
        add("source_id = ANY({n}::text[])", list(query.source_ids_filter))
    containment: dict[str, Any] = dict(query.metadata_filter or {})
    if query.meeting_id:
        containment["meeting_id"] = query.meeting_id
    if containment:
        add("metadata @> {n}::jsonb", containment)
    if getattr(query, "meeting_ids", None) is not None:
        # transcript chunks AND derived rows (commitments, decisions…) carry metadata.meeting_id
        add("(metadata->>'meeting_id') = ANY({n}::text[])", list(query.meeting_ids))
    if query.date_range:
        start, end = query.date_range
        add("source_date >= {n}::date", start)
        add("source_date <= {n}::date", end)
    return fragments, args


def build_search_sql(query: VectorSearchQuery, model_name: str = EMBEDDING_MODEL) -> tuple[str, list[Any]]:
    """The full similarity SQL + args. Pure, so tests can assert its shape."""
    args: list[Any] = [query.team_id, _vec(query.query_embedding), model_name]
    fragments, filter_args = build_filter_sql(query, model_name, first_param=4)
    args += filter_args
    where = " AND ".join(["team_id = $1", "model_name = $3", *fragments])
    args.append(query.top_k)
    sql = (
        f"{_SEARCH_SELECT} WHERE {where} "
        f"ORDER BY embedding <=> $2::vector LIMIT ${len(args)}"
    )
    return sql, args


async def similarity_search_with_stats(db: RagDatabase, query: VectorSearchQuery) -> SearchOutcome:
    started = time.monotonic()
    sql, args = build_search_sql(query)

    async def _fn(conn: asyncpg.Connection) -> tuple[list[asyncpg.Record], bool]:
        rows = await conn.fetch(sql, *args)
        underfilled = False
        if len(rows) < query.top_k and query.has_filters:
            # Early warning for ADR-6: fewer than top_k came back; do MORE matching
            # rows exist? Exact (index-free) count capped at top_k.
            fragments, filter_args = build_filter_sql(query, EMBEDDING_MODEL, first_param=3)
            where = " AND ".join(["team_id = $1", "model_name = $2", *fragments])
            exact = await conn.fetchval(
                f"SELECT count(*) FROM (SELECT 1 FROM rag.embeddings WHERE {where} "
                f"LIMIT ${3 + len(filter_args)}) s",
                query.team_id, EMBEDDING_MODEL, *filter_args, query.top_k,
            )
            underfilled = exact > len(rows)
        return rows, underfilled

    rows, underfilled = await run_tenant_tx(db, query.team_id, _fn, readonly=True, search=True,
                                            top_k=query.top_k)

    results: list[VectorSearchResult] = []
    for row in rows:
        similarity = min(1.0, max(0.0, 1.0 - float(row["distance"])))
        if similarity < query.min_similarity:
            continue
        results.append(VectorSearchResult(
            id=row["id"],
            chunk_text=row["chunk_text"],
            source_type=EmbeddingSource(row["source_type"]),
            source_id=row["source_id"],
            chunk_index=row["chunk_index"],
            metadata=dict(row["metadata"]),
            source_date=row["source_date"],
            model_name=row["model_name"],
            similarity_score=similarity,
            rank=len(results) + 1,
        ))

    latency = time.monotonic() - started
    metrics.observe("vector_search_latency_seconds", latency)
    metrics.inc("vector_search_requests_total")
    metrics.inc("vector_search_results_returned", len(results))
    if underfilled:
        metrics.inc("vector_search_underfill_total")
    return SearchOutcome(
        results,
        SearchStats(requested_k=query.top_k, returned_k=len(results), underfilled=underfilled,
                    latency_ms=round(latency * 1000, 2)),
    )


async def similarity_search(db: RagDatabase, query: VectorSearchQuery) -> list[VectorSearchResult]:
    """Top-k chunks for a query vector — tenant-safe, current model only, ranked
    by descending similarity (the Day 57 contract)."""
    return (await similarity_search_with_stats(db, query)).results


# ─── Lexical leg (Day 57) ─────────────────────────────────────────────────────


def build_lexical_sql(query: LexicalSearchQuery, model_name: str = EMBEDDING_MODEL) -> tuple[str, list[Any]]:
    """Full-text leg SQL. Pure, so tests can assert its shape.

    Two steps on purpose: (1) rank matching rows by ts_rank_cd WITHOUT touching their
    (TOASTed, 6 KB) vectors and keep the top k; (2) join back for only those k rows and
    compute their exact cosine. A single query would detoast every matching row's vector
    before sorting. The cosine is informational (thresholds need it); it never orders results.

    The tsquery string is a BOUND parameter built from sanitised tokens only.
    """
    args: list[Any] = [query.team_id, _vec(query.query_embedding), model_name, to_tsquery_or(query.tokens)]
    fragments, filter_args = build_filter_sql(query, model_name, first_param=5)
    args += filter_args
    args += [query.rank_normalization, query.top_k]
    norm_param, limit_param = len(args) - 1, len(args)
    where = " AND ".join(["team_id = $1", "model_name = $3", "chunk_tsv @@ to_tsquery('simple', $4)", *fragments])
    sql = (
        f"WITH top AS MATERIALIZED ("
        f"SELECT id, ts_rank_cd(chunk_tsv, to_tsquery('simple', $4), ${norm_param}::int) AS rnk, "
        f"source_id, chunk_index FROM rag.embeddings WHERE {where} "
        f"ORDER BY rnk DESC, source_id, chunk_index LIMIT ${limit_param}) "
        f"SELECT e.id, e.chunk_text, e.source_type, e.source_id, e.chunk_index, e.metadata, e.source_date, "
        f"e.model_name, 1 - (e.embedding <=> $2::vector) AS cosine "
        f"FROM top t JOIN rag.embeddings e ON e.id = t.id AND e.team_id = $1 "
        f"ORDER BY t.rnk DESC, t.source_id, t.chunk_index"
    )
    return sql, args


async def lexical_search(db: RagDatabase, query: LexicalSearchQuery) -> list[VectorSearchResult]:
    """Full-text candidates for one tenant, best first. Same tenant_tx / RLS / filters as the vector leg."""
    started = time.monotonic()
    sql, args = build_lexical_sql(query)

    async def _fn(conn: asyncpg.Connection) -> list[asyncpg.Record]:
        return await conn.fetch(sql, *args)

    rows = await run_tenant_tx(db, query.team_id, _fn, readonly=True, lexical=True)
    results = [
        VectorSearchResult(
            id=row["id"], chunk_text=row["chunk_text"], source_type=EmbeddingSource(row["source_type"]),
            source_id=row["source_id"], chunk_index=row["chunk_index"], metadata=dict(row["metadata"]),
            source_date=row["source_date"], model_name=row["model_name"],
            similarity_score=min(1.0, max(0.0, float(row["cosine"]))), rank=position,
        )
        for position, row in enumerate(rows, start=1)
    ]
    metrics.observe("lexical_search_latency_seconds", time.monotonic() - started)
    metrics.inc("lexical_search_requests_total")
    return results
