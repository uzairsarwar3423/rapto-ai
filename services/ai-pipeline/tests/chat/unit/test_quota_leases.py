"""B3: quota reserve/commit/release, ledger outbox, stream leases — real Lua scripts via fakeredis+lupa."""

from __future__ import annotations

import asyncio
import datetime as dt
import uuid

import pytest

from src.services.chat.cost_accumulator import CostAccumulator
from src.services.chat.errors import QuotaExceededError, QuotaUnavailableError, SessionBusyError, TooManyStreamsError
from src.services.chat.quota_service import LedgerOutbox, MICRO, QuotaService
from src.services.chat.stream_leases import StreamLeaseManager, session_lease_key, user_lease_key
from tests.chat.conftest import make_settings

NOW = dt.datetime(2026, 11, 6, 14, 30, tzinfo=dt.timezone(dt.timedelta(hours=5)))     # Karachi wall clock


def cid() -> str:
    return str(uuid.uuid4())


async def reserve(q: QuotaService, user="u1", plan="PRO", cmid=None, team="t1"):
    return await q.reserve(team_id=team, user_id=user, plan=plan, client_message_id=cmid or cid(), now_local=NOW)


# ─── reserve ──────────────────────────────────────────────────────────────────


async def test_50_concurrent_reserves_admit_exactly_the_limit(redis):
    q = QuotaService(redis, make_settings(chat_daily_limit_pro=20, chat_monthly_usd_pro=1000.0))
    out = await asyncio.gather(*[reserve(q, user=f"u{i}") for i in range(50)], return_exceptions=True)
    ok = [r for r in out if not isinstance(r, Exception)]
    denied = [r for r in out if isinstance(r, QuotaExceededError)]
    assert len(ok) == 20 and len(denied) == 30                                      # no overshoot, none lost
    snap = await q.snapshot("t1", NOW.strftime("%Y%m%d"), NOW.strftime("%Y%m"))
    assert snap["reserved"] == 20 and snap["used"] == 0


async def test_dollar_ceiling_uses_worst_case_estimate(redis):
    s = make_settings(chat_daily_limit_pro=1000, chat_monthly_usd_pro=0.20)
    q = QuotaService(redis, s)
    est = q.estimate_reservation_usd("PRO")
    expected = int(0.20 / est)
    out = await asyncio.gather(*[reserve(q, user=f"u{i}") for i in range(expected + 6)], return_exceptions=True)
    assert sum(1 for r in out if not isinstance(r, Exception)) == expected
    errs = [r for r in out if isinstance(r, QuotaExceededError)]
    assert errs and errs[0].extra["limit"] == "monthly_budget"


async def test_same_client_message_id_is_one_reservation_and_one_charge(redis):
    q = QuotaService(redis, make_settings(chat_daily_limit_pro=5))
    mid = cid()
    a = await reserve(q, cmid=mid)
    b = await reserve(q, cmid=mid)
    assert not a.reused and b.reused
    snap = await q.snapshot("t1", a.day, a.month)
    assert snap["reserved"] == 1
    cost = CostAccumulator()
    cost.add("generate", provider="openai", model="m", input_tokens=1000, output_tokens=100, cost_usd=0.01)
    await q.commit(b, cost, counts_as_query=True)       # the retry (after a crashed first run) settles the shared reservation
    await q.commit(b, cost, counts_as_query=True)       # a second settle of the SAME object is a no-op (idempotent)
    snap = await q.snapshot("t1", a.day, a.month)
    assert snap["used"] == 1 and snap["reserved"] == 0  # exactly one charge


async def test_reservation_is_scoped_per_user_not_just_message_id(redis):
    q = QuotaService(redis, make_settings(chat_daily_limit_pro=10))
    mid = cid()
    a = await reserve(q, user="alice", cmid=mid)
    b = await reserve(q, user="bob", cmid=mid)                                      # same uuid, different user
    assert not b.reused
    snap = await q.snapshot("t1", a.day, a.month)
    assert snap["reserved"] == 2


async def test_daily_limit_message_carries_reset_time(redis):
    q = QuotaService(redis, make_settings(chat_daily_limit_pro=1))
    await reserve(q)
    with pytest.raises(QuotaExceededError) as ei:
        await reserve(q, user="u2")
    assert ei.value.http_status == 429 and ei.value.retry_after_s and ei.value.retry_after_s <= 86_400
    # Karachi 14:30 → ~9.5h until local midnight
    assert 9 * 3600 < ei.value.retry_after_s < 10 * 3600


async def test_teams_are_isolated(redis):
    q = QuotaService(redis, make_settings(chat_daily_limit_pro=1))
    await reserve(q, team="tA")
    await reserve(q, team="tB")                                                     # other team unaffected
    with pytest.raises(QuotaExceededError):
        await reserve(q, team="tA", user="other")


# ─── commit / release / reaper ────────────────────────────────────────────────


async def test_commit_converts_reservation_to_actual_usage(redis):
    q = QuotaService(redis, make_settings(chat_daily_limit_pro=5))
    r = await reserve(q)
    cost = CostAccumulator()
    cost.add("generate", provider="openai", model="m", input_tokens=9000, output_tokens=400, cost_usd=0.0265)
    rem = await q.commit(r, cost, counts_as_query=True)
    snap = await q.snapshot("t1", r.day, r.month)
    assert snap == {"used": 1, "reserved": 0, "used_u": int(0.0265 * MICRO), "reserved_u": 0}
    assert rem == 4


async def test_commit_without_counting_still_books_dollars(redis):                  # Q4: no_results / chitchat
    q = QuotaService(redis, make_settings(chat_daily_limit_pro=5))
    r = await reserve(q)
    cost = CostAccumulator()
    cost.add("retrieve", provider="openai", model="e", input_tokens=30, output_tokens=0, cost_usd=0.0001)
    await q.commit(r, cost, counts_as_query=False)
    snap = await q.snapshot("t1", r.day, r.month)
    assert snap["used"] == 0 and snap["used_u"] == 100 and snap["reserved"] == 0


async def test_release_refunds_fully_and_is_idempotent(redis):
    q = QuotaService(redis, make_settings(chat_daily_limit_pro=1))
    r = await reserve(q)
    await q.release(r)
    await q.release(r)
    snap = await q.snapshot("t1", r.day, r.month)
    assert snap["reserved"] == 0 and snap["reserved_u"] == 0 and snap["used"] == 0
    await reserve(q, user="u2")                                                     # capacity is back


async def test_settle_releases_when_nothing_spent_and_commits_when_something_was(redis):
    q = QuotaService(redis, make_settings(chat_daily_limit_pro=5))
    free = await reserve(q)
    await q.settle(free, CostAccumulator(), counts_as_query=False)
    assert (await q.snapshot("t1", free.day, free.month))["used_u"] == 0
    spent = await reserve(q, user="u2")
    acc = CostAccumulator()
    acc.add("rewrite", provider="openai", model="m", input_tokens=10, output_tokens=10, cost_usd=0.0002)
    await q.settle(spent, acc, counts_as_query=False)
    assert (await q.snapshot("t1", spent.day, spent.month))["used_u"] == 200


async def test_reaper_frees_a_crashed_pods_reservation(redis):
    q = QuotaService(redis, make_settings(chat_daily_limit_pro=2, chat_monthly_usd_pro=1000.0))
    a = await reserve(q, user="crashed")
    await reserve(q, user="alive")
    with pytest.raises(QuotaExceededError):
        await reserve(q, user="third")                                              # full: 2 reserved
    key = f"chat:{{t1}}:resq"
    member = (await redis.zrange(key, 0, -1))[0]
    await redis.zadd(key, {member: 1})                                              # pretend its TTL elapsed long ago
    ok = await reserve(q, user="third")                                             # inline reap frees the slot
    assert ok is not None
    snap = await q.snapshot("t1", a.day, a.month)
    assert snap["reserved"] == 2


async def test_commit_after_reservation_was_reaped_still_records_usage(redis):
    q = QuotaService(redis, make_settings(chat_daily_limit_pro=5))
    r = await reserve(q)
    await redis.delete(f"chat:{{t1}}:res:{r.member_id}")                            # reaped by TTL
    cost = CostAccumulator()
    cost.add("generate", provider="openai", model="m", input_tokens=1, output_tokens=1, cost_usd=0.01)
    await q.commit(r, cost, counts_as_query=True)
    snap = await q.snapshot("t1", r.day, r.month)
    assert snap["used"] == 1 and snap["used_u"] == 10_000


async def test_estimated_partial_cost_on_cancel_is_flagged(redis):
    acc = CostAccumulator()
    acc.add("generate", provider="openai", model="m", input_tokens=8000, output_tokens=120, cost_usd=0.021, estimated=True)
    assert acc.any_estimated


# ─── Redis outage policy (Q6) ─────────────────────────────────────────────────


class _Dead:
    async def eval(self, *a, **k):
        raise ConnectionError("down")


async def test_redis_down_free_plan_fails_closed_paid_fails_open_and_is_marked_unmetered():
    q = QuotaService(_Dead(), make_settings())
    with pytest.raises(QuotaUnavailableError):
        await reserve(q, plan="FREE")
    r = await reserve(q, plan="PRO")
    assert r.unmetered is True
    await q.commit(r, CostAccumulator(), counts_as_query=True)                      # no Redis call, no raise


async def test_fail_open_can_be_disabled():
    q = QuotaService(_Dead(), make_settings(chat_fail_open_paid_plans=False))
    with pytest.raises(QuotaUnavailableError):
        await reserve(q, plan="PRO")


# ─── ledger outbox ────────────────────────────────────────────────────────────


class _Store:
    def __init__(self):
        self.rows, self.fail = [], False

    async def write_ledger(self, rows):
        if self.fail:
            raise ConnectionError("pg down")
        self.rows.extend(rows)
        return len(rows)


async def test_outbox_survives_postgres_failure_and_dedupe_keys_are_unique(redis):
    store = _Store()
    ob = LedgerOutbox(redis, store)                                                 # type: ignore[arg-type]
    cost = CostAccumulator()
    cost.add("generate", provider="openai", model="m", input_tokens=10, output_tokens=5, cost_usd=0.001)
    cost.add("generate", provider="openai", model="m", input_tokens=10, output_tokens=5, cost_usd=0.001)   # retry attempt
    rows = ob.rows_for(request_id="rq1", team_id="t1", user_id="u1", cost=cost, counts_as_query=True,
                       category="chat", now=NOW)
    keys = [(r["request_id"], r["stage"]) for r in rows]
    assert len(keys) == len(set(keys)) == 3                                          # request, generate, generate#2
    await ob.enqueue(rows)
    store.fail = True
    assert await ob.flush() == 0
    assert await ob.depth() == 3                                                     # nothing lost
    store.fail = False
    assert await ob.flush() == 3 and len(store.rows) == 3 and await ob.depth() == 0


async def test_outbox_spills_to_memory_when_redis_is_down():
    class DeadList:
        async def rpush(self, *a): raise ConnectionError
        async def lpop(self, *a): raise ConnectionError
        async def llen(self, *a): raise ConnectionError
    store = _Store()
    ob = LedgerOutbox(DeadList(), store)                                             # type: ignore[arg-type]
    await ob.enqueue([{"request_id": "r", "stage": "request"}])
    assert await ob.depth() == 1
    assert await ob.flush() == 1 and store.rows


# ─── leases ───────────────────────────────────────────────────────────────────


def mgr(redis, **kw):
    return StreamLeaseManager(redis, make_settings(chat_max_streams_per_user=2, chat_global_max_streams=4,
                                                   chat_global_wait_ms=50, **kw))


async def test_third_stream_for_a_user_is_refused_and_release_frees_a_slot(redis):
    m = mgr(redis)
    a = await m.acquire(team_id="t", user_id="u", session_id="s1")
    b = await m.acquire(team_id="t", user_id="u", session_id="s2")
    with pytest.raises(TooManyStreamsError):
        await m.acquire(team_id="t", user_id="u", session_id="s3")
    await a.release()
    c = await m.acquire(team_id="t", user_id="u", session_id="s3")
    for lease in (b, c):
        await lease.release()
    assert m.active_streams == 0


async def test_same_session_second_request_gets_session_busy_and_nothing_leaks(redis):
    m = mgr(redis)
    a = await m.acquire(team_id="t", user_id="u", session_id="s1")
    with pytest.raises(SessionBusyError):
        await m.acquire(team_id="t", user_id="u", session_id="s1")
    assert await redis.zcard(user_lease_key("t", "u")) == 1                         # the refused attempt left no user lease
    assert m.active_streams == 1                                                    # … nor a pod slot
    await a.release()
    assert await redis.get(session_lease_key("t", "s1")) is None


async def test_release_is_idempotent(redis):
    m = mgr(redis)
    a = await m.acquire(team_id="t", user_id="u", session_id="s1")
    await a.release()
    await a.release()
    assert m.active_streams == 0 and await redis.zcard(user_lease_key("t", "u")) == 0


async def test_a_killed_holders_leases_expire(redis):
    m = mgr(redis)
    a = await m.acquire(team_id="t", user_id="u", session_id="s1")
    a2 = await m.acquire(team_id="t", user_id="u", session_id="s2")
    a._hb.cancel(); a2._hb.cancel()                                                 # the process "dies": no heartbeat, no release
    members = await redis.zrange(user_lease_key("t", "u"), 0, -1)
    for member in members:
        await redis.zadd(user_lease_key("t", "u"), {member: 1})                     # TTL elapsed
    await redis.pexpire(session_lease_key("t", "s1"), 1)
    await asyncio.sleep(0.01)
    b = await m.acquire(team_id="t", user_id="u", session_id="s1")                  # not blocked by the dead holder
    await b.release()


async def test_pod_semaphore_sheds_after_a_short_bounded_wait(redis):
    m = mgr(redis)                                                                   # global max = 4
    held = [await m.acquire(team_id="t", user_id=f"u{i}", session_id=None) for i in range(4)]
    with pytest.raises(TooManyStreamsError):
        await m.acquire(team_id="t", user_id="u9", session_id=None)
    for h in held:
        await h.release()


async def test_heartbeat_refreshes_the_lease(redis):
    m = StreamLeaseManager(redis, make_settings(chat_lease_ttl_s=5, chat_lease_refresh_s=0.05))
    a = await m.acquire(team_id="t", user_id="u", session_id="s1")
    before = (await redis.zrange(user_lease_key("t", "u"), 0, -1, withscores=True))[0][1]
    await asyncio.sleep(0.2)
    after = (await redis.zrange(user_lease_key("t", "u"), 0, -1, withscores=True))[0][1]
    assert after > before
    await a.release()


async def test_redis_down_degrades_to_local_leases():
    class Dead:
        async def eval(self, *a, **k): raise ConnectionError
        async def set(self, *a, **k): raise ConnectionError
        async def zrem(self, *a, **k): raise ConnectionError
    m = StreamLeaseManager(Dead(), make_settings(chat_max_streams_per_user=1, chat_global_max_streams=4))
    a = await m.acquire(team_id="t", user_id="u", session_id="s1")
    with pytest.raises(TooManyStreamsError):
        await m.acquire(team_id="t", user_id="u", session_id="s2")
    await a.release()
    b = await m.acquire(team_id="t", user_id="u", session_id="s2")
    await b.release()
