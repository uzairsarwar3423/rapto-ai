"""
Load/soak (in-process, fake models): many concurrent streams, event-loop health, leak counters, slow clients.
The real sizing run (CHAT_GLOBAL_MAX_STREAMS vs provider limits, BFF buffering) is `scripts/chat_smoke.py` on staging.
"""

from __future__ import annotations

import asyncio
import time
import uuid

import pytest

from src.services.chat.errors import TooManyStreamsError
from tests.chat.conftest import make_claims
from tests.chat.harness import make_harness, names
from tests.chat.helpers import FakeStreamer

pytestmark = pytest.mark.asyncio


async def test_60_concurrent_users_no_leaks_bounded_loop_lag_and_fast_first_event():
    h = await make_harness(
        streamer=FakeStreamer([f"w{i} " for i in range(40)], delay_s=0.005),
        settings_kw=dict(chat_global_max_streams=30, chat_global_wait_ms=2000, chat_rate_limit_per_min=600,
                         chat_team_rate_limit_per_min=6000, chat_daily_limit_pro=5000, chat_monthly_usd_pro=10_000.0))
    lag: list[float] = []
    stop = asyncio.Event()

    async def ticker() -> None:
        while not stop.is_set():
            t = time.monotonic()
            await asyncio.sleep(0.01)
            lag.append(time.monotonic() - t - 0.01)

    first_event: list[float] = []

    async def one(i: int):
        t0 = time.monotonic()
        claims = make_claims(team=f"team{i % 5}", user=f"user{i}")
        prepared = await h.prepare(claims, h.request())
        stream = h.stream_for(prepared)
        out = [f async for f in stream.body()]
        first_event.append(stream.first_event_ms or 0.0)
        return out

    tick = asyncio.create_task(ticker())
    results = await asyncio.gather(*[one(i) for i in range(60)], return_exceptions=True)
    stop.set()
    await tick
    ok = [r for r in results if not isinstance(r, Exception)]
    assert len(ok) == 60, [r for r in results if isinstance(r, Exception)][:3]
    assert all(b"event: done" in r[-1] for r in ok)
    assert h.leases.active_streams == 0                                              # no pod slot leaked
    for t in range(5):
        keys = [k.decode() for k in await h.redis.keys(f"chat:{{team{t}}}:lease:*")]
        for k in keys:
            if ":lease:u:" in k:
                assert await h.redis.zcard(k) == 0, k                                # no user lease leaked
    for t in range(5):
        snap = await h.quota.snapshot(f"team{t}", "20261106", "202611")
        assert snap["reserved"] == 0 and snap["reserved_u"] == 0
    assert sorted(first_event)[int(len(first_event) * 0.95) - 1] < 300             # time-to-first-event p95 < 300 ms
    assert max(lag) < 0.5, f"event loop stalled for {max(lag):.3f}s"


async def test_pod_cap_sheds_excess_streams_and_recovers_cleanly():
    h = await make_harness(streamer=FakeStreamer([f"w{i} " for i in range(60)], delay_s=0.02),
                           settings_kw=dict(chat_global_max_streams=4, chat_global_wait_ms=50, chat_max_streams_per_user=2,
                                            chat_rate_limit_per_min=600, chat_team_rate_limit_per_min=6000))

    async def one(i: int):
        prepared = await h.prepare(make_claims(user=f"user{i}"), h.request())
        return [f async for f in h.stream_for(prepared).body()]

    results = await asyncio.gather(*[one(i) for i in range(12)], return_exceptions=True)
    done = [r for r in results if not isinstance(r, Exception)]
    shed = [r for r in results if isinstance(r, TooManyStreamsError)]
    assert len(done) >= 4 and len(shed) >= 1 and len(done) + len(shed) == 12
    assert h.leases.active_streams == 0
    again = await one(99)                                                             # and the pod serves again
    assert b"event: done" in again[-1]


async def test_a_fleet_of_disconnecting_clients_leaks_nothing():
    h = await make_harness(streamer=FakeStreamer([f"w{i} " for i in range(500)], delay_s=0.005),
                           settings_kw=dict(chat_global_max_streams=40, chat_rate_limit_per_min=600, chat_team_rate_limit_per_min=6000,
                                            chat_daily_limit_pro=5000, chat_monthly_usd_pro=10_000.0))

    async def one(i: int):
        prepared = await h.prepare(make_claims(user=f"user{i}"), h.request())
        stream = h.stream_for(prepared, strict=False)
        got = 0

        async def consume():
            nonlocal got
            async for _ in stream.body():
                got += 1

        t = asyncio.create_task(consume())
        while got < 8:
            await asyncio.sleep(0.005)
        t.cancel()
        try:
            await t
        except asyncio.CancelledError:
            pass
        await asyncio.wait_for(stream.producer_task, 10)
        return prepared

    prepared = await asyncio.gather(*[one(i) for i in range(25)])
    assert h.leases.active_streams == 0 and all(p.ctx.cleanup.done for p in prepared)
    snap = await h.quota.snapshot("teamA", "20261106", "202611")
    assert snap["reserved"] == 0 and snap["reserved_u"] == 0 and snap["used"] == 25   # every partial answer was settled and billed once
    assert [f for f in await h.redis.keys("chat:{teamA}:lease:u:*") if await h.redis.zcard(f)] == []
