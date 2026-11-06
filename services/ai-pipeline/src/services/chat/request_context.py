"""
services/chat/request_context.py
────────────────────────────────
The bundle passed to every stage: identity, plan, timezone, an injectable clock,
a cancel token, the cost accumulator and the CLEANUP REGISTRY.

CLEANUP REGISTRY — the answer to "what if the stream generator never starts or is
cancelled mid-flight": every resource acquired during preflight (stream leases,
quota reservation) registers a release callback here. Cleanup runs exactly once,
LIFO, each step individually guarded (one failure never skips the rest), under a
bounded timeout, and shielded from the cancellation that triggered it.
"""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Awaitable, Callable, Optional

import pytz
import structlog

from src.models.chat_models import ChatClaims
from src.models.rag_models import AccessScope
from src.rag.metrics import metrics
from src.services.chat.cost_accumulator import CostAccumulator

log = structlog.get_logger(__name__)

Clock = Callable[[], datetime]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class CancelToken:
    """One-way latch. `cancel()` is idempotent; the FIRST reason wins."""

    def __init__(self) -> None:
        self._event = asyncio.Event()
        self.reason: Optional[str] = None

    def cancel(self, reason: str = "cancelled") -> None:
        if not self._event.is_set():
            self.reason = reason
            self._event.set()

    @property
    def is_set(self) -> bool:
        return self._event.is_set()

    async def wait(self) -> None:
        await self._event.wait()


CleanupFn = Callable[[], Awaitable[None]]


class CleanupRegistry:
    def __init__(self) -> None:
        self._steps: list[tuple[str, CleanupFn]] = []
        self._ran = False
        self.failures: list[str] = []

    def register(self, name: str, fn: CleanupFn) -> None:
        if self._ran:
            raise RuntimeError("cleanup already ran; cannot register new steps")
        self._steps.append((name, fn))

    @property
    def pending(self) -> list[str]:
        return [] if self._ran else [n for n, _ in self._steps]

    @property
    def done(self) -> bool:
        return self._ran

    async def run(self, *, timeout_s: float = 5.0) -> list[str]:
        """Run all steps once (LIFO). Returns the names of steps that failed. Never raises."""
        if self._ran:
            return self.failures
        self._ran = True
        for name, fn in reversed(self._steps):
            try:
                await asyncio.wait_for(fn(), timeout=timeout_s)
            except asyncio.CancelledError:
                # We are being cancelled but cleanup must finish: record and continue with the rest.
                self.failures.append(name)
                metrics.inc("chat_cleanup_failures_total", step=name)
            except Exception as exc:  # noqa: BLE001 — one failing step must not skip the others
                self.failures.append(name)
                metrics.inc("chat_cleanup_failures_total", step=name)
                log.error("chat_cleanup_step_failed", step=name, error_type=type(exc).__name__)
        return self.failures


@dataclass
class RequestContext:
    claims: ChatClaims
    request_id: str
    clock: Clock = utc_now
    cancel: CancelToken = field(default_factory=CancelToken)
    cost: CostAccumulator = field(default_factory=CostAccumulator)
    cleanup: CleanupRegistry = field(default_factory=CleanupRegistry)
    access_scope: AccessScope = field(default_factory=AccessScope)
    started_at: float = field(default_factory=lambda: asyncio.get_event_loop().time())

    @property
    def team_id(self) -> str:
        return self.claims.team_id

    @property
    def user_id(self) -> str:
        return self.claims.user_id

    @property
    def plan(self) -> str:
        return self.claims.plan

    @property
    def tz_name(self) -> str:
        return self.claims.tz

    @property
    def tz(self) -> pytz.BaseTzInfo:
        return pytz.timezone(self.claims.tz)

    @property
    def as_of(self) -> datetime:
        """'Now' in the TEAM's timezone (injected clock → deterministic tests)."""
        return self.clock().astimezone(self.tz)

    @property
    def today(self):  # noqa: ANN201
        return self.as_of.date()

    def elapsed_s(self) -> float:
        return asyncio.get_event_loop().time() - self.started_at

    def remaining_s(self, total_timeout_s: float) -> float:
        return max(0.0, total_timeout_s - self.elapsed_s())


def new_request_id() -> str:
    return uuid.uuid4().hex
