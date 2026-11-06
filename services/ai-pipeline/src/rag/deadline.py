"""rag/deadline.py — a request-scoped time budget propagated through the pipeline."""

from __future__ import annotations

import time
from typing import Callable

from src.rag.errors import RetrievalTimeoutError


class Deadline:
    def __init__(self, budget_ms: float, *, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._expires = clock() + budget_ms / 1000.0
        self.budget_ms = budget_ms

    def remaining_ms(self) -> float:
        return max(0.0, (self._expires - self._clock()) * 1000.0)

    def remaining_s(self) -> float:
        return self.remaining_ms() / 1000.0

    def expired(self) -> bool:
        return self.remaining_ms() <= 0.0

    def require(self, stage: str) -> float:
        """Seconds left for a MANDATORY stage; raises RetrievalTimeoutError when none."""
        left = self.remaining_s()
        if left <= 0.0:
            raise RetrievalTimeoutError(f"retrieval deadline exceeded before stage '{stage}'", stage=stage)
        return left
