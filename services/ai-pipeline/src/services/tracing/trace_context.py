"""
services/tracing/trace_context.py
──────────────────────────────────
Asyncio-safe trace context propagation.

One meeting → one parent trace. Every AI call made while extracting that
meeting (any chunk, any extractor, primary or fallback) is recorded as a child
of it. ContextVar gives each asyncio Task its own copy, so concurrently
processed chunks never see each other's chunk_index / fallback flag.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, replace
from typing import Any, Optional


@dataclass(frozen=True)
class TraceContext:
    meeting_id: str
    team_id: str
    prompt_version: str
    chunk_index: int = -1               # -1 = meeting-level (e.g. meta-summary)
    meeting_type: str = "general"
    parent_run: Optional[Any] = None    # langsmith RunTree for the meeting (or None)
    fallback_triggered: bool = False    # True inside a confidence-gate re-extraction

    @property
    def parent_run_id(self) -> Optional[str]:
        run_id = getattr(self.parent_run, "id", None)
        return str(run_id) if run_id is not None else None


current_trace_context: ContextVar[Optional[TraceContext]] = ContextVar(
    "current_trace_context", default=None
)


@contextmanager
def trace_scope(**changes: Any) -> Iterator[Optional[TraceContext]]:
    """Temporarily derive the current context with field overrides.

    No-op (yields None) when no meeting-level context is active.
    """
    base = current_trace_context.get()
    if base is None:
        yield None
        return
    token = current_trace_context.set(replace(base, **changes))
    try:
        yield current_trace_context.get()
    finally:
        current_trace_context.reset(token)
