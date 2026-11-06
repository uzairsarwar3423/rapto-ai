"""
api/sse.py
──────────
The transport layer of POST /chat/query: typed event queue → one writer → bytes.

WHY THE PRODUCER IS A TASK, NOT THE RESPONSE GENERATOR
  In ASGI the 200 status line is sent before the response generator body runs, and a generator
  that never starts (client vanished) or is cancelled never runs its own cleanup. So the
  orchestrator runs as an independent `asyncio.Task` started by the route; the response generator is
  only a *consumer* of its queue. The producer's `finally` always runs — and runs SHIELDED from the
  cancellation that triggered it — so a disconnect still persists the partial answer, settles the
  quota and releases the leases.

  * single writer: heartbeat injection, ordering and backpressure are centralized here
  * heartbeat: an independent timer (`: ping`) — not tied to model progress
  * backpressure: bounded queue; a consumer that stalls past CHAT_STALL_TIMEOUT_S is cancelled
  * disconnect: generator cancellation AND a lightweight watcher both set the cancel token
  * order enforcement: strict in tests (raises), a metric in production
"""

from __future__ import annotations

import asyncio
import contextlib
import time
from typing import Any, AsyncIterator, Awaitable, Callable, Optional

import structlog

from src.config.chat_config import ChatSettings
from src.models.chat_models import HEARTBEAT_FRAME, TERMINAL_EVENTS, encode_event
from src.rag.metrics import metrics
from src.services.chat.errors import StreamCancelled
from src.services.chat.request_context import CancelToken, RequestContext

log = structlog.get_logger(__name__)

SSE_HEADERS = {
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",          # nginx: do not buffer
    "Content-Encoding": "identity",     # compression middleware must not touch the stream
}


class ProtocolOrderError(AssertionError):
    pass


# Cancel reasons meaning "the consumer is gone". Any OTHER cancel (operator stop, shutdown) still delivers the terminal
# `done(cancelled)` event to a client that is still connected.
DEAD_CONSUMER: frozenset[str] = frozenset({"client_disconnect", "client_stalled"})


# ─── ordering ─────────────────────────────────────────────────────────────────

_ALLOWED: dict[str, frozenset[str]] = {
    "start": frozenset({"meta"}),
    "meta": frozenset({"status", "sources", "token", "done", "error"}),
    "status": frozenset({"status", "sources", "token", "done", "error"}),
    "sources": frozenset({"status", "token", "done", "error"}),
    "token": frozenset({"token", "citations", "usage", "done", "error"}),
    "citations": frozenset({"usage", "done", "error"}),
    "usage": frozenset({"done", "error"}),
    "done": frozenset(),
    "error": frozenset(),
}


class OrderValidator:
    """meta → status* → [sources] → status(answering)? → token* → citations → usage → done  (error last)."""

    def __init__(self, strict: bool = False) -> None:
        self.state = "start"
        self.strict = strict
        self.violations: list[str] = []

    def check(self, event_name: str) -> bool:
        if event_name in _ALLOWED[self.state]:
            self.state = event_name
            return True
        msg = f"event '{event_name}' not allowed after '{self.state}'"
        self.violations.append(msg)
        metrics.inc("chat_sse_order_violations_total", event=event_name)
        if self.strict:
            raise ProtocolOrderError(msg)
        log.error("chat_sse_order_violation", event_name=event_name, after=self.state)
        return False

    @property
    def terminated(self) -> bool:
        return self.state in TERMINAL_EVENTS


# ─── shielded execution ───────────────────────────────────────────────────────

async def run_shielded(awaitable: Awaitable[Any], timeout_s: float, *, swallow: bool = True) -> Any:
    """Run `awaitable` to completion (bounded by `timeout_s`) even if the caller is cancelled meanwhile.

    A cancelled task's own `finally` would otherwise be cancelled too: `await cleanup()` inside a task that
    is being torn down raises CancelledError at the first await. Here the work lives in its own task and the
    caller keeps waiting through repeated cancellations; the cancellation is re-raised afterwards."""
    loop = asyncio.get_running_loop()
    task = asyncio.ensure_future(awaitable)
    deadline = loop.time() + timeout_s
    cancelled = False
    while not task.done():
        remaining = deadline - loop.time()
        if remaining <= 0:
            task.cancel()
            metrics.inc("chat_shielded_timeout_total")
            break
        try:
            await asyncio.wait({task}, timeout=remaining)
        except asyncio.CancelledError:
            cancelled = True                 # keep waiting: cleanup must finish
    result: Any = None
    if task.done() and not task.cancelled():
        exc = task.exception()
        if exc is not None and not swallow:
            raise exc
        if exc is None:
            result = task.result()
        else:
            log.error("chat_shielded_task_failed", error_type=type(exc).__name__)
    if cancelled:
        raise asyncio.CancelledError()
    return result


# ─── emitter (what the orchestrator sees) ─────────────────────────────────────

class EventEmitter:
    def __init__(self, queue: "asyncio.Queue[Any]", validator: OrderValidator, cancel: CancelToken,
                 stall_timeout_s: float) -> None:
        self._q = queue
        self._v = validator
        self._cancel = cancel
        self._stall = stall_timeout_s
        self.emitted = 0
        self.dropped = 0

    @property
    def terminated(self) -> bool:
        return self._v.terminated

    async def emit(self, event: Any) -> bool:
        """Queue an event for the client. Returns False when the consumer is gone (event dropped, no raise —
        the orchestrator still has to finalize). A consumer stalled past the limit is cancelled."""
        name = getattr(event, "event", "")
        if not self._v.check(name):
            self.dropped += 1
            return False
        if self._cancel.is_set and self._cancel.reason in DEAD_CONSUMER:
            self.dropped += 1                     # nobody is listening: do not queue (the finalizer still has work to do)
            return False
        try:
            await asyncio.wait_for(self._q.put(event), timeout=self._stall)
        except asyncio.TimeoutError:
            self._cancel.cancel("client_stalled")
            metrics.inc("chat_stall_cancel_total")
            raise StreamCancelled("client stalled") from None
        self.emitted += 1
        return True


# ─── stream ───────────────────────────────────────────────────────────────────

Producer = Callable[[EventEmitter], Awaitable[None]]
_SENTINEL = object()


class SSEStream:
    def __init__(self, ctx: RequestContext, produce: Producer, settings: ChatSettings, *,
                 is_disconnected: Optional[Callable[[], Awaitable[bool]]] = None, strict: bool = False,
                 heartbeat_s: Optional[float] = None, watcher_interval_s: float = 0.5) -> None:
        self._ctx = ctx
        self._produce = produce
        self._cfg = settings
        self._is_disconnected = is_disconnected
        self._hb = heartbeat_s if heartbeat_s is not None else settings.chat_heartbeat_s
        self._watch_every = watcher_interval_s
        self._queue: asyncio.Queue[Any] = asyncio.Queue(maxsize=settings.chat_event_queue_size)
        self.validator = OrderValidator(strict=strict)
        self.emitter = EventEmitter(self._queue, self.validator, ctx.cancel, settings.chat_stall_timeout_s)
        self._producer: Optional[asyncio.Task[None]] = None
        self._created = time.monotonic()
        self.first_event_ms: Optional[float] = None
        self.heartbeats = 0
        self.events_sent = 0

    # ── lifecycle ────────────────────────────────────────────────────────────

    def start(self) -> None:
        """Start the producer NOW (called by the route before returning the response)."""
        if self._producer is None:
            self._producer = asyncio.create_task(self._run(), name=f"chat-producer-{self._ctx.request_id}")

    @property
    def producer_task(self) -> asyncio.Task[None]:
        if self._producer is None:
            raise RuntimeError("stream not started")
        return self._producer

    async def _run(self) -> None:
        try:
            await self._produce(self.emitter)
        except StreamCancelled:
            self._ctx.cancel.cancel(self._ctx.cancel.reason or "stream_cancelled")
        except asyncio.CancelledError:
            self._ctx.cancel.cancel("producer_cancelled")
            raise
        except Exception as exc:  # noqa: BLE001 — the orchestrator maps its own errors; this is the last resort
            metrics.inc("chat_producer_crash_total", error=type(exc).__name__)
            log.error("chat_producer_crashed", request_id=self._ctx.request_id, error_type=type(exc).__name__)
        finally:
            # Registered resources (stream leases, quota safety net) are released no matter how we got here.
            await run_shielded(self._ctx.cleanup.run(timeout_s=self._cfg.chat_cleanup_timeout_s),
                               self._cfg.chat_cleanup_timeout_s * 2)
            with contextlib.suppress(asyncio.QueueFull):
                self._queue.put_nowait(_SENTINEL)

    # ── consumer side ────────────────────────────────────────────────────────

    async def body(self) -> AsyncIterator[bytes]:
        self.start()
        watcher = asyncio.create_task(self._watch_disconnect()) if self._is_disconnected else None
        try:
            while True:
                try:
                    item = await asyncio.wait_for(self._queue.get(), timeout=self._hb)
                except asyncio.TimeoutError:
                    if self._ctx.cancel.is_set:
                        break
                    if self._producer is not None and self._producer.done() and self._queue.empty():
                        break
                    self.heartbeats += 1
                    yield HEARTBEAT_FRAME
                    continue
                if item is _SENTINEL:
                    break
                if self._ctx.cancel.is_set and self._ctx.cancel.reason in DEAD_CONSUMER:
                    break
                frame = encode_event(item)
                if self.first_event_ms is None:
                    self.first_event_ms = round((time.monotonic() - self._created) * 1000, 2)
                    metrics.observe("chat_first_event_seconds", self.first_event_ms / 1000)
                self.events_sent += 1
                yield frame
        except (asyncio.CancelledError, GeneratorExit):
            # Starlette cancels the response task when the client goes away.
            self._ctx.cancel.cancel("client_disconnect")
            metrics.inc("chat_cancel_total", phase="stream")
            raise
        finally:
            if watcher is not None:
                watcher.cancel()
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await watcher
            if self._ctx.cancel.is_set and self._producer is not None:
                # Let the producer finish its (shielded) finalization before the response task ends.
                await run_shielded(asyncio.wait({self._producer}), self._cfg.chat_cleanup_timeout_s * 3)

    async def _watch_disconnect(self) -> None:
        assert self._is_disconnected is not None
        while True:
            await asyncio.sleep(self._watch_every)
            try:
                if await self._is_disconnected():
                    self._ctx.cancel.cancel("client_disconnect")
                    return
            except Exception:  # noqa: BLE001
                return


def sse_response(stream: SSEStream) -> Any:
    from fastapi.responses import StreamingResponse
    return StreamingResponse(stream.body(), media_type="text/event-stream", headers=SSE_HEADERS)
