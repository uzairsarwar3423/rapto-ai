"""
rag/rate_limit.py — async token bucket for the embedding TPM budget.

Prevents 429 storms when a backfill and live traffic overlap. PROCESS-LOCAL:
with N replicas set EMBEDDING_TPM_BUDGET to (org limit × 0.8) / N.
"""

from __future__ import annotations

import asyncio
import time
from typing import Awaitable, Callable


class TokenBucket:
    def __init__(
        self,
        tokens_per_minute: int,
        *,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        if tokens_per_minute < 1:
            raise ValueError("tokens_per_minute must be >= 1")
        self.capacity = float(tokens_per_minute)          # burst = one minute of budget
        self._rate = tokens_per_minute / 60.0             # tokens per second
        self._available = self.capacity
        self._clock = clock
        self._sleep = sleep
        self._last = clock()
        self._lock = asyncio.Lock()

    def _refill(self) -> None:
        now = self._clock()
        self._available = min(self.capacity, self._available + (now - self._last) * self._rate)
        self._last = now

    async def acquire(self, tokens: int) -> float:
        """Wait until `tokens` are available; returns seconds waited.

        A request larger than the whole bucket is clamped to capacity so it can
        never deadlock (it simply drains the bucket)."""
        needed = float(min(max(tokens, 0), self.capacity))
        waited = 0.0
        async with self._lock:           # FIFO fairness: waiters queue on the lock
            self._refill()
            while self._available < needed:
                delay = (needed - self._available) / self._rate
                await self._sleep(delay)
                waited += delay
                self._refill()
            self._available -= needed
        return waited
