"""
B7/B12 against a REAL Postgres (RAG_TEST_ADMIN_DSN): migration 004, the analytics views, RLS-only isolation,
numeric golden tests (Karachi midnight boundary), ledger idempotency, and the pipeline end to end on the real store.
"""

from __future__ import annotations

import pathlib
from datetime import date, datetime, timezone

import asyncpg
import pytest
import pytz

from src.models.rag_models import AccessScope
from src.rag.errors import RagUnavailableError
from src.services.chat.analytics_tools import TOOLS, ToolContext, run_tool, validate_call
from src.services.chat.commitment_hydrator import hydrate
from src.services.chat.quota_service import LedgerOutbox
from tests.chat.conftest import FIXED_NOW, make_claims
from tests.chat.harness import make_harness, names, streamed_text
from tests.chat.helpers import make_chunk
from tests.chat.integration.conftest import TEAM_A, TEAM_B

pytestmark = pytest.mark.asyncio
KHI = pytz.timezone("Asia/Karachi")
MIG = pathlib.Path(__file__).resolve().parents[3] / "migrations"


def ctx_for(team: str, *, tz: str = "Asia/Karachi", today: date = date(2026, 11, 6), scope: AccessScope | None = None) -> ToolContext:
    return ToolContext(team_id=team, tz=tz, today=today, as_of=KHI.localize(datetime(2026, 11, 6, 14, 30)), scope=scope or AccessScope())


async def call(store, team, tool, params, **kw):
    spec, p = validate_call(tool, params)
    return await run_tool(store, spec, p, ctx_for(team, **kw), timeout_ms=3000)


# ─── golden numerics ──────────────────────────────────────────────────────────


async def test_overdue_boundary_at_karachi_midnight_differs_from_utc(pg_store):
    kar = await call(pg_store, TEAM_A, "count_commitments", {"status": "overdue"})
    utc = await call(pg_store, TEAM_A, "count_commitments", {"status": "overdue"}, tz="UTC")
    assert kar.rows[0]["n"] == 2          # cA1 (Nov 5 23:59 PKT) + cA4 (deferred, Oct 30); cA2 (Nov 6 00:01 PKT) is NOT yet overdue
    assert utc.rows[0]["n"] == 3          # in UTC both Nov 5 18:59Z and 19:01Z are Nov 5 → cA2 is overdue too
    assert "count: 2" in kar.text and "Asia/Karachi" in kar.text


@pytest.mark.parametrize("status,expected", [("open", 3), ("completed", 1), ("all", 5), ("overdue", 2)])
async def test_count_commitments_by_status(pg_store, status, expected):
    assert (await call(pg_store, TEAM_A, "count_commitments", {"status": status})).rows[0]["n"] == expected


async def test_count_with_owner_and_due_date_filters(pg_store):
    r = await call(pg_store, TEAM_A, "count_commitments", {"status": "all", "owner_ids": ["uA1"]})
    assert r.rows[0]["n"] == 2
    r = await call(pg_store, TEAM_A, "count_commitments", {"status": "all", "date_from": "2026-11-01", "date_to": "2026-11-05"})
    assert r.rows[0]["n"] == 2            # due Nov 5 23:59 PKT and Nov 3 (Karachi calendar dates), not Nov 6 00:01 PKT


async def test_list_overdue_orders_oldest_first_and_respects_limit(pg_store):
    r = await call(pg_store, TEAM_A, "list_overdue_commitments", {"limit": 10})
    assert [x["id"] for x in r.rows] == ["cA4", "cA1"] and "owner: Sara Malik" in r.text and "owner: Ahmed Khan" in r.text
    assert len((await call(pg_store, TEAM_A, "list_overdue_commitments", {"limit": 1})).rows) == 1


async def test_completion_rate_excludes_cancelled(pg_store):
    r = await call(pg_store, TEAM_A, "commitment_completion_rate", {})
    assert (r.rows[0]["completed"], r.rows[0]["total"]) == (1, 4) and "25.0%" in r.text
    empty = await call(pg_store, TEAM_A, "commitment_completion_rate", {"date_from": "2030-01-01"})
    assert "n/a" in empty.text


async def test_top_owners_and_meeting_count_and_find(pg_store):
    top = await call(pg_store, TEAM_A, "top_owners_by_open_commitments", {"limit": 5})
    assert [(r["owner_name"], r["open_count"]) for r in top.rows] == [("Ahmed Khan", 2), ("Sara Malik", 1)]
    assert (await call(pg_store, TEAM_A, "meeting_count", {})).rows[0]["n"] == 2          # the CANCELLED meeting is excluded
    assert (await call(pg_store, TEAM_A, "meeting_count", {"date_from": "2026-11-02", "date_to": "2026-11-02"})).rows[0]["n"] == 1
    found = await call(pg_store, TEAM_A, "find_commitments", {"owner_ids": ["uA1"], "text": "billing"})
    assert [r["id"] for r in found.rows] == ["cA1"]
    assert (await call(pg_store, TEAM_A, "find_commitments", {"text": "100%"})).rows == []   # LIKE wildcards are escaped


async def test_zero_is_a_valid_citable_answer(pg_store):
    r = await call(pg_store, TEAM_A, "count_commitments", {"status": "open", "owner_ids": ["nobody"]})
    assert r.rows[0]["n"] == 0 and "count: 0" in r.text


async def test_attendee_scope_changes_the_numbers(pg_store):
    scope = AccessScope(kind="meetings", meeting_ids=["mA2"])
    assert (await call(pg_store, TEAM_A, "count_commitments", {"status": "all"}, scope=scope)).rows[0]["n"] == 2     # cA4, cA5
    assert (await call(pg_store, TEAM_A, "meeting_count", {}, scope=scope)).rows[0]["n"] == 1


# ─── isolation: the RLS-only run ──────────────────────────────────────────────


async def test_team_b_never_sees_team_a_through_any_store_method(pg_store):
    assert await pg_store.commitments_by_ids(TEAM_B, ["cA1", "cA2"], AccessScope()) == {}
    assert await pg_store.action_items_by_ids(TEAM_B, ["aA1"], AccessScope()) == {}
    assert await pg_store.known_meeting_ids(TEAM_B, ["mA1", "mB1"], AccessScope()) == {"mB1"}
    assert await pg_store.known_user_ids(TEAM_B, ["uA1", "uB1"]) == {"uB1"}
    assert [r.user_id for r in await pg_store.roster(TEAM_B)] == ["uB1"]
    assert [m.id for m in await pg_store.recent_meetings(TEAM_B, AccessScope(), 10)] == ["mB1"]
    assert (await call(pg_store, TEAM_B, "count_commitments", {"status": "all"})).rows[0]["n"] == 1


async def test_views_return_zero_rows_without_a_tenant_and_ignore_a_hostile_predicate(app_conn):
    for view in ("v_chat_commitments", "v_chat_action_items", "v_chat_meetings", "v_chat_members", "v_chat_meeting_access"):
        assert await app_conn.fetchval(f"SELECT count(*) FROM rag.{view}") == 0, view          # fail closed
    async with app_conn.transaction():
        await app_conn.execute("SELECT set_config('app.current_team_id', 'teamB', true)")
        # the application filter is "bypassed" (here: pointed at the OTHER team, or removed entirely): RLS-style view predicate wins
        assert await app_conn.fetchval("SELECT count(*) FROM rag.v_chat_commitments WHERE team_id = 'teamA'") == 0
        assert await app_conn.fetchval("SELECT count(*) FROM rag.v_chat_commitments") == 1
        assert await app_conn.fetchval("SELECT count(*) FROM rag.v_chat_commitments WHERE true OR team_id = 'teamA'") == 1


async def test_the_runtime_role_cannot_read_base_tables_or_use_views_it_was_not_granted(app_conn):
    for table in ("public.commitments", "public.action_items", "public.meetings", "public.users", "public.meeting_participants"):
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            await app_conn.fetchval(f"SELECT count(*) FROM {table}")
    row = await app_conn.fetchrow("SELECT c.reloptions FROM pg_class c WHERE c.oid = 'rag.v_chat_commitments'::regclass")
    assert "security_barrier=true" in row["reloptions"]


async def test_view_column_allow_list_exposes_no_pii_columns(app_conn):
    cols = {r["column_name"] for r in await app_conn.fetch(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='rag' AND table_name LIKE 'v_chat_%'")}
    assert not ({"email", "meetingUrl", "password", "recallBotId", "mongoTranscriptId"} & cols)


async def test_deleted_users_do_not_appear(pg_store):
    assert "Gone Person" not in [r.name for r in await pg_store.roster(TEAM_A)]


# ─── ledger ───────────────────────────────────────────────────────────────────


def rows(team=TEAM_A, request_id="rq-1"):
    base = dict(team_id=team, user_id="uA1", provider="openai", model="m", input_tokens=10, output_tokens=5, estimated=False,
                category="chat", counts_as_query=False, created_at=FIXED_NOW.isoformat())
    return [dict(base, request_id=request_id, stage="request", cost_usd=0.0, counts_as_query=True),
            dict(base, request_id=request_id, stage="generate", cost_usd=0.0123),
            dict(base, request_id=request_id, stage="embed", cost_usd=0.000001)]


async def test_ledger_flush_is_idempotent_and_sums_for_quota_rebuild(pg_store, admin):
    await pg_store.write_ledger(rows())
    await pg_store.write_ledger(rows())                                   # a retried outbox flush must not double count
    assert await admin.fetchval("SELECT count(*) FROM rag.chat_usage_ledger") == 3
    q, usd_day, usd_month = await pg_store.sum_usage(TEAM_A, datetime(2026, 11, 6, tzinfo=timezone.utc), datetime(2026, 11, 1, tzinfo=timezone.utc))
    assert q == 1 and usd_day == pytest.approx(0.012301) and usd_month == pytest.approx(0.012301)
    assert await pg_store.sum_usage(TEAM_B, datetime(2026, 11, 6, tzinfo=timezone.utc), datetime(2026, 11, 1, tzinfo=timezone.utc)) == (0, 0.0, 0.0)


async def test_ledger_is_append_only_and_tenant_checked_for_the_runtime_role(pg_store, app_conn):
    await pg_store.write_ledger(rows())
    async with app_conn.transaction():
        await app_conn.execute("SELECT set_config('app.current_team_id', 'teamA', true)")
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            await app_conn.execute("UPDATE rag.chat_usage_ledger SET cost_usd = 0")
    async with app_conn.transaction():
        await app_conn.execute("SELECT set_config('app.current_team_id', 'teamA', true)")
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            await app_conn.execute("DELETE FROM rag.chat_usage_ledger")
    with pytest.raises(asyncpg.PostgresError):                              # a row for ANOTHER team than the tenant is refused (RLS WITH CHECK)
        async with app_conn.transaction():
            await app_conn.execute("SELECT set_config('app.current_team_id', 'teamA', true)")
            await app_conn.execute(
                "INSERT INTO rag.chat_usage_ledger (request_id, team_id, stage, provider, model) VALUES ('x','teamB','request','p','m')")


async def test_outbox_to_real_ledger_end_to_end(pg_store, admin, redis):
    ob = LedgerOutbox(redis, pg_store)
    await ob.enqueue(rows(request_id="rq-outbox"))
    assert await ob.flush() == 3
    assert await admin.fetchval("SELECT count(*) FROM rag.chat_usage_ledger WHERE request_id = 'rq-outbox'") == 3


# ─── guards ───────────────────────────────────────────────────────────────────


async def test_run_analytics_refuses_anything_but_the_views(pg_store):
    for sql in ("SELECT 1", "SELECT * FROM public.commitments", "SELECT * FROM rag.v_chat_meetings, public.users"):
        with pytest.raises(PermissionError):
            await pg_store.run_analytics(TEAM_A, sql, [], 1000)


async def test_statement_timeout_is_enforced_for_analytics(pg_store):
    with pytest.raises(RagUnavailableError):
        await pg_store.run_analytics(TEAM_A, "SELECT pg_sleep(3) FROM rag.v_chat_meetings LIMIT 1", [], 150)


# ─── hydration against live data ──────────────────────────────────────────────


async def test_hydration_reflects_a_status_change_made_after_embedding_and_drops_deleted(pg_store, admin):
    chunks = [make_chunk("Ahmed will ship billing", source_type="commitment", source_id="cA1"),
              make_chunk("gone", source_type="commitment", source_id="cA-deleted"),
              make_chunk("Update the runbook", source_type="action_item", source_id="aA1")]
    before = await hydrate(pg_store, TEAM_A, AccessScope(), chunks, timeout_s=2)
    assert before.facts[("commitment", "cA1")].status == "PENDING" and ("commitment", "cA-deleted") in before.dropped
    assert before.facts[("action_item", "aA1")].status == "OPEN"
    await admin.execute("UPDATE public.commitments SET status = 'FULFILLED' WHERE id = 'cA1'")       # no re-embedding happens
    await admin.execute("UPDATE public.action_items SET completed = true WHERE id = 'aA1'")
    after = await hydrate(pg_store, TEAM_A, AccessScope(), chunks, timeout_s=2)
    assert after.facts[("commitment", "cA1")].status == "FULFILLED" and after.facts[("action_item", "aA1")].status == "COMPLETED"
    assert after.facts[("commitment", "cA1")].owner_name == "Ahmed Khan"


async def test_access_scope_queries(pg_store):
    assert sorted(await pg_store.attended_meeting_ids(TEAM_A, "uA2", 100)) == ["mA1", "mA2"]
    assert await pg_store.attended_meeting_ids(TEAM_A, "uA1", 100) == ["mA1"]
    assert await pg_store.attended_meeting_ids(TEAM_B, "uA1", 100) == []
    scope = AccessScope(kind="meetings", meeting_ids=["mA1"])
    assert await pg_store.known_meeting_ids(TEAM_A, ["mA1", "mA2"], scope) == {"mA1"}
    assert set(await pg_store.commitments_by_ids(TEAM_A, ["cA1", "cA4"], scope)) == {"cA1"}          # cA4 is in the private meeting


# ─── migration round trip ─────────────────────────────────────────────────────


async def test_004_down_then_up_roundtrip_restores_grants(rag_dsns):
    conn = await asyncpg.connect(rag_dsns["admin"])
    try:
        tx = conn.transaction()
        await tx.start()
        await conn.execute("SET LOCAL search_path = rag, extensions, public")
        await conn.execute((MIG / "004_chat_support.down.sql").read_text(encoding="utf-8"))
        assert await conn.fetchval("SELECT to_regclass('rag.v_chat_commitments')") is None
        assert await conn.fetchval("SELECT to_regclass('rag.chat_usage_ledger')") is None
        await conn.execute((MIG / "004_chat_support.up.sql").read_text(encoding="utf-8"))
        assert await conn.fetchval("SELECT has_table_privilege('vocaply_ai_app', 'rag.v_chat_commitments', 'SELECT')")
        assert not await conn.fetchval("SELECT has_table_privilege('vocaply_ai_app', 'public.commitments', 'SELECT')")
        assert await conn.fetchval("SELECT relforcerowsecurity FROM pg_class WHERE oid = 'rag.chat_usage_ledger'::regclass")
        await tx.rollback()
    finally:
        await conn.close()


async def test_004_preflight_fails_loudly_when_prisma_tables_are_missing(rag_dsns):
    conn = await asyncpg.connect(rag_dsns["admin"])
    try:
        tx = conn.transaction()
        await tx.start()
        await conn.execute("SET LOCAL search_path = rag, extensions, public")
        await conn.execute((MIG / "004_chat_support.down.sql").read_text(encoding="utf-8"))
        await conn.execute("ALTER TABLE public.meeting_participants RENAME TO meeting_participants_x")
        with pytest.raises(asyncpg.RaiseError, match="Prisma migrations"):
            await conn.execute((MIG / "004_chat_support.up.sql").read_text(encoding="utf-8"))
        await tx.rollback()
    finally:
        await conn.close()


# ─── the pipeline on the real store ───────────────────────────────────────────


async def test_pipeline_end_to_end_on_real_postgres(pg_store, admin):
    h = await make_harness(store=pg_store, deltas=["You have 2 overdue commitments [S1]."])
    frames, prepared = await h.query("how many overdue commitments do we have?")
    assert h.retriever.calls == [] and frames[-1].data["finish_reason"] == "stop"
    assert "count: 2" in h.streamer.last_user and "Asia/Karachi" in h.streamer.last_user
    await h.outbox.flush()
    ledger = await admin.fetch("SELECT stage, counts_as_query FROM rag.chat_usage_ledger WHERE request_id = $1", prepared.ctx.request_id)
    assert {r["stage"] for r in ledger} >= {"request", "generate"}
    assert [r["counts_as_query"] for r in ledger if r["stage"] == "request"] == [True]
    frames2, _ = await h.query("how many open commitments does Ahmed have?")
    assert "count: 2" in h.streamer.last_user                                    # Ahmed Khan resolved from the REAL roster (uA1: cA1, cA2)
    frames3, _ = await h.query("how many open commitments does Zelda have?")     # unknown person: NOT answered for the whole team
    assert "No team member matched" in h.streamer.last_user and "count: 3" not in h.streamer.last_user
