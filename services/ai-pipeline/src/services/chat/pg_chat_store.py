"""
services/chat/pg_chat_store.py
──────────────────────────────
Postgres implementation of ChatDataStore. EVERY call goes through the Day 56 `run_tenant_tx` — the single path that
sets `app.current_team_id` with `set_config(..., true)` (a bind-parameter-safe, transaction-local setting; the spec's
`SET LOCAL app.current_team_id = $1` cannot take a bind parameter) — and reads only the migration-004 views. Read
paths use READ ONLY transactions with a statement timeout.
"""

from __future__ import annotations

import time
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional, Sequence

import asyncpg

from src.models.rag_models import AccessScope
from src.rag.db import RagDatabase
from src.rag.tenant_context import run_tenant_tx
from src.services.chat.data_store import CommitmentFacts, MeetingBrief, RosterEntry

_ROSTER_TTL_S = 60.0
_ROSTER_MAX = 2_000


def _scope_ids(scope: AccessScope) -> Optional[list[str]]:
    return list(scope.meeting_ids or []) if scope.kind == "meetings" else None


class PgChatStore:
    def __init__(self, db: RagDatabase) -> None:
        self._db = db
        self._roster_cache: dict[str, tuple[float, list[RosterEntry]]] = {}

    async def _ro(self, team_id: str, fn: Any, *, timeout_ms: Optional[int] = None) -> Any:
        async def run(conn: asyncpg.Connection) -> Any:
            if timeout_ms is not None:
                await conn.execute("SELECT set_config('statement_timeout', $1, true)", str(timeout_ms))
            return await fn(conn)

        return await run_tenant_tx(self._db, team_id, run, readonly=True)

    # ── validation / scope ────────────────────────────────────────────────────

    async def known_meeting_ids(self, team_id: str, ids: Sequence[str], scope: AccessScope) -> set[str]:
        if not ids:
            return set()
        rows = await self._ro(team_id, lambda c: c.fetch(
            "SELECT id FROM rag.v_chat_meetings WHERE team_id = $1 AND id = ANY($2::text[]) "
            "AND ($3::text[] IS NULL OR id = ANY($3::text[]))", team_id, list(ids), _scope_ids(scope)))
        return {r["id"] for r in rows}

    async def visible_meetings(self, team_id: str, meeting_ids: Sequence[str], scope: AccessScope) -> set[str]:
        return await self.known_meeting_ids(team_id, meeting_ids, scope)

    async def known_user_ids(self, team_id: str, ids: Sequence[str]) -> set[str]:
        if not ids:
            return set()
        rows = await self._ro(team_id, lambda c: c.fetch(
            "SELECT user_id FROM rag.v_chat_members WHERE team_id = $1 AND user_id = ANY($2::text[])", team_id, list(ids)))
        return {r["user_id"] for r in rows}

    async def roster(self, team_id: str) -> list[RosterEntry]:
        hit = self._roster_cache.get(team_id)
        if hit and time.monotonic() - hit[0] < _ROSTER_TTL_S:
            return hit[1]
        rows = await self._ro(team_id, lambda c: c.fetch(
            "SELECT user_id, name FROM rag.v_chat_members WHERE team_id = $1 ORDER BY name LIMIT $2", team_id, _ROSTER_MAX))
        out = [RosterEntry(r["user_id"], r["name"]) for r in rows]
        self._roster_cache[team_id] = (time.monotonic(), out)
        if len(self._roster_cache) > 5_000:
            self._roster_cache.pop(next(iter(self._roster_cache)))
        return out

    async def attended_meeting_ids(self, team_id: str, user_id: str, limit: int) -> list[str]:
        rows = await self._ro(team_id, lambda c: c.fetch(
            "SELECT DISTINCT a.meeting_id FROM rag.v_chat_meeting_access a "
            "WHERE a.team_id = $1 AND a.user_id = $2 LIMIT $3", team_id, user_id, limit))
        return [r["meeting_id"] for r in rows]

    # ── hydration ─────────────────────────────────────────────────────────────

    async def commitments_by_ids(self, team_id: str, ids: Sequence[str], scope: AccessScope) -> dict[str, CommitmentFacts]:
        if not ids:
            return {}
        rows = await self._ro(team_id, lambda c: c.fetch(
            "SELECT id, text, status, owner_id, owner_name, due_date, meeting_id FROM rag.v_chat_commitments "
            "WHERE team_id = $1 AND id = ANY($2::text[]) AND ($3::text[] IS NULL OR meeting_id = ANY($3::text[]))",
            team_id, list(ids), _scope_ids(scope)))
        return {r["id"]: CommitmentFacts(r["id"], "commitment", r["text"], r["status"], r["owner_id"], r["owner_name"],
                                         r["due_date"], r["meeting_id"]) for r in rows}

    async def action_items_by_ids(self, team_id: str, ids: Sequence[str], scope: AccessScope) -> dict[str, CommitmentFacts]:
        if not ids:
            return {}
        rows = await self._ro(team_id, lambda c: c.fetch(
            "SELECT id, text, status, assignee_id, assignee_name, due_date, meeting_id FROM rag.v_chat_action_items "
            "WHERE team_id = $1 AND id = ANY($2::text[]) AND ($3::text[] IS NULL OR meeting_id = ANY($3::text[]))",
            team_id, list(ids), _scope_ids(scope)))
        return {r["id"]: CommitmentFacts(r["id"], "action_item", r["text"], r["status"], r["assignee_id"], r["assignee_name"],
                                         r["due_date"], r["meeting_id"]) for r in rows}

    # ── analytics ─────────────────────────────────────────────────────────────

    async def run_analytics(self, team_id: str, sql: str, args: Sequence[Any], timeout_ms: int) -> list[dict[str, Any]]:
        if "rag.v_chat_" not in sql or "public." in sql:                 # last-resort guard: views only
            raise PermissionError("analytics SQL must read rag.v_chat_* views only")
        rows = await self._ro(team_id, lambda c: c.fetch(sql, *args), timeout_ms=timeout_ms)
        return [dict(r) for r in rows]

    async def recent_meetings(self, team_id: str, scope: AccessScope, limit: int) -> list[MeetingBrief]:
        rows = await self._ro(team_id, lambda c: c.fetch(
            "SELECT id, title, scheduled_at FROM rag.v_chat_meetings WHERE team_id = $1 AND status NOT IN ('CANCELLED','FAILED') "
            "AND scheduled_at <= now() AND ($2::text[] IS NULL OR id = ANY($2::text[])) "
            "ORDER BY scheduled_at DESC LIMIT $3", team_id, _scope_ids(scope), limit))
        return [MeetingBrief(r["id"], r["title"], r["scheduled_at"]) for r in rows]

    async def overdue_commitment_count(self, team_id: str, today: date, tz: str, scope: AccessScope) -> int:
        row = await self._ro(team_id, lambda c: c.fetchrow(
            "SELECT count(*)::int AS n FROM rag.v_chat_commitments c WHERE c.team_id = $1 "
            "AND c.status NOT IN ('FULFILLED','CANCELLED') AND c.due_date IS NOT NULL "
            "AND (c.due_date AT TIME ZONE $2)::date < $3::date AND ($4::text[] IS NULL OR c.meeting_id = ANY($4::text[]))",
            team_id, tz, today, _scope_ids(scope)))
        return int(row["n"]) if row else 0

    # ── ledger ────────────────────────────────────────────────────────────────

    async def sum_usage(self, team_id: str, day_start: datetime, month_start: datetime) -> tuple[int, float, float]:
        row = await self._ro(team_id, lambda c: c.fetchrow(
            "SELECT count(*) FILTER (WHERE stage = 'request' AND counts_as_query AND created_at >= $2)::int AS q, "
            "       COALESCE(sum(cost_usd) FILTER (WHERE created_at >= $2), 0)::float8 AS usd_day, "
            "       COALESCE(sum(cost_usd) FILTER (WHERE created_at >= $3), 0)::float8 AS usd_month "
            "FROM rag.chat_usage_ledger WHERE team_id = $1 AND created_at >= $3", team_id, day_start, month_start))
        return (int(row["q"]), float(row["usd_day"]), float(row["usd_month"])) if row else (0, 0.0, 0.0)

    async def write_ledger(self, rows: Sequence[dict[str, Any]]) -> int:
        by_team: dict[str, list[dict[str, Any]]] = {}
        for r in rows:
            by_team.setdefault(r["team_id"], []).append(r)
        written = 0
        for team_id, team_rows in by_team.items():
            async def insert(conn: asyncpg.Connection, batch: list[dict[str, Any]] = team_rows) -> None:
                await conn.executemany(
                    "INSERT INTO rag.chat_usage_ledger (request_id, team_id, user_id, stage, provider, model, input_tokens, "
                    "output_tokens, cost_usd, estimated, category, counts_as_query, created_at) "
                    "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::timestamptz) ON CONFLICT (request_id, stage) DO NOTHING",
                    [(b["request_id"], b["team_id"], b.get("user_id"), b["stage"], b["provider"], b["model"],
                      int(b["input_tokens"]), int(b["output_tokens"]), Decimal(str(round(float(b["cost_usd"]), 8))),
                      bool(b["estimated"]),
                      b["category"], bool(b["counts_as_query"]), datetime.fromisoformat(b["created_at"])) for b in batch])

            await run_tenant_tx(self._db, team_id, insert)
            written += len(team_rows)
        return written
