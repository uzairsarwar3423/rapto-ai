"""B5: framing, ordering, heartbeat, backpressure, disconnect, shielded cleanup, zero leaks."""

from __future__ import annotations

import asyncio

import pytest

from src.api.sse import OrderValidator, ProtocolOrderError, SSEStream, run_shielded
from src.models.chat_models import DoneEvent, ErrorEvent, MetaEvent, SourcesEvent, StatusEvent, TokenEvent, CitationsEvent, UsageEvent
from src.services.chat.errors import StreamCancelled
from src.services.chat.request_context import CleanupRegistry
from tests.chat.conftest import eventually, make_ctx, make_settings

META = MetaEvent(request_id="r", session_id="s", message_id="m")


def names(frames: list[bytes]) -> list[str]:
    out = []
    for f in frames:
        text = f.decode()
        out.append("ping" if text.startswith(": ping") else text.split("\n", 1)[0].removeprefix("event: "))
    return out


async def drain(stream: SSEStream) -> list[bytes]:
    return [f async for f in stream.body()]


# ─── ordering ─────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("seq", [
    ["meta", "status", "status", "sources", "status", "token", "token", "citations", "usage", "done"],
    ["meta", "token", "done"],                                       # chitchat / out-of-scope
    ["meta", "status", "token", "done"],                             # no_results
    ["meta", "status", "error"],
    ["meta", "token", "error"],
])
def test_valid_orders(seq):
    v = OrderValidator(strict=True)
    for e in seq:
        v.check(e)


@pytest.mark.parametrize("seq", [
    ["token"],                                                       # before meta
    ["meta", "meta"],
    ["meta", "token", "status"],                                     # status after tokens
    ["meta", "token", "sources"],                                    # sources must precede tokens
    ["meta", "token", "usage", "citations"],
    ["meta", "done", "token"],                                       # nothing after a terminal event
    ["meta", "error", "done"],                                       # error is always last
])
def test_invalid_orders_raise_in_strict_mode(seq):
    v = OrderValidator(strict=True)
    with pytest.raises(ProtocolOrderError):
        for e in seq:
            v.check(e)


def test_non_strict_mode_counts_instead_of_raising():
    v = OrderValidator(strict=False)
    v.check("meta")
    assert v.check("citations") is False and v.violations


# ─── happy path ───────────────────────────────────────────────────────────────


async def test_stream_frames_every_event_in_order():
    ctx = make_ctx()

    async def produce(em):
        await em.emit(META)
        await em.emit(StatusEvent(stage="searching"))
        await em.emit(SourcesEvent(sources=[]))
        await em.emit(TokenEvent(t="Hello"))
        await em.emit(CitationsEvent())
        await em.emit(UsageEvent(input_tokens=10, output_tokens=2, quota_remaining=9))
        await em.emit(DoneEvent(finish_reason="stop"))

    stream = SSEStream(ctx, produce, make_settings(), strict=True)
    frames = await drain(stream)
    assert names(frames) == ["meta", "status", "sources", "token", "citations", "usage", "done"]
    assert all(f.endswith(b"\n\n") for f in frames)
    assert stream.first_event_ms is not None and ctx.cleanup.done


async def test_producer_crash_still_ends_the_stream_and_runs_cleanup():
    ctx = make_ctx()
    ran = []

    async def release():
        ran.append("lease")

    ctx.cleanup.register("lease", release)

    async def produce(em):
        await em.emit(META)
        raise RuntimeError("boom")

    frames = await drain(SSEStream(ctx, produce, make_settings()))
    assert names(frames) == ["meta"] and ran == ["lease"]


# ─── heartbeat ────────────────────────────────────────────────────────────────


async def test_heartbeat_arrives_while_the_model_is_silent():
    ctx = make_ctx()

    async def produce(em):
        await em.emit(META)
        await asyncio.sleep(0.35)                                    # the model says nothing
        await em.emit(TokenEvent(t="x"))
        await em.emit(DoneEvent(finish_reason="stop"))

    stream = SSEStream(ctx, produce, make_settings(), heartbeat_s=0.05)
    frames = await drain(stream)
    pings = names(frames).count("ping")
    assert pings >= 3 and stream.heartbeats == pings
    assert names([f for f in frames if not f.startswith(b":")]) == ["meta", "token", "done"]


# ─── disconnect / cleanup / leaks ─────────────────────────────────────────────


class Probe:
    """Records what a finalizer did, so tests can assert cancel-safety."""
    def __init__(self):
        self.persisted_partial = False
        self.released = []


async def test_client_cancel_mid_stream_runs_shielded_finalization_and_releases_everything():
    ctx = make_ctx()
    probe = Probe()

    async def release_lease():
        probe.released.append("lease")

    async def release_quota():
        probe.released.append("quota")

    ctx.cleanup.register("lease", release_lease)
    ctx.cleanup.register("quota", release_quota)

    async def produce(em):
        try:
            await em.emit(META)
            for i in range(1000):
                await em.emit(TokenEvent(t="w"))
                await asyncio.sleep(0.01)
        finally:
            async def persist():
                await asyncio.sleep(0.05)                            # an await inside finally: dies without shielding
                probe.persisted_partial = True
            await run_shielded(persist(), 2.0)

    stream = SSEStream(ctx, produce, make_settings(chat_stall_timeout_s=5.0))
    consumer = asyncio.create_task(drain(stream))
    await eventually(lambda: stream.events_sent >= 3)
    consumer.cancel()                                                # the browser tab closed
    with pytest.raises(asyncio.CancelledError):
        await consumer
    assert ctx.cancel.is_set and ctx.cancel.reason == "client_disconnect"
    assert await eventually(lambda: stream.producer_task.done())
    assert probe.persisted_partial is True                           # the partial answer was saved
    assert sorted(probe.released) == ["lease", "quota"] and ctx.cleanup.done


async def test_stream_that_is_never_iterated_still_cleans_up():
    ctx = make_ctx()
    released = []

    async def release():
        released.append(1)

    ctx.cleanup.register("lease", release)

    async def produce(em):
        await em.emit(META)
        await em.emit(TokenEvent(t="a"))
        await em.emit(DoneEvent(finish_reason="stop"))

    stream = SSEStream(ctx, produce, make_settings())
    stream.start()                                                   # the route starts it; the client vanishes
    await asyncio.wait_for(stream.producer_task, 2.0)
    assert released == [1]


async def test_slow_consumer_hits_the_stall_limit_and_cancels_cleanly():
    ctx = make_ctx()
    released = []

    async def release():
        released.append(1)

    ctx.cleanup.register("lease", release)
    emitted = 0

    async def produce(em):
        nonlocal emitted
        await em.emit(META)
        for _ in range(500):
            await em.emit(TokenEvent(t="x"))                         # nobody reads: queue (8) fills, then stalls
            emitted += 1

    stream = SSEStream(ctx, produce, make_settings(chat_event_queue_size=8, chat_stall_timeout_s=0.1))
    stream.start()
    await asyncio.wait_for(stream.producer_task, 3.0)
    assert ctx.cancel.reason == "client_stalled" and emitted < 20    # memory stayed bounded
    assert released == [1]


async def test_disconnect_watcher_sets_the_cancel_token():
    ctx = make_ctx()
    state = {"gone": False}

    async def is_disconnected():
        return state["gone"]

    async def produce(em):
        await em.emit(META)
        await ctx.cancel.wait()                                      # a real stage would observe this between awaits
        raise StreamCancelled()

    stream = SSEStream(ctx, produce, make_settings(), is_disconnected=is_disconnected, watcher_interval_s=0.02)
    consumer = asyncio.create_task(drain(stream))
    await asyncio.sleep(0.1)
    state["gone"] = True
    frames = await asyncio.wait_for(consumer, 3.0)
    assert ctx.cancel.reason == "client_disconnect" and names(frames) == ["meta"]


async def test_emit_after_consumer_gone_drops_instead_of_raising():
    ctx = make_ctx()
    ctx.cancel.cancel("client_disconnect")
    seen = []

    async def produce(em):
        seen.append(await em.emit(META))                             # must not raise: the finalizer still has work to do

    stream = SSEStream(ctx, produce, make_settings())
    stream.start()
    await asyncio.wait_for(stream.producer_task, 2.0)
    assert seen == [False] and stream.emitter.dropped == 1


# ─── shielding & cleanup registry ─────────────────────────────────────────────


async def test_run_shielded_completes_work_despite_outer_cancellation():
    done = []

    async def work():
        await asyncio.sleep(0.1)
        done.append(1)

    async def outer():
        await run_shielded(work(), 2.0)

    t = asyncio.create_task(outer())
    await asyncio.sleep(0.02)
    t.cancel()
    with pytest.raises(asyncio.CancelledError):
        await t
    assert done == [1]


async def test_run_shielded_is_bounded_by_its_timeout():
    async def stuck():
        await asyncio.sleep(10)

    t0 = asyncio.get_event_loop().time()
    await run_shielded(stuck(), 0.1)
    assert asyncio.get_event_loop().time() - t0 < 1.0


async def test_cleanup_failure_in_one_step_does_not_skip_the_rest():
    reg = CleanupRegistry()
    ran = []

    async def ok(name):
        ran.append(name)

    async def bad():
        raise ConnectionError("redis gone")

    reg.register("lease", lambda: ok("lease"))
    reg.register("quota", bad)
    reg.register("ledger", lambda: ok("ledger"))
    failures = await reg.run()
    assert failures == ["quota"] and ran == ["ledger", "lease"]       # LIFO, bad step skipped over
    assert await reg.run() == ["quota"]                               # idempotent: nothing runs twice
    assert ran == ["ledger", "lease"]
    with pytest.raises(RuntimeError):
        reg.register("late", bad)


async def test_cleanup_step_is_time_bounded():
    reg = CleanupRegistry()

    async def stuck():
        await asyncio.sleep(10)

    reg.register("stuck", stuck)
    t0 = asyncio.get_event_loop().time()
    assert await reg.run(timeout_s=0.1) == ["stuck"]
    assert asyncio.get_event_loop().time() - t0 < 1.0
