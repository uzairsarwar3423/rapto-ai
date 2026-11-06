"""
rag/source_context.py — batched meeting/user lookup for citations and the re-ranker.

  * AT MOST one query per entity type (meetings, users) per call, both in ONE
    tenant transaction — never one per chunk. Zero queries on a full cache hit.
  * Reads ONLY the narrow view rag.v_rag_source_context (column allow-list,
    tenant predicate, fail closed). The runtime role has no grant on core tables.
  * Cache keys include team_id, so tenants never share entries. Only POSITIVE
    lookups are cached: caching "not found" could hide a meeting that was saved a
    moment before its chunks were embedded.
  * ORPHAN GUARD: a chunk whose meeting is missing / uncitable is reported as
    unresolved and dropped by the retriever (the user could not open it).
  * If the lookup itself fails, fall back to the denormalised title/date in the
    chunk metadata and mark the context stale — retrieval never fails over a title.
"""

from __future__ import annotations

import time
from collections import OrderedDict
from datetime import date, datetime, timezone
from typing import Any, Callable, Optional, Sequence
from zoneinfo import ZoneInfo

import asyncpg
import structlog

from src.config.rag_config import UNCITABLE_MEETING_STATUSES, RagSettings
from src.models.rag_models import EmbeddingSource, MeetingInfo, ScoredChunk, SourceContext
from src.rag.citation_builder import meeting_id_of
from src.rag.db import RagDatabase
from src.rag.metrics import metrics
from src.rag.tenant_context import run_tenant_tx

log = structlog.get_logger(__name__)

_MEETINGS_SQL = (
    "SELECT ref_id, label, at, status FROM rag.v_rag_source_context "
    "WHERE kind = 'meeting' AND team_id = $1 AND ref_id = ANY($2::text[])"
)
_USERS_SQL = (
    "SELECT ref_id, label FROM rag.v_rag_source_context "
    "WHERE kind = 'user' AND team_id = $1 AND ref_id = ANY($2::text[])"
)


async def fetch_meetings(conn: asyncpg.Connection, team_id: str, ids: list[str]) -> list[asyncpg.Record]:
    return await conn.fetch(_MEETINGS_SQL, team_id, ids)


async def fetch_users(conn: asyncpg.Connection, team_id: str, ids: list[str]) -> list[asyncpg.Record]:
    return await conn.fetch(_USERS_SQL, team_id, ids)


class _TTLMap:
    def __init__(self, size: int, ttl_s: float, clock: Callable[[], float]) -> None:
        self._size, self._ttl, self._clock = size, ttl_s, clock
        self._data: OrderedDict[tuple[str, str, str], tuple[float, Any]] = OrderedDict()

    def get(self, key: tuple[str, str, str]) -> Any:
        hit = self._data.get(key)
        if hit is None:
            return None
        if self._clock() >= hit[0]:
            del self._data[key]
            return None
        self._data.move_to_end(key)
        return hit[1]

    def put(self, key: tuple[str, str, str], value: Any) -> None:
        if self._size <= 0 or self._ttl <= 0:
            return
        self._data[key] = (self._clock() + self._ttl, value)
        self._data.move_to_end(key)
        while len(self._data) > self._size:
            self._data.popitem(last=False)


def _local_date(moment: Optional[datetime], tz_name: str) -> Optional[date]:
    if moment is None:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    try:
        return moment.astimezone(ZoneInfo(tz_name)).date()
    except Exception:  # noqa: BLE001 — unknown timezone → UTC date
        return moment.astimezone(timezone.utc).date()


def collect_ids(candidates: Sequence[ScoredChunk]) -> tuple[set[str], set[str]]:
    meetings: set[str] = set()
    users: set[str] = set()
    for c in candidates:
        meta = c.chunk.metadata
        meeting = meeting_id_of(c.chunk.source_type, c.chunk.source_id, meta)
        if meeting:
            meetings.add(meeting)
        for key in ("commitment_owner_id", "speaker_user_id"):
            value = meta.get(key)
            if isinstance(value, str) and value:
                users.add(value)
    return meetings, users


class SourceContextResolver:
    def __init__(self, db: RagDatabase, settings: RagSettings | None = None, *,
                 clock: Callable[[], float] = time.monotonic) -> None:
        self._db = db
        self._settings = settings or db.settings
        self._cache = _TTLMap(self._settings.source_context_cache_size,
                              self._settings.source_context_cache_ttl_s, clock)

    async def resolve(self, candidates: Sequence[ScoredChunk], team_id: str,
                      timezone_name: str = "UTC") -> SourceContext:
        meeting_ids, user_ids = collect_ids(candidates)
        ctx = SourceContext()

        missing_meetings = []
        for mid in sorted(meeting_ids):
            cached = self._cache.get((team_id, "meeting", mid))
            if cached is None:
                missing_meetings.append(mid)
            else:
                ctx.meetings[mid] = cached
        missing_users = []
        for uid in sorted(user_ids):
            cached_name = self._cache.get((team_id, "user", uid))
            if cached_name is None:
                missing_users.append(uid)
            else:
                ctx.users[uid] = cached_name
        hits = (len(meeting_ids) - len(missing_meetings)) + (len(user_ids) - len(missing_users))
        total = len(meeting_ids) + len(user_ids)
        if total:
            metrics.inc("rag_source_ctx_lookups_total", total)
            metrics.inc("rag_source_ctx_cache_hits_total", hits)

        if missing_meetings or missing_users:
            try:
                meeting_rows, user_rows = await self._query(team_id, missing_meetings, missing_users)
            except Exception as exc:  # noqa: BLE001 — never fail retrieval over a title
                log.warning("source_context_lookup_failed", error_type=type(exc).__name__)
                metrics.inc("rag_source_ctx_failures_total")
                self._fallback(ctx, candidates, missing_meetings)
                return ctx
            found: set[str] = set()
            for row in meeting_rows:
                info = MeetingInfo(title=row["label"], meeting_date=_local_date(row["at"], timezone_name),
                                   status=row["status"])
                found.add(row["ref_id"])
                if info.status in UNCITABLE_MEETING_STATUSES:
                    ctx.unresolved_meetings.add(row["ref_id"])
                    continue
                ctx.meetings[row["ref_id"]] = info
                self._cache.put((team_id, "meeting", row["ref_id"]), info)
            ctx.unresolved_meetings.update(set(missing_meetings) - found)
            for row in user_rows:
                ctx.users[row["ref_id"]] = row["label"]
                self._cache.put((team_id, "user", row["ref_id"]), row["label"])
        return ctx

    async def _query(self, team_id: str, meetings: list[str], users: list[str]) -> tuple[list[Any], list[Any]]:
        async def _fn(conn: asyncpg.Connection) -> tuple[list[Any], list[Any]]:
            m = await fetch_meetings(conn, team_id, meetings) if meetings else []
            u = await fetch_users(conn, team_id, users) if users else []
            return list(m), list(u)

        return await run_tenant_tx(self._db, team_id, _fn, readonly=True)

    @staticmethod
    def _fallback(ctx: SourceContext, candidates: Sequence[ScoredChunk], missing: list[str]) -> None:
        """Lookup failed: use what the chunks carry (denormalised title; source_date = meeting date)."""
        ctx.stale = True
        wanted = set(missing)
        for c in candidates:
            mid = meeting_id_of(c.chunk.source_type, c.chunk.source_id, c.chunk.metadata)
            if not mid or mid not in wanted or mid in ctx.meetings:
                continue
            title = c.chunk.metadata.get("meeting_title")
            ctx.meetings[mid] = MeetingInfo(
                title=title if isinstance(title, str) else None,
                meeting_date=c.chunk.source_date if c.chunk.source_type is EmbeddingSource.TRANSCRIPT_CHUNK else None,
            )
