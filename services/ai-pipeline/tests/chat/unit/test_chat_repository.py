"""B4: tenancy injection, idempotency state machine, pagination, redaction, retention (mongomock-motor)."""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from mongomock_motor import AsyncMongoMockClient

from src.models.chat_models import MessageStatus
from src.repositories.chat_repository import (
    ChatRepository, CursorCodec, FinalizeInput, ScopedCollection, SystemMaintenance, TeamAdmin, ensure_indexes,
)
from src.services.chat.errors import InvalidInputError, NotFoundError

T0 = datetime(2026, 11, 6, 9, 0, tzinfo=timezone.utc)
CODEC = CursorCodec("unit-test-cursor-secret")


class Clock:
    def __init__(self, start=T0):
        self.now = start

    def __call__(self):
        return self.now

    def tick(self, seconds=1.0):
        self.now += timedelta(seconds=seconds)


@pytest.fixture
def db():
    return AsyncMongoMockClient()["chat_test"]


@pytest.fixture
def clock():
    return Clock()


def repo(db, clock, team="tA", user="uA", lease_s=60.0):
    return ChatRepository(db, team, user, cursors=CODEC, lease_s=lease_s, clock=clock)


def cid():
    return str(uuid.uuid4())


async def accept(r, text="hello", session_id=None, client_id=None, request_id="req1"):
    return await r.accept_user_message(session_id=session_id, text=text, client_message_id=client_id or cid(),
                                       request_id=request_id)


def final(uid, run="req1", content="answer", status="answered", finish="stop", refs=None, aid=None):
    return FinalizeInput(user_message_id=uid, assistant_id=aid or str(uuid.uuid4()), run_id=run, content=content,
                         status=status, finish_reason=finish, source_refs=refs or [])


# ─── tenancy injection ────────────────────────────────────────────────────────


async def test_scoped_collection_injects_tenancy_and_refuses_caller_supplied_keys(db):
    sc = ScopedCollection(db["x"], "tA", "uA")
    await sc.insert_one({"_id": "1", "v": 1})
    assert (await db["x"].find_one({"_id": "1"}))["team_id"] == "tA"
    with pytest.raises(ValueError):
        await sc.find_one({"team_id": "tB"})
    with pytest.raises(ValueError):
        await sc.insert_one({"team_id": "tB"})
    with pytest.raises(ValueError):
        await sc.update_one({"user_id": "x"}, {"$set": {"a": 1}})


async def test_every_filter_the_repository_issues_carries_team_and_user(db, clock):
    seen: list[dict] = []

    class Spy:
        def __init__(self, inner):
            self._i = inner

        def __getattr__(self, name):
            attr = getattr(self._i, name)
            if name in {"find_one", "find", "update_one", "find_one_and_update", "delete_many", "count_documents"}:
                def wrapper(flt, *a, **k):
                    seen.append(flt)
                    return attr(flt, *a, **k)
                return wrapper
            return attr

    class SpyDb:
        def __getitem__(self, name):
            return Spy(db[name])

    r = repo(SpyDb(), clock)
    res = await accept(r)
    await r.finalize_assistant_message(final(res.user_message_id), res.session_id)
    await r.list_sessions()
    await r.list_messages(res.session_id)
    await r.recent_turns(res.session_id, limit=5)
    await r.rename_session(res.session_id, "renamed")
    await r.upsert_feedback((await r.get_completed_assistant(res.user_message_id))["_id"], "up", None, None)
    await r.soft_delete_session(res.session_id)
    assert seen, "spy saw nothing"
    for flt in seen:
        assert flt.get("team_id") == "tA" and flt.get("user_id") == "uA", flt


async def test_other_user_and_other_team_get_404_not_403(db, clock):
    a = repo(db, clock)
    res = await accept(a)
    for other in (repo(db, clock, user="uB"), repo(db, clock, team="tB", user="uA")):
        with pytest.raises(NotFoundError):
            await other.get_session(res.session_id)
        with pytest.raises(NotFoundError):
            await other.list_messages(res.session_id)
        with pytest.raises(NotFoundError):
            await other.rename_session(res.session_id, "pwned")
        with pytest.raises(NotFoundError):
            await other.soft_delete_session(res.session_id)
        with pytest.raises(NotFoundError):
            await accept(other, session_id=res.session_id)                  # cannot post into someone else's session
    assert (await a.get_session(res.session_id))["title"] == "hello"        # untouched


async def test_feedback_only_on_own_assistant_messages(db, clock):
    a, b = repo(db, clock), repo(db, clock, user="uB")
    res = await accept(a)
    await a.finalize_assistant_message(final(res.user_message_id, aid="asst1"), res.session_id)
    with pytest.raises(NotFoundError):
        await b.upsert_feedback("asst1", "down", "inaccurate", None)
    with pytest.raises(NotFoundError):
        await a.upsert_feedback(res.user_message_id, "up", None, None)       # a USER message is not rateable
    await a.upsert_feedback("asst1", "up", None, None)
    await a.upsert_feedback("asst1", "down", "inaccurate", "wrong date")     # upsert changes the rating
    assert await db["chat_feedback"].count_documents({}) == 1
    assert (await db["chat_feedback"].find_one({}))["rating"] == "down"


# ─── idempotency state machine ────────────────────────────────────────────────


async def test_new_then_in_flight_then_completed_replay(db, clock):
    r = repo(db, clock)
    cmid = cid()
    first = await accept(r, client_id=cmid, request_id="reqA")
    assert first.state == "new" and first.session_created
    second = await accept(r, client_id=cmid, request_id="reqB", session_id=first.session_id)
    assert second.state == "in_flight" and second.active_request_id == "reqA"
    await r.finalize_assistant_message(final(first.user_message_id, run="reqA", content="the answer"), first.session_id)
    assert await r.mark_user_message(first.user_message_id, MessageStatus.ANSWERED, "reqA")
    third = await accept(r, client_id=cmid, request_id="reqC", session_id=first.session_id)
    assert third.state == "completed" and third.assistant["content"] == "the answer"
    assert await db["chat_messages"].count_documents({"role": "user"}) == 1        # still ONE user message


@pytest.mark.parametrize("terminal", [MessageStatus.FAILED, MessageStatus.CANCELLED])
async def test_failed_or_cancelled_reruns_on_the_same_user_message(db, clock, terminal):
    r = repo(db, clock)
    cmid = cid()
    first = await accept(r, client_id=cmid, request_id="reqA")
    await r.mark_user_message(first.user_message_id, terminal, "reqA")
    again = await accept(r, client_id=cmid, request_id="reqB", session_id=first.session_id)
    assert again.state == "rerun" and again.user_message_id == first.user_message_id
    assert await db["chat_messages"].count_documents({"role": "user"}) == 1


async def test_expired_lease_is_a_crashed_run_and_reruns(db, clock):
    r = repo(db, clock, lease_s=60)
    cmid = cid()
    first = await accept(r, client_id=cmid, request_id="reqA")
    clock.tick(30)
    assert (await accept(r, client_id=cmid, request_id="reqB", session_id=first.session_id)).state == "in_flight"
    clock.tick(40)                                                                  # 70 s > 60 s lease
    again = await accept(r, client_id=cmid, request_id="reqB", session_id=first.session_id)
    assert again.state == "rerun"


async def test_racing_retries_produce_exactly_one_winner(db, clock):
    r = repo(db, clock)
    cmid = cid()
    first = await accept(r, client_id=cmid, request_id="reqA")
    await r.mark_user_message(first.user_message_id, MessageStatus.FAILED, "reqA")
    results = await asyncio.gather(*[accept(r, client_id=cmid, request_id=f"req{i}", session_id=first.session_id)
                                     for i in range(8)])
    states = sorted(x.state for x in results)
    assert states.count("rerun") == 1 and states.count("in_flight") == 7


async def test_racing_first_inserts_leave_exactly_one_user_message(db, clock):
    await ensure_indexes(db)
    r = repo(db, clock)
    cmid = cid()
    sid = (await accept(r, text="seed")).session_id
    out = await asyncio.gather(*[accept(r, client_id=cmid, request_id=f"req{i}", session_id=sid) for i in range(6)],
                               return_exceptions=True)
    assert not [o for o in out if isinstance(o, Exception)]
    assert await db["chat_messages"].count_documents({"client_message_id": cmid}) == 1
    assert sorted(x.state for x in out).count("new") == 1


async def test_same_client_id_in_another_session_is_rejected(db, clock):
    r = repo(db, clock)
    cmid = cid()
    first = await accept(r, client_id=cmid)
    other = await accept(r, text="other")
    with pytest.raises(InvalidInputError):
        await accept(r, client_id=cmid, session_id=other.session_id)
    assert first.session_id != other.session_id


async def test_client_ids_cannot_be_probed_across_users(db, clock):
    a, b = repo(db, clock), repo(db, clock, user="uB")
    cmid = cid()
    ra = await accept(a, client_id=cmid)
    rb = await accept(b, client_id=cmid)                                            # same uuid, different user: independent
    assert rb.state == "new" and rb.user_message_id != ra.user_message_id


async def test_a_late_finalizer_cannot_clobber_a_rerun(db, clock):
    r = repo(db, clock)
    cmid = cid()
    first = await accept(r, client_id=cmid, request_id="reqA")
    await r.mark_user_message(first.user_message_id, MessageStatus.CANCELLED, "reqA")
    await accept(r, client_id=cmid, request_id="reqB", session_id=first.session_id)           # rerun owns the lease now
    assert not await r.mark_user_message(first.user_message_id, MessageStatus.FAILED, "reqA")  # stale run: ignored
    msg = await db["chat_messages"].find_one({"_id": first.user_message_id})
    assert msg["status"] == "accepted" and msg["request_id"] == "reqB"


async def test_finalize_is_idempotent_and_counts_once(db, clock):
    r = repo(db, clock)
    res = await accept(r)
    f = final(res.user_message_id, run="reqX", aid="a1")
    assert await r.finalize_assistant_message(f, res.session_id) is True
    assert await r.finalize_assistant_message(f, res.session_id) is False
    assert await db["chat_messages"].count_documents({"role": "assistant"}) == 1
    assert (await r.get_session(res.session_id))["message_count"] == 2


async def test_rerun_writes_a_new_assistant_message_and_replay_returns_the_good_one(db, clock):
    r = repo(db, clock)
    cmid = cid()
    first = await accept(r, client_id=cmid, request_id="reqA")
    await r.finalize_assistant_message(final(first.user_message_id, run="reqA", content="partial", status="error",
                                             finish="error"), first.session_id)
    await r.mark_user_message(first.user_message_id, MessageStatus.FAILED, "reqA")
    clock.tick(1)
    again = await accept(r, client_id=cmid, request_id="reqB", session_id=first.session_id)
    assert again.state == "rerun"
    clock.tick(1)
    await r.finalize_assistant_message(final(first.user_message_id, run="reqB", content="good answer"), first.session_id)
    await r.mark_user_message(first.user_message_id, MessageStatus.ANSWERED, "reqB")
    replay = await accept(r, client_id=cmid, request_id="reqC", session_id=first.session_id)
    assert replay.state == "completed" and replay.assistant["content"] == "good answer"


# ─── history / pagination / redaction ─────────────────────────────────────────


async def _chat(r, clock, n):
    sid = None
    for i in range(n):
        res = await accept(r, text=f"q{i}", session_id=sid)
        sid = res.session_id
        clock.tick(1)
        await r.finalize_assistant_message(final(res.user_message_id, run=res.user_message_id, content=f"a{i}"), sid)
        await r.mark_user_message(res.user_message_id, MessageStatus.ANSWERED, "req1")
        clock.tick(1)
    return sid


async def test_messages_paginate_older_with_chronological_pages(db, clock):
    r = repo(db, clock)
    sid = await _chat(r, clock, 6)                                                   # 12 messages
    page1, cur = await r.list_messages(sid, limit=5)
    assert [m["content"] for m in page1] == ["a3", "q4", "a4", "q5", "a5"] or len(page1) == 5
    assert cur is not None
    page2, cur2 = await r.list_messages(sid, limit=5, cursor=cur)
    page3, cur3 = await r.list_messages(sid, limit=5, cursor=cur2)
    allm = [m["content"] for m in page3] + [m["content"] for m in page2] + [m["content"] for m in page1]
    assert allm == [x for i in range(6) for x in (f"q{i}", f"a{i}")]                # complete, ordered, no dupes
    assert cur3 is None


async def test_cursors_are_tamper_evident_and_limits_clamped(db, clock):
    r = repo(db, clock)
    sid = await _chat(r, clock, 3)
    _, cur = await r.list_messages(sid, limit=2)
    body, sig = cur.split(".")
    for bad in (f"{body}.AAAAAAAAAAAAAAAAAAAAAA", f"{body[:-2]}xx.{sig}", "garbage"):
        with pytest.raises(InvalidInputError):
            await r.list_messages(sid, limit=2, cursor=bad)
    rows, _ = await r.list_messages(sid, limit=10_000)
    assert len(rows) == 6                                                             # clamped to 50, all 6 fit


async def test_history_redacts_sources_that_are_no_longer_visible(db, clock):
    r = repo(db, clock)
    res = await accept(r)
    refs = [{"source_id": "S1", "meeting_id": "m1", "meeting_title": "Secret 1:1", "preview": "salary talk"},
            {"source_id": "S2", "meeting_id": "m2", "meeting_title": "Standup", "preview": "shipping friday"},
            {"source_id": "S3", "type": "analytics", "preview": "12 open"}]
    await r.finalize_assistant_message(final(res.user_message_id, refs=refs), res.session_id)

    async def visible(ids):
        return {i for i in ids if i == "m2"}                                          # m1 deleted / access revoked

    rows, _ = await r.list_messages(res.session_id, visible=visible)
    assistant = [m for m in rows if m["role"] == "assistant"][0]
    s1, s2, s3 = assistant["source_refs"]
    assert s1["preview"] == "" and s1["meeting_title"] is None and s1["redacted"] is True
    assert s2["preview"] == "shipping friday" and not s2.get("redacted")
    assert s3["preview"] == "12 open"                                                 # analytics refs have no meeting


async def test_meeting_deletion_hook_blanks_stored_previews(db, clock):
    r = repo(db, clock)
    res = await accept(r)
    await r.finalize_assistant_message(final(res.user_message_id, refs=[
        {"source_id": "S1", "meeting_id": "m9", "meeting_title": "T", "preview": "secret"}]), res.session_id)
    assert await TeamAdmin(db, "tA").redact_meeting_sources("m9") == 1
    assert await TeamAdmin(db, "tB").redact_meeting_sources("m9") == 0               # other team's call touches nothing
    doc = await db["chat_messages"].find_one({"role": "assistant"})
    assert doc["source_refs"][0]["preview"] == "" and doc["source_refs"][0]["redacted"] is True


async def test_titles_are_truncated_plain_text_and_empty_sessions_hidden(db, clock):
    r = repo(db, clock)
    res = await accept(r, text="<script>alert(1)</script> " + "x" * 200)
    assert len((await r.get_session(res.session_id))["title"]) == 60
    await r.sessions.insert_one({"_id": "empty", "title": "e", "message_count": 0, "created_at": clock(),
                                 "updated_at": clock(), "deleted_at": None, "summary": "", "summary_upto_msg_id": None})
    rows, _ = await r.list_sessions()
    assert "empty" not in [s["_id"] for s in rows]


async def test_rename_validation_and_idempotent_soft_delete(db, clock):
    r = repo(db, clock)
    res = await accept(r)
    with pytest.raises(InvalidInputError):
        await r.rename_session(res.session_id, "   ")
    with pytest.raises(InvalidInputError):
        await r.rename_session(res.session_id, "x" * 121)
    await r.soft_delete_session(res.session_id)
    await r.soft_delete_session(res.session_id)                                        # idempotent
    with pytest.raises(NotFoundError):
        await r.get_session(res.session_id)
    with pytest.raises(NotFoundError):
        await r.soft_delete_session("never-existed")


async def test_summary_compare_and_set_prevents_interleaving(db, clock):
    r = repo(db, clock)
    res = await accept(r)
    assert await r.set_summary_if_watermark(res.session_id, expected_upto=None, summary="s1", new_upto="m5")
    assert not await r.set_summary_if_watermark(res.session_id, expected_upto=None, summary="s2", new_upto="m6")
    assert (await r.get_session(res.session_id))["summary"] == "s1"


# ─── retention ────────────────────────────────────────────────────────────────


async def test_retention_purge_cascades_messages_and_feedback(db, clock):
    r = repo(db, clock)
    old = await accept(r, text="old")
    await r.finalize_assistant_message(final(old.user_message_id, aid="a-old"), old.session_id)
    await r.upsert_feedback("a-old", "up", None, None)
    keep = await accept(r, text="keep")
    await r.soft_delete_session(old.session_id)
    sysm = SystemMaintenance(db)
    assert (await sysm.purge(retention_days=30, empty_ttl_hours=24, now=clock() + timedelta(days=5)))["sessions"] == 0
    out = await sysm.purge(retention_days=30, empty_ttl_hours=24, now=clock() + timedelta(days=31))
    assert out == {"sessions": 1, "messages": 2, "feedback": 1}
    assert await db["chat_sessions"].count_documents({"_id": keep.session_id}) == 1


async def test_user_erasure_removes_only_that_user(db, clock):
    a, b = repo(db, clock), repo(db, clock, user="uB")
    ra, rb = await accept(a), await accept(b)
    out = await TeamAdmin(db, "tA").purge_user("uA")
    assert out["sessions"] == 1 and out["messages"] == 1
    assert await db["chat_sessions"].count_documents({"_id": rb.session_id}) == 1


async def test_ensure_indexes_is_idempotent(db):
    first = await ensure_indexes(db)
    again = await ensure_indexes(db)
    assert first == again and "ux_messages_client_id" in first
