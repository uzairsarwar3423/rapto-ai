"""
rag/backfill.py — source readers, resumable job runner, dry-run estimator and
the worker loop. Used by the service (RAG_WORKER_ENABLED) and by
scripts/backfill_embeddings.py.

SOURCES
  transcript_chunk  MongoDB `transcripts` (normalized_transcript) → Day 48 chunker
  commitment / action_item / decision / summary
                    the application Postgres, via RAG_SOURCE_DATABASE_URL
                    (a READ-ONLY role; the tenant role cannot see those tables)

All readers use KEYSET pagination on (created_at, id) — never OFFSET, never
"load everything" — so a million-row tenant streams in constant memory, and the
(created_at, id) pair is the job cursor, which makes a job resumable.
"""

from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Any, AsyncIterator, Optional, Protocol

import asyncpg
import structlog

from src.config.model_routing import PRICING_TABLE
from src.config.rag_config import EMBEDDING_MODEL, RagSettings
from src.models.chunk_models import ChunkingStrategy, TranscriptContent
from src.models.cleanup_models import CleanedTranscriptTurn
from src.models.common import ModelTier
from src.models.rag_models import ChunkToEmbed, EmbeddingJob, EmbeddingSource, UpsertMode
from src.rag import jobs
from src.rag.batching import count_tokens
from src.rag.chunker_adapter import to_chunks_to_embed
from src.rag.db import RagDatabase
from src.rag.embedder import EmbeddingClient, embed_chunks
from src.rag.errors import RagValidationError
from src.rag.rate_limit import TokenBucket
from src.services.chunker import chunk_content

log = structlog.get_logger(__name__)


@dataclass
class SourceUnit:
    source_type: EmbeddingSource
    source_id: str
    chunks: list[ChunkToEmbed]


@dataclass
class Page:
    units: list[SourceUnit]
    cursor: dict[str, Any]          # position AFTER this page (resume point)


class SourceReader(Protocol):
    source_type: EmbeddingSource

    async def count(self, team_id: str, since: Optional[date]) -> int: ...

    def pages(self, team_id: str, since: Optional[date], after: Optional[dict[str, Any]],
              page_size: int) -> AsyncIterator[Page]: ...


def _iso(value: datetime) -> str:
    return (value if value.tzinfo else value.replace(tzinfo=timezone.utc)).isoformat()


def _since_dt(since: Optional[date]) -> Optional[datetime]:
    return datetime(since.year, since.month, since.day, tzinfo=timezone.utc) if since else None


# ─── Transcripts (MongoDB) ────────────────────────────────────────────────────


def turns_from_mongo(raw_turns: list[dict[str, Any]]) -> list[CleanedTranscriptTurn]:
    """normalized_transcript is cleaned turns, or RAW turns when cleanup was
    unavailable (degraded mode) — accept both shapes."""
    turns: list[CleanedTranscriptTurn] = []
    for index, t in enumerate(raw_turns):
        text = (t.get("cleaned_text") or t.get("text") or "").strip()
        if not text:
            continue
        turns.append(CleanedTranscriptTurn(
            turn_id=str(t.get("turn_id") or t.get("id") or f"turn-{index}"),
            cleaned_text=text,
            original_text=(t.get("original_text") or text),
            speaker_name=t.get("speaker_name") or t.get("speaker_tag") or t.get("speaker") or "Unknown Speaker",
            speaker_user_id=t.get("speaker_user_id"),
            start_time=max(float(t.get("start_time") or t.get("start_timestamp") or 0.0), 0.0),
            end_time=max(float(t.get("end_time") or t.get("end_timestamp") or 0.0), 0.0),
        ))
    return turns


class TranscriptReader:
    source_type = EmbeddingSource.TRANSCRIPT_CHUNK

    def __init__(self, collection: Any, settings: RagSettings, source_pool: Optional[asyncpg.Pool]) -> None:
        self._col = collection
        self._settings = settings
        self._pool = source_pool

    def _filter(self, team_id: str, since: Optional[date], after: Optional[dict[str, Any]]) -> dict[str, Any]:
        query: dict[str, Any] = {"team_id": team_id, "normalized_transcript": {"$exists": True, "$ne": []}}
        if since:
            query["created_at"] = {"$gte": _since_dt(since)}
        if after:
            from bson import ObjectId

            ts, oid = datetime.fromisoformat(after["ts"]), ObjectId(after["id"])
            query["$or"] = [{"created_at": {"$gt": ts}}, {"created_at": ts, "_id": {"$gt": oid}}]
        return query

    async def count(self, team_id: str, since: Optional[date]) -> int:
        return int(await self._col.count_documents(self._filter(team_id, since, None)))

    async def _meeting_info(self, team_id: str, meeting_ids: list[str]) -> dict[str, tuple[str, date]]:
        if not self._pool or not meeting_ids:
            return {}
        rows = await self._pool.fetch(
            'SELECT id, title, "scheduledAt" FROM meetings WHERE "teamId" = $1 AND id = ANY($2::text[])',
            team_id, meeting_ids,
        )
        return {r["id"]: (r["title"], r["scheduledAt"].date()) for r in rows}

    async def pages(self, team_id: str, since: Optional[date], after: Optional[dict[str, Any]],
                    page_size: int) -> AsyncIterator[Page]:
        position = after
        while True:
            docs = await (self._col.find(self._filter(team_id, since, position))
                          .sort([("created_at", 1), ("_id", 1)]).limit(page_size).to_list(length=page_size))
            if not docs:
                return
            info = await self._meeting_info(team_id, [str(d.get("meeting_id")) for d in docs])
            units: list[SourceUnit] = []
            for doc in docs:
                meeting_id = str(doc.get("meeting_id") or doc["_id"])
                title, meeting_date = info.get(meeting_id, (None, None))
                created = doc.get("created_at")
                source_date = meeting_date or (created.date() if isinstance(created, datetime) else None)
                turns = turns_from_mongo(doc.get("normalized_transcript") or [])
                chunks: list[ChunkToEmbed] = []
                if turns:
                    text_chunks, _ = chunk_content(
                        TranscriptContent(turns=turns), ChunkingStrategy.SPEAKER_TURN_GROUPED,
                        max_tokens=self._settings.rag_chunk_max_tokens,
                        overlap_units=self._settings.rag_chunk_overlap_turns,
                    )
                    base = {"meeting_id": meeting_id}
                    if title:
                        base["meeting_title"] = title
                    try:
                        chunks = to_chunks_to_embed(
                            text_chunks, team_id=team_id, source_type=self.source_type, source_id=meeting_id,
                            source_date=source_date, base_metadata=base,
                            max_chunks=self._settings.max_chunks_per_source,
                        )
                    except RagValidationError as exc:
                        log.warning("backfill_source_skipped", source_id=meeting_id, reason=str(exc)[:200])
                units.append(SourceUnit(self.source_type, meeting_id, chunks))
            last = docs[-1]
            position = {"ts": _iso(last["created_at"]), "id": str(last["_id"])}
            yield Page(units, position)
            if len(docs) < page_size:
                return


# ─── Application tables (Postgres) ────────────────────────────────────────────

# Fixed SQL per source. Caller input is NEVER interpolated: only constant
# fragments and parameter numbers are assembled; every value is a bound arg.

@dataclass(frozen=True)
class _PgSource:
    source_type: EmbeddingSource
    select: str            # SELECT … FROM table WHERE "teamId" = $1 …  (cols: id, createdAt + payload)
    table_filter: str      # extra fixed predicate, e.g. AND summary IS NOT NULL


_PG_SOURCES: dict[EmbeddingSource, _PgSource] = {
    EmbeddingSource.COMMITMENT: _PgSource(
        EmbeddingSource.COMMITMENT,
        'SELECT id, "meetingId", text, "ownerNameRaw", "ownerId", "dueDate", "createdAt" FROM commitments',
        "",
    ),
    EmbeddingSource.ACTION_ITEM: _PgSource(
        EmbeddingSource.ACTION_ITEM,
        'SELECT id, "meetingId", text, priority::text AS priority, "dueDate", "createdAt" FROM action_items',
        "",
    ),
    EmbeddingSource.DECISION: _PgSource(
        EmbeddingSource.DECISION,
        'SELECT id, "meetingId", text, "madeBy", "decisionType", "createdAt" FROM decisions',
        "",
    ),
    EmbeddingSource.SUMMARY: _PgSource(
        EmbeddingSource.SUMMARY,
        'SELECT id, id AS "meetingId", title, summary AS text, "createdAt" FROM meetings',
        " AND summary IS NOT NULL AND length(summary) > 0",
    ),
}


def _summary_text(raw: str) -> str:
    """Meeting.summary is a string; the extract worker stores structured summaries as JSON."""
    try:
        data = json.loads(raw)
    except (TypeError, ValueError):
        return raw
    if not isinstance(data, dict):
        return raw
    parts = [data.get("meeting_purpose", ""), data.get("overview", "")]
    parts += [f"Key takeaway: {t}" for t in data.get("key_takeaways", []) or []]
    parts += [f"Decision: {d}" for d in data.get("decisions", []) or []]
    parts += [f"Conclusion: {c}" for c in data.get("conclusions", []) or []]
    return "\n".join(p for p in parts if p and str(p).strip()) or raw


def _row_to_text(source: EmbeddingSource, row: asyncpg.Record) -> tuple[str, dict[str, Any]]:
    meta: dict[str, Any] = {"meeting_id": row["meetingId"]}
    if source is EmbeddingSource.COMMITMENT:
        owner = row["ownerNameRaw"] or "Unassigned"
        text = f"Commitment by {owner}: {row['text']}"
        if row["dueDate"]:
            text += f" (due {row['dueDate']:%Y-%m-%d})"
            meta["due_date_utc"] = _iso(row["dueDate"])
        if row["ownerId"]:
            meta["commitment_owner_id"] = row["ownerId"]
    elif source is EmbeddingSource.ACTION_ITEM:
        text = f"Action item ({row['priority']} priority): {row['text']}"
    elif source is EmbeddingSource.DECISION:
        by = f" by {row['madeBy']}" if row["madeBy"] else ""
        text = f"Decision{by}: {row['text']}"
    else:
        text = _summary_text(row["text"])
        if row["title"]:
            meta["meeting_title"] = row["title"]
    return text, meta


class PgReader:
    def __init__(self, source: EmbeddingSource, pool: asyncpg.Pool) -> None:
        self.source_type = source
        self._src = _PG_SOURCES[source]
        self._pool = pool

    def _query(
        self, team_id: str, since: Optional[date], after: Optional[dict[str, Any]], page_size: int,
    ) -> tuple[str, list[Any]]:
        """Keyset page query. Placeholders are numbered as args are appended, so
        there are never gaps (Postgres rejects untyped, unused parameters)."""
        args: list[Any] = [team_id]
        sql = f'{self._src.select} WHERE "teamId" = $1{self._src.table_filter}'
        if since:
            args.append(_since_dt(since))
            sql += f' AND "createdAt" >= ${len(args)}'
        if after:
            args += [datetime.fromisoformat(after["ts"]), after["id"]]
            sql += f' AND ("createdAt", id) > (${len(args) - 1}::timestamptz, ${len(args)}::text)'
        args.append(page_size)
        sql += f' ORDER BY "createdAt", id LIMIT ${len(args)}'
        return sql, args

    async def count(self, team_id: str, since: Optional[date]) -> int:
        table = self._src.select.rsplit(" FROM ", 1)[1]
        args: list[Any] = [team_id]
        sql = f'SELECT count(*) FROM {table} WHERE "teamId" = $1{self._src.table_filter}'
        if since:
            args.append(_since_dt(since))
            sql += f' AND "createdAt" >= ${len(args)}'
        return int(await self._pool.fetchval(sql, *args))

    async def pages(self, team_id: str, since: Optional[date], after: Optional[dict[str, Any]],
                    page_size: int) -> AsyncIterator[Page]:
        position = after
        while True:
            sql, args = self._query(team_id, since, position, page_size)
            rows = await self._pool.fetch(sql, *args)
            if not rows:
                return
            units: list[SourceUnit] = []
            for row in rows:
                text, meta = _row_to_text(self.source_type, row)
                units.append(SourceUnit(self.source_type, row["id"], [ChunkToEmbed(
                    content=text, source_type=self.source_type, source_id=row["id"], chunk_index=0,
                    team_id=team_id, source_date=row["createdAt"].date(), metadata=meta,
                )]))
            last = rows[-1]
            position = {"ts": _iso(last["createdAt"]), "id": last["id"]}
            yield Page(units, position)
            if len(rows) < page_size:
                return


# ─── Runner ───────────────────────────────────────────────────────────────────


@dataclass
class Estimate:
    sources: int = 0
    chunks: int = 0
    tokens: int = 0
    cost_usd: float = 0.0
    seconds: float = 0.0
    by_type: dict[str, dict[str, int]] = field(default_factory=dict)


class BackfillRunner:
    def __init__(
        self,
        db: RagDatabase,
        client: EmbeddingClient,
        *,
        bucket: Optional[TokenBucket] = None,
        mongo_db: Any = None,
        source_pool: Optional[asyncpg.Pool] = None,
    ) -> None:
        self._db = db
        self._client = client
        self._settings: RagSettings = db.settings
        self._bucket = bucket or TokenBucket(self._settings.embedding_tpm_budget)
        self._mongo_db = mongo_db
        self._source_pool = source_pool

    def reader_for(self, source_type: str) -> SourceReader:
        kind = EmbeddingSource(source_type)
        if kind is EmbeddingSource.TRANSCRIPT_CHUNK:
            if self._mongo_db is None:
                raise RagValidationError("transcript backfill needs MongoDB (not configured)")
            return TranscriptReader(self._mongo_db["transcripts"], self._settings, self._source_pool)
        if kind in _PG_SOURCES:
            if self._source_pool is None:
                raise RagValidationError(
                    f"{source_type} backfill needs RAG_SOURCE_DATABASE_URL (read-only application DB)"
                )
            return PgReader(kind, self._source_pool)
        raise RagValidationError(f"source type {source_type} has no backfill source")

    async def estimate(self, team_id: str, source_types: list[str], since: Optional[date]) -> Estimate:
        """Dry run: counts sources/chunks/tokens and prices them. NO API calls.
        An UPPER bound — it cannot know how many chunks are already embedded or reusable."""
        out = Estimate()
        rate = PRICING_TABLE[ModelTier.EMBED].input_per_million_usd
        for source_type in source_types:
            reader = self.reader_for(source_type)
            entry = {"sources": 0, "chunks": 0, "tokens": 0}
            async for page in reader.pages(team_id, since, None, self._settings.rag_backfill_page_size):
                for unit in page.units:
                    entry["sources"] += 1
                    for chunk in unit.chunks:
                        entry["chunks"] += 1
                        entry["tokens"] += min(count_tokens(chunk.content), self._settings.embedding_max_input_tokens)
            out.by_type[source_type] = entry
            out.sources += entry["sources"]
            out.chunks += entry["chunks"]
            out.tokens += entry["tokens"]
        out.cost_usd = round(out.tokens / 1_000_000 * rate, 6)
        out.seconds = round(out.tokens / (self._settings.embedding_tpm_budget / 60.0), 1)
        return out

    async def run_job(self, job: EmbeddingJob, stop: Optional[asyncio.Event] = None) -> str:
        """Execute (or resume) a claimed job. Returns succeeded | cancelled | released."""
        settings = self._settings
        team_id = job.team_id
        resume = job.cursor or {}
        start_index = int(resume.get("type_index", 0))
        request_id = f"backfill-{job.id}"
        every = settings.rag_job_checkpoint_every_sources

        if job.total_sources is None:
            total = 0
            for source_type in job.source_types:
                total += await self.reader_for(source_type).count(team_id, job.since)
            await jobs.checkpoint(self._db, team_id, job.id, cursor=resume, total_sources=total)

        for index in range(start_index, len(job.source_types)):
            source_type = job.source_types[index]
            reader = self.reader_for(source_type)
            after = resume.get("after") if index == start_index else None
            page_start = after            # resume point if we crash MID-page
            async for page in reader.pages(team_id, job.since, after, settings.rag_backfill_page_size):
                if stop is not None and stop.is_set():
                    await jobs.release(self._db, team_id, job.id)
                    return "released"
                for lo in range(0, len(page.units), every):       # bound memory + checkpoint cadence
                    part = page.units[lo:lo + every]
                    chunks = [c for u in part for c in u.chunks]
                    result = await embed_chunks(chunks, self._client, self._db, mode=UpsertMode.REPLACE,
                                                request_id=request_id, bucket=self._bucket)
                    last_part = lo + every >= len(page.units)
                    alive = await jobs.checkpoint(
                        self._db, team_id, job.id,
                        cursor={"type_index": index, "after": page.cursor if last_part else page_start},
                        processed=len(part),
                        upserted=result.upserted_count + result.updated_count,
                        reused=result.reused_vector_count,
                        skipped=result.unchanged_count,
                        failed=result.failed_count,
                        cost_usd=result.total_cost.estimated_cost_usd,
                    )
                    if not alive:
                        log.info("backfill_job_stopped_externally", job_id=str(job.id))
                        return "cancelled"
                page_start = page.cursor
            resume = {}
        await jobs.complete(self._db, team_id, job.id)
        return "succeeded"


# ─── Worker loop ──────────────────────────────────────────────────────────────


async def run_worker(db: RagDatabase, runner: BackfillRunner, stop: asyncio.Event) -> None:
    """Claim and execute queued jobs until `stop` is set. Safe to run in N pods."""
    settings = db.settings
    last_reap = 0.0
    log.info("rag_worker_started")
    while not stop.is_set():
        try:
            if time.monotonic() - last_reap > 60:
                last_reap = time.monotonic()
                moved = await jobs.requeue_stale(db, settings.rag_job_heartbeat_stale_seconds)
                if moved:
                    log.warning("rag_jobs_requeued_stale", count=moved)
            claimed = await jobs.claim_next_job(db)
            if claimed is None:
                try:
                    await asyncio.wait_for(stop.wait(), timeout=settings.rag_worker_poll_seconds)
                except asyncio.TimeoutError:
                    pass
                continue
            job_id, team_id = claimed
            job = await jobs.get_job(db, team_id, job_id)
            if job is None:
                continue
            try:
                outcome = await runner.run_job(job, stop)
                log.info("rag_job_finished", job_id=str(job_id), outcome=outcome)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 — one bad job must not kill the worker
                log.error("rag_job_failed", job_id=str(job_id), error_type=type(exc).__name__, error=str(exc)[:300])
                await jobs.fail(db, team_id, job_id, f"{type(exc).__name__}: {exc}")
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            log.error("rag_worker_loop_error", error_type=type(exc).__name__, error=str(exc)[:300])
            await asyncio.sleep(settings.rag_worker_poll_seconds)
    log.info("rag_worker_stopped")
