"""Fakes shared by the chat suites: model clients, the data store, the retriever."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Any, AsyncIterator, Callable, Optional, Sequence

from src.models.common import AICallResult, CostRecord, ModelTier, TaskType
from src.models.rag_models import AccessScope
from src.services.chat.data_store import CommitmentFacts, MeetingBrief, RosterEntry
from src.services.chat.errors import ProviderError
from src.services.chat.llm import StreamDelta


def cost_record(i: int = 100, o: int = 20, tier: ModelTier = ModelTier.MINI, name: str = "gpt-4.1-mini") -> CostRecord:
    from src.config.model_routing import compute_cost
    return CostRecord(input_tokens=i, output_tokens=o, model_tier=tier, model_name=name,
                      estimated_cost_usd=compute_cost(i, o, tier))


class FakeAI:
    """AIClientProtocol stand-in. `handlers[task]` is a value, an exception, or a callable(system, user, schema)."""

    def __init__(self, **handlers: Any) -> None:
        self.handlers: dict[str, Any] = {k: v for k, v in handlers.items()}
        self.calls: list[tuple[str, str, str]] = []
        self.delay = 0.0

    def on(self, task: TaskType, handler: Any) -> "FakeAI":
        self.handlers[task.value] = handler
        return self

    async def generate_structured(self, task_type: TaskType, system_prompt: str, user_prompt: str, response_schema: type) -> Any:
        self.calls.append((task_type.value, system_prompt, user_prompt))
        if self.delay:
            await asyncio.sleep(self.delay)
        h = self.handlers.get(task_type.value)
        if h is None:
            raise AssertionError(f"unexpected model call for {task_type.value}")
        if callable(h):
            h = h(system_prompt, user_prompt, response_schema)
        if isinstance(h, BaseException):
            raise h
        data = h if isinstance(h, response_schema) else response_schema(**h)
        return AICallResult(data=data, cost=cost_record(), latency_ms=5.0, retry_count=0, task_type=task_type,
                            model_name="gpt-4.1-mini")

    async def generate_text(self, *a: Any, **k: Any) -> Any:                      # pragma: no cover
        raise AssertionError("generate_text not expected")

    async def embed(self, *a: Any, **k: Any) -> Any:                              # pragma: no cover
        raise AssertionError("embed not expected")

    def count(self, task: TaskType) -> int:
        return sum(1 for c in self.calls if c[0] == task.value)


class FakeStreamer:
    """ChatStreamer stand-in. `script` is a list of text deltas; `error_at` raises ProviderError after N deltas."""

    def __init__(self, deltas: Sequence[str] = (), *, finish_reason: str = "stop", usage: tuple[int, int] = (9000, 120),
                 error_before: Optional[ProviderError] = None, error_after: Optional[tuple[int, ProviderError]] = None,
                 delay_s: float = 0.0, first_token_delay_s: float = 0.0, hang_after: Optional[int] = None,
                 emit_usage: bool = True) -> None:
        self.deltas, self.finish_reason, self.usage = list(deltas), finish_reason, usage
        self.error_before, self.error_after = error_before, error_after
        self.delay_s, self.first_token_delay_s, self.hang_after = delay_s, first_token_delay_s, hang_after
        self.emit_usage = emit_usage
        self.calls = 0
        self.last_system = ""
        self.last_user = ""
        self.closed = 0
        self.fail_first_n = 0

    async def stream(self, *, system: str, user: str, max_tokens: int, temperature: float,
                     model: Optional[str] = None) -> AsyncIterator[StreamDelta]:
        self.calls += 1
        self.last_system, self.last_user = system, user
        if self.fail_first_n and self.calls <= self.fail_first_n:
            raise ProviderError("server", "transient", retryable=True)
        if self.error_before is not None:
            raise self.error_before
        try:
            if self.first_token_delay_s:
                await asyncio.sleep(self.first_token_delay_s)
            for i, d in enumerate(self.deltas):
                if self.error_after and i == self.error_after[0]:
                    raise self.error_after[1]
                if self.hang_after is not None and i == self.hang_after:
                    await asyncio.sleep(3600)
                if self.delay_s:
                    await asyncio.sleep(self.delay_s)
                yield StreamDelta(text=d)
            yield StreamDelta(finish_reason=self.finish_reason,
                              usage=self.usage if self.emit_usage else None)
        finally:
            self.closed += 1


# ─── data store ───────────────────────────────────────────────────────────────

@dataclass
class FakeStore:
    meetings: dict[str, tuple[str, datetime]] = field(default_factory=dict)       # id -> (title, scheduled_at)
    users: dict[str, str] = field(default_factory=dict)                            # id -> name
    commitments: dict[str, CommitmentFacts] = field(default_factory=dict)
    action_items: dict[str, CommitmentFacts] = field(default_factory=dict)
    attended: dict[str, list[str]] = field(default_factory=dict)                   # user -> meeting ids
    analytics_rows: list[dict[str, Any]] = field(default_factory=lambda: [{"n": 12}])
    analytics_error: Optional[BaseException] = None
    fail_hydration: bool = False
    ledger: list[dict[str, Any]] = field(default_factory=list)
    analytics_calls: list[tuple[str, tuple[Any, ...]]] = field(default_factory=list)
    overdue: int = 0

    async def known_meeting_ids(self, team_id: str, ids: Sequence[str], scope: AccessScope) -> set[str]:
        allowed = set(scope.meeting_ids or []) if scope.kind == "meetings" else None
        return {i for i in ids if i in self.meetings and (allowed is None or i in allowed)}

    async def known_user_ids(self, team_id: str, ids: Sequence[str]) -> set[str]:
        return {i for i in ids if i in self.users}

    async def roster(self, team_id: str) -> list[RosterEntry]:
        return [RosterEntry(i, n) for i, n in self.users.items()]

    async def attended_meeting_ids(self, team_id: str, user_id: str, limit: int) -> list[str]:
        return self.attended.get(user_id, [])[:limit]

    async def visible_meetings(self, team_id: str, meeting_ids: Sequence[str], scope: AccessScope) -> set[str]:
        return await self.known_meeting_ids(team_id, meeting_ids, scope)

    async def commitments_by_ids(self, team_id: str, ids: Sequence[str], scope: AccessScope) -> dict[str, CommitmentFacts]:
        if self.fail_hydration:
            raise ConnectionError("pg down")
        return {i: self.commitments[i] for i in ids if i in self.commitments}

    async def action_items_by_ids(self, team_id: str, ids: Sequence[str], scope: AccessScope) -> dict[str, CommitmentFacts]:
        if self.fail_hydration:
            raise ConnectionError("pg down")
        return {i: self.action_items[i] for i in ids if i in self.action_items}

    async def run_analytics(self, team_id: str, sql: str, args: Sequence[Any], timeout_ms: int) -> list[dict[str, Any]]:
        self.analytics_calls.append((sql, tuple(args)))
        if self.analytics_error:
            raise self.analytics_error
        return list(self.analytics_rows)

    async def recent_meetings(self, team_id: str, scope: AccessScope, limit: int) -> list[MeetingBrief]:
        rows = [MeetingBrief(i, t, s) for i, (t, s) in self.meetings.items()
                if scope.kind != "meetings" or i in (scope.meeting_ids or [])]
        return sorted(rows, key=lambda m: m.scheduled_at, reverse=True)[:limit]

    async def overdue_commitment_count(self, team_id: str, today: date, tz: str, scope: AccessScope) -> int:
        return self.overdue

    async def sum_usage(self, team_id: str, day_start: datetime, month_start: datetime) -> tuple[int, float, float]:
        q = sum(1 for r in self.ledger if r["stage"] == "request" and r.get("counts_as_query"))
        usd = sum(r["cost_usd"] for r in self.ledger)
        return q, usd, usd

    async def write_ledger(self, rows: Sequence[dict[str, Any]]) -> int:
        seen = {(r["request_id"], r["stage"]) for r in self.ledger}
        for r in rows:
            if (r["request_id"], r["stage"]) not in seen:
                self.ledger.append(dict(r))
        return len(rows)


def meeting(id_: str = "m1", title: str = "Weekly Standup", when: datetime | None = None) -> tuple[str, tuple[str, datetime]]:
    return id_, (title, when or datetime(2026, 11, 3, 9, 0, tzinfo=timezone.utc))


# ─── retrieval fixtures ───────────────────────────────────────────────────────

import uuid as _uuid
from src.models.rag_models import (
    Citation, EmbeddingSource, RetrievalPipelineResult, ScoredChunk, VectorSearchResult,
)
from src.config.rag_config import RetrievalMode


def make_chunk(text: str = "Ahmed will ship the billing migration by Friday.", *, source_type: str = "transcript_chunk",
               source_id: str | None = None, index: int = 0, grade: int | None = 3, cosine: float = 0.8,
               legs: str = "both", meeting_id: str = "m1", rank: int = 1) -> ScoredChunk:
    sid = source_id or meeting_id
    res = VectorSearchResult(id=_uuid.uuid4(), chunk_text=text, source_type=EmbeddingSource(source_type), source_id=sid,
                             chunk_index=index, metadata={"meeting_id": meeting_id}, source_date=date(2026, 11, 3),
                             model_name="text-embedding-3-small", similarity_score=cosine, rank=rank)
    return ScoredChunk(chunk=res, cosine_similarity=cosine, vector_rank=rank, lexical_rank=rank, fused_score=0.03,
                       retrieval_legs=legs, rerank_grade=grade, final_rank=rank)           # type: ignore[arg-type]


def make_citation(i: int = 1, *, title: str | None = "Weekly Standup", meeting_id: str = "m1", speaker: str | None = "Ahmed",
                  preview: str = "Ahmed will ship the billing migration", chunk: ScoredChunk | None = None) -> Citation:
    c = chunk.chunk if chunk else make_chunk().chunk
    return Citation(citation_id=i, embedding_id=c.id, source_type=c.source_type, source_id=c.source_id,
                    chunk_index=c.chunk_index, meeting_id=meeting_id, meeting_title=title, meeting_date=date(2026, 11, 3),
                    speaker_name=speaker, start_time=12.0, end_time=30.0, preview=preview)


def make_retrieval(chunks: list[ScoredChunk], *, no_context: bool = False, degraded: bool = False,
                   titles: list[str | None] | None = None) -> RetrievalPipelineResult:
    cits = [make_citation(i + 1, chunk=c, title=(titles[i] if titles else "Weekly Standup"), meeting_id=c.chunk.metadata.get("meeting_id", "m1"))
            for i, c in enumerate(chunks)]
    return RetrievalPipelineResult(
        query_hash="h", retrieval_mode=RetrievalMode.HYBRID_RRF, candidates=chunks, reranked=chunks, citations=cits,
        degraded=degraded, degrade_reasons=["rerank:timeout"] if degraded else [], retrieval_confidence=0.9,
        no_relevant_context=no_context, reranker_prompt_version="rerank-v1.0",
        embedding_cost=cost_record(30, 0, ModelTier.EMBED, "text-embedding-3-small"),
        reranking_cost=cost_record(5000, 250, ModelTier.MINI))


class FakeRetriever:
    """Day 57 `Retriever.retrieve` stand-in. Records every call; can delay or fail."""

    def __init__(self, result: RetrievalPipelineResult | None = None, *, error: BaseException | None = None, delay_s: float = 0.0):
        self.result, self.error, self.delay_s = result, error, delay_s
        self.calls: list[dict[str, Any]] = []

    async def retrieve(self, query_text: str, team_id: str, **kw: Any) -> RetrievalPipelineResult:
        self.calls.append({"query": query_text, "team_id": team_id, **kw})
        if self.delay_s:
            await asyncio.sleep(self.delay_s)
        if self.error:
            raise self.error
        assert self.result is not None
        return self.result
