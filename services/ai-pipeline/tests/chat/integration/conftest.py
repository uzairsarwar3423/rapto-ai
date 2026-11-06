"""
Postgres-backed fixtures for the chat suites. Reuses the RAG integration database (a THROWAWAY pgvector server,
RAG_TEST_ADMIN_DSN) — never point it at a real database. Without the variable every test here is skipped.
"""

from __future__ import annotations

import asyncpg
import pytest_asyncio

from src.rag.db import RagDatabase, create_database
from src.services.chat.pg_chat_store import PgChatStore
from tests.rag.integration.conftest import (  # noqa: F401  (fixtures re-exported for pytest)
    admin, dsn_for, make_settings as rag_settings, rag_db, rag_dsns,
)

TEAM_A, TEAM_B = "teamA", "teamB"


@pytest_asyncio.fixture
async def seeded(rag_dsns, admin):   # noqa: F811
    """Two teams with NEAR-IDENTICAL data ('Ahmed will ship billing by Friday') so a leak is detectable."""
    await admin.execute(
        "TRUNCATE rag.chat_usage_ledger, public.commitments, public.action_items, public.meeting_participants, "
        "public.meetings, public.users")
    await admin.executemany(
        'INSERT INTO public.users (id, "teamId", name, "deletedAt") VALUES ($1,$2,$3,$4::text::timestamptz)',
        [("uA1", TEAM_A, "Ahmed Khan", None), ("uA2", TEAM_A, "Sara Malik", None), ("uAx", TEAM_A, "Gone Person", "2026-01-01"),
         ("uB1", TEAM_B, "Ahmed Khan", None)])
    await admin.executemany(
        'INSERT INTO public.meetings (id, "teamId", title, "scheduledAt", status) VALUES ($1,$2,$3,$4::text::timestamptz,$5)',
        [("mA1", TEAM_A, "Weekly Standup", "2026-11-02T05:00:00Z", "DONE"), ("mA2", TEAM_A, "Board 1:1", "2026-11-03T05:00:00Z", "DONE"),
         ("mA3", TEAM_A, "Cancelled sync", "2026-11-04T05:00:00Z", "CANCELLED"), ("mB1", TEAM_B, "Weekly Standup", "2026-11-02T05:00:00Z", "DONE")])
    await admin.executemany(
        'INSERT INTO public.meeting_participants (id, "meetingId", "userId", name) VALUES ($1,$2,$3,$4)',
        [("p1", "mA1", "uA1", "Ahmed"), ("p2", "mA1", "uA2", "Sara"), ("p3", "mA2", "uA2", "Sara"), ("p4", "mA2", None, "Guest"),
         ("p5", "mB1", "uB1", "Ahmed")])
    # due dates chosen around the Karachi midnight boundary (UTC+5): 2026-11-05T18:59Z = Nov 5 23:59 PKT, 19:01Z = Nov 6 00:01 PKT
    await admin.executemany(
        'INSERT INTO public.commitments (id, "teamId", "meetingId", "ownerId", "ownerNameRaw", text, status, "dueDate", "createdAt") '
        "VALUES ($1,$2,$3,$4,$5,$6,$7,$8::text::timestamptz,$9::text::timestamptz)",
        [("cA1", TEAM_A, "mA1", "uA1", "Ahmed", "Ahmed will ship billing by Friday", "PENDING", "2026-11-05T18:59:00Z", "2026-11-02T06:00:00Z"),
         ("cA2", TEAM_A, "mA1", "uA1", "Ahmed", "Ahmed will write the migration guide", "PENDING", "2026-11-05T19:01:00Z", "2026-11-02T06:01:00Z"),
         ("cA3", TEAM_A, "mA1", "uA2", "Sara", "Sara reviews the billing PR", "FULFILLED", "2026-11-03T10:00:00Z", "2026-11-02T06:02:00Z"),
         ("cA4", TEAM_A, "mA2", "uA2", "Sara", "Sara drafts the board memo", "DEFERRED", "2026-10-30T10:00:00Z", "2026-11-03T06:00:00Z"),
         ("cA5", TEAM_A, "mA2", None, "Nobody", "Cancelled idea", "CANCELLED", "2026-10-01T10:00:00Z", "2026-11-03T06:01:00Z"),
         ("cB1", TEAM_B, "mB1", "uB1", "Ahmed", "Ahmed will ship billing by Friday", "PENDING", "2026-10-01T10:00:00Z", "2026-11-02T06:00:00Z")])
    await admin.executemany(
        'INSERT INTO public.action_items (id, "teamId", "meetingId", "assigneeId", "assigneeNameRaw", text, completed, "dueDate") '
        "VALUES ($1,$2,$3,$4,$5,$6,$7,$8::text::timestamptz)",
        [("aA1", TEAM_A, "mA1", "uA1", "Ahmed", "Update the runbook", False, "2026-11-10T10:00:00Z"),
         ("aA2", TEAM_A, "mA1", "uA2", "Sara", "Book the offsite", True, None)])
    return {"A": TEAM_A, "B": TEAM_B}


@pytest_asyncio.fixture
async def pg_store(rag_db: RagDatabase, seeded) -> PgChatStore:   # noqa: F811
    return PgChatStore(rag_db)


@pytest_asyncio.fixture
async def app_conn(rag_dsns):   # noqa: F811
    """A raw connection as the RUNTIME role (vocaply_ai_app) — what an attacker with the service's credentials gets."""
    conn = await asyncpg.connect(rag_dsns["app"])
    yield conn
    await conn.close()
