"""
services/chat/data_store.py
───────────────────────────
The Postgres-facing contract of the chat pipeline, as a Protocol, so every stage
is unit-testable with an in-memory fake and the real implementation
(pg_chat_store.py) is exercised by integration tests against pgvector.

Everything here reads the migration-004 VIEWS (column allow-lists + tenant
predicate). The runtime role has no grant on the core tables.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Optional, Protocol, Sequence

from src.models.rag_models import AccessScope


@dataclass(frozen=True)
class RosterEntry:
    user_id: str
    name: str


@dataclass(frozen=True)
class CommitmentFacts:
    """AUTHORITATIVE volatile fields, read at query time (ADR-5)."""
    id: str
    kind: str                       # "commitment" | "action_item"
    text: str
    status: str                     # commitment: PENDING/FULFILLED/...; action item: OPEN/COMPLETED
    owner_id: Optional[str]
    owner_name: Optional[str]
    due_date: Optional[datetime]
    meeting_id: Optional[str]


@dataclass(frozen=True)
class MeetingBrief:
    id: str
    title: str
    scheduled_at: datetime


class ChatDataStore(Protocol):
    async def known_meeting_ids(self, team_id: str, ids: Sequence[str], scope: AccessScope) -> set[str]: ...

    async def known_user_ids(self, team_id: str, ids: Sequence[str]) -> set[str]: ...

    async def roster(self, team_id: str) -> list[RosterEntry]: ...

    async def attended_meeting_ids(self, team_id: str, user_id: str, limit: int) -> list[str]: ...

    async def visible_meetings(self, team_id: str, meeting_ids: Sequence[str], scope: AccessScope) -> set[str]: ...

    async def commitments_by_ids(self, team_id: str, ids: Sequence[str], scope: AccessScope) -> dict[str, CommitmentFacts]: ...

    async def action_items_by_ids(self, team_id: str, ids: Sequence[str], scope: AccessScope) -> dict[str, CommitmentFacts]: ...

    async def run_analytics(self, team_id: str, sql: str, args: Sequence[Any], timeout_ms: int) -> list[dict[str, Any]]: ...

    async def recent_meetings(self, team_id: str, scope: AccessScope, limit: int) -> list[MeetingBrief]: ...

    async def overdue_commitment_count(self, team_id: str, today: date, tz: str, scope: AccessScope) -> int: ...

    async def sum_usage(self, team_id: str, day_start: datetime, month_start: datetime) -> tuple[int, float, float]:
        """(queries today, usd today, usd this month) from the ledger — used to rebuild Redis counters."""
        ...

    async def write_ledger(self, rows: Sequence[dict[str, Any]]) -> int: ...
