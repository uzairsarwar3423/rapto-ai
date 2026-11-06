"""
rag/reranker.py — graded listwise re-ranking with a deterministic fallback.

CONTRACT: `rerank()` NEVER raises. Any failure (timeout, 429, malformed output,
open breaker, no time left) returns a valid result in FUSED order, flagged
`degraded=True` with a reason code. Skipping because the candidate set is small is
not a degradation.

SECURITY: chunk text is untrusted. It is wrapped in <chunk> blocks the system
prompt declares to be data, any closing-tag lookalike inside it is neutralised,
and the model output is schema-constrained to {index, relevance}, so the worst a
hostile chunk can achieve is a reordering — which the eval exercises.
"""

from __future__ import annotations

import asyncio
import hashlib
import random
import time
from collections import deque
from dataclasses import dataclass
from datetime import date, datetime
from functools import lru_cache
from typing import Callable, Optional, Protocol, Sequence
from zoneinfo import ZoneInfo

import structlog

from src.config.rag_config import EMBEDDING_MODEL, RagSettings, RerankPresentOrder, RerankerStrategy
from src.models.common import CostRecord, ModelTier, TaskType
from src.models.exceptions import AIRateLimitExhaustedError, AISchemaValidationError, AITimeoutError
from src.models.rag_models import (
    EmbeddingSource,
    RerankCandidate,
    RerankedItem,
    RerankModelOutput,
    RerankRequest,
    RerankResult,
    ScoredChunk,
    SourceContext,
)
from src.rag.citation_builder import meeting_id_of
from src.rag.deadline import Deadline
from src.rag.metrics import metrics
from src.rag.text_utils import clean_text, truncate_text
from src.services.ai_client_protocol import AIClientProtocol
from src.services.extraction.prompt_router import load_prompt

log = structlog.get_logger(__name__)

PROMPT_FILE = "rerank_system.txt"
_SOURCE_LABEL = {
    EmbeddingSource.TRANSCRIPT_CHUNK: "transcript", EmbeddingSource.COMMITMENT: "commitment",
    EmbeddingSource.ACTION_ITEM: "action item", EmbeddingSource.DECISION: "decision",
    EmbeddingSource.SUMMARY: "summary", EmbeddingSource.DIGEST: "digest",
}


# ─── Prompt (versioned + hashed) ──────────────────────────────────────────────


@dataclass(frozen=True)
class RerankPrompt:
    text: str
    version: str
    sha256: str


@lru_cache(maxsize=1)
def load_rerank_prompt() -> RerankPrompt:
    loaded = load_prompt(PROMPT_FILE)
    # Normalise newlines first: a Windows (CRLF) checkout must hash like a Linux (LF) one.
    canonical = loaded.text.replace("\r\n", "\n").replace("\r", "\n")
    return RerankPrompt(canonical, loaded.version, hashlib.sha256(canonical.encode("utf-8")).hexdigest())


# ─── Circuit breaker ──────────────────────────────────────────────────────────


class CircuitBreaker:
    """closed → open (N failures in a window) → half-open after a cooldown (ONE trial) → closed/open.
    Per process: acceptable, because the fallback it protects is stateless and always available."""

    def __init__(self, failures: int, window_s: float, cooldown_s: float,
                 clock: Callable[[], float] = time.monotonic) -> None:
        self._threshold, self._window, self._cooldown, self._clock = failures, window_s, cooldown_s, clock
        self._failures: deque[float] = deque()
        self._opened_at: Optional[float] = None
        self._trial_in_flight = False

    @property
    def state(self) -> str:
        if self._opened_at is None:
            return "closed"
        return "half_open" if self._clock() - self._opened_at >= self._cooldown else "open"

    def allow(self) -> bool:
        state = self.state
        if state == "closed":
            return True
        if state == "half_open" and not self._trial_in_flight:
            self._trial_in_flight = True            # exactly one probe
            return True
        return False

    def record_success(self) -> None:
        self._failures.clear()
        self._opened_at = None
        self._trial_in_flight = False

    def record_failure(self) -> None:
        now = self._clock()
        self._trial_in_flight = False
        if self._opened_at is not None:             # failed probe → re-open for a full cooldown
            self._opened_at = now
            return
        self._failures.append(now)
        while self._failures and now - self._failures[0] > self._window:
            self._failures.popleft()
        if len(self._failures) >= self._threshold:
            self._opened_at = now


# ─── Request building ─────────────────────────────────────────────────────────


def _header(scored: ScoredChunk, ctx: SourceContext, tz_name: str) -> str:
    chunk = scored.chunk
    meta = chunk.metadata
    parts = [_SOURCE_LABEL.get(chunk.source_type, chunk.source_type.value)]
    meeting_id = meeting_id_of(chunk.source_type, chunk.source_id, meta)
    info = ctx.meetings.get(meeting_id) if meeting_id else None
    title = (info.title if info and info.title else None) or (
        meta.get("meeting_title") if isinstance(meta.get("meeting_title"), str) else None)
    if title:
        parts.append(f'meeting "{clean_text(title)[:120]}"')
    when: Optional[date] = (info.meeting_date if info and info.meeting_date else None) or chunk.source_date
    if when:
        parts.append(f"{when.strftime('%A')} {when.isoformat()}")
    who = meta.get("speaker_name") if isinstance(meta.get("speaker_name"), str) else None
    if who is None and isinstance(meta.get("commitment_owner_id"), str):
        who = ctx.users.get(meta["commitment_owner_id"])
    if who:
        parts.append(f"speaker/owner: {clean_text(who)[:80]}")
    return " · ".join(parts)


def build_rerank_request(
    query: str,
    candidates: Sequence[ScoredChunk],
    ctx: SourceContext,
    *,
    now: datetime,
    timezone_name: str,
    top_n: int,
    char_budget: int,
) -> RerankRequest:
    built = []
    for i, scored in enumerate(candidates):
        text, truncated = truncate_text(scored.chunk.chunk_text, char_budget, prefer_sentence=True)
        built.append(RerankCandidate(index=i, header=_header(scored, ctx, timezone_name),
                                     text=text + (" …" if truncated else "")))
    return RerankRequest(query=query, candidates=built, now=now, timezone=timezone_name, top_n=top_n)


def _neutralise(text: str) -> str:
    """A chunk must not be able to close its own delimiter."""
    return text.replace("</chunk", "‹/chunk").replace("<chunk", "‹chunk")


def presentation_order(n: int, order: RerankPresentOrder, seed: str) -> list[int]:
    """Candidate indices in the order shown to the grader (ADR-5)."""
    indices = list(range(n))
    if order is RerankPresentOrder.SEEDED_SHUFFLE:
        random.Random(seed).shuffle(indices)        # deterministic per query
    return indices


def build_user_prompt(request: RerankRequest, order: Sequence[int]) -> str:
    try:
        local = request.now.astimezone(ZoneInfo(request.timezone))
    except Exception:  # noqa: BLE001
        local = request.now
    lines = [
        f"QUESTION: {_neutralise(clean_text(request.query))}",
        f"NOW: {local.strftime('%A %Y-%m-%d %H:%M')} (timezone {request.timezone})",
        f"CANDIDATES ({len(request.candidates)}):",
    ]
    for idx in order:
        cand = request.candidates[idx]
        lines.append(f'<chunk index="{idx}">\n{_neutralise(cand.header)}\n---\n{_neutralise(cand.text)}\n</chunk>')
    return "\n".join(lines)


# ─── Validation / repair ──────────────────────────────────────────────────────


class InvalidRerankOutput(Exception):
    pass


@dataclass
class Validated:
    graded: list[RerankedItem]        # unique, in-range, clamped; ordered by grade desc (model order breaks ties)
    unranked: list[int]               # candidates the model omitted, in FUSION order
    repaired: bool


def validate_and_repair(output: Optional[RerankModelOutput], n: int, max_invalid_fraction: float) -> Validated:
    """Never trust model output. Raises InvalidRerankOutput when it is unusable."""
    if output is None or not output.ranking:
        raise InvalidRerankOutput("empty ranking")
    seen: set[int] = set()
    graded: list[RerankedItem] = []
    invalid = 0
    repaired = False
    for item in output.ranking:
        if not (0 <= item.index < n) or item.index in seen:
            invalid += 1
            repaired = True
            continue
        seen.add(item.index)
        clamped = min(3, max(0, int(item.relevance)))
        repaired = repaired or clamped != item.relevance
        graded.append(RerankedItem(index=item.index, relevance=clamped))
    if invalid / len(output.ranking) > max_invalid_fraction or not graded:
        raise InvalidRerankOutput(f"{invalid}/{len(output.ranking)} entries invalid")
    ordered = sorted(graded, key=lambda it: -it.relevance)          # stable: model order breaks ties
    if [i.index for i in ordered] != [i.index for i in graded]:
        repaired = True                                              # model order contradicted its own grades
    unranked = [i for i in range(n) if i not in seen]
    repaired = repaired or bool(unranked)
    return Validated(ordered, unranked, repaired)


# ─── Reranker ─────────────────────────────────────────────────────────────────


class Reranker(Protocol):
    async def rerank(self, request: RerankRequest, *, query_hash: str = "",
                     deadline: Optional[Deadline] = None, confident: bool = False) -> RerankResult: ...


def _zero_cost() -> CostRecord:
    return CostRecord(input_tokens=0, output_tokens=0, model_tier=ModelTier.MINI,
                      model_name=EMBEDDING_MODEL, estimated_cost_usd=0.0)


class LLMReranker:
    """GPT-4.1 Mini listwise grader behind the Reranker interface (ADR-3: a cross-encoder
    implementation can replace it without touching the retriever)."""

    def __init__(self, client: AIClientProtocol, settings: RagSettings, *,
                 breaker: Optional[CircuitBreaker] = None,
                 clock: Callable[[], float] = time.monotonic) -> None:
        self._client = client
        self._settings = settings
        self._breaker = breaker or CircuitBreaker(settings.rerank_breaker_failures,
                                                  settings.rerank_breaker_window_s,
                                                  settings.rerank_breaker_cooldown_s, clock)

    @property
    def breaker(self) -> CircuitBreaker:
        return self._breaker

    # -- fallbacks --------------------------------------------------------------------
    def _fused_order(self, request: RerankRequest, prompt: Optional[RerankPrompt], *, strategy: RerankerStrategy,
                     degraded: bool, reason: Optional[str], skipped: Optional[str],
                     started: float) -> RerankResult:
        top = list(range(min(request.top_n, len(request.candidates))))
        outcome = "skipped_small" if skipped == "small_candidate_set" else (
            f"fallback_{reason}" if degraded else f"skipped_{skipped or 'strategy'}")
        metrics.inc("rag_rerank_outcome_total", outcome=outcome)
        return RerankResult(ordered_indices=top, grades={}, strategy_used=strategy, degraded=degraded,
                            degrade_reason=reason, skipped_reason=skipped,
                            prompt_version=prompt.version if prompt else None,
                            prompt_hash=prompt.sha256 if prompt else None,
                            cost=_zero_cost(), latency_ms=round((time.monotonic() - started) * 1000, 2))

    async def rerank(self, request: RerankRequest, *, query_hash: str = "",
                     deadline: Optional[Deadline] = None, confident: bool = False) -> RerankResult:
        started = time.monotonic()
        cfg = self._settings
        prompt = load_rerank_prompt()
        n = len(request.candidates)
        fallback = lambda **kw: self._fused_order(request, prompt, started=started, **kw)  # noqa: E731

        if cfg.rerank_strategy is not RerankerStrategy.GPT41_MINI:
            return fallback(strategy=RerankerStrategy.SCORE_ONLY, degraded=False, reason=None, skipped="strategy")
        if n == 0:
            return fallback(strategy=RerankerStrategy.SCORE_ONLY, degraded=False, reason=None, skipped="no_candidates")
        if n <= request.top_n and confident:
            return fallback(strategy=RerankerStrategy.SCORE_ONLY, degraded=False, reason=None,
                            skipped="small_candidate_set")
        if deadline is not None and deadline.remaining_ms() < cfg.rerank_min_remaining_ms:
            return fallback(strategy=RerankerStrategy.SCORE_ONLY, degraded=True, reason="deadline", skipped=None)
        if not self._breaker.allow():
            return fallback(strategy=RerankerStrategy.SCORE_ONLY, degraded=True, reason="breaker_open", skipped=None)

        order = presentation_order(n, cfg.rerank_present_order, query_hash or request.query)
        timeout = cfg.rerank_timeout_s if deadline is None else min(cfg.rerank_timeout_s, deadline.remaining_s())
        try:
            call = await asyncio.wait_for(
                self._client.generate_structured(
                    task_type=TaskType.RERANK, system_prompt=prompt.text,
                    user_prompt=build_user_prompt(request, order), response_schema=RerankModelOutput),
                timeout=timeout,
            )
        except asyncio.CancelledError:
            raise
        except asyncio.TimeoutError:
            return self._failed("timeout", fallback)
        except AIRateLimitExhaustedError:
            return self._failed("rate_limited", fallback)
        except AITimeoutError:
            return self._failed("timeout", fallback)
        except AISchemaValidationError:
            return self._failed("invalid_output", fallback)
        except Exception as exc:  # noqa: BLE001 — the contract is "never raises"
            log.warning("rerank_unexpected_error", error_type=type(exc).__name__)
            return self._failed("error", fallback)

        try:
            validated = validate_and_repair(call.data, n, cfg.rerank_max_invalid_fraction)
        except InvalidRerankOutput:
            return self._failed("invalid_output", fallback, cost=call.cost)

        self._breaker.record_success()
        selected = [it for it in validated.graded if not (cfg.rerank_drop_grade_zero and it.relevance == 0)]
        ordered = [it.index for it in selected] + list(validated.unranked)     # omitted ones keep fusion order
        ordered = ordered[: request.top_n]
        metrics.inc("rag_rerank_outcome_total", outcome="repaired" if validated.repaired else "ok")
        metrics.inc("rag_rerank_cost_usd_total", call.cost.estimated_cost_usd)
        metrics.inc("rag_rerank_tokens_total", call.cost.input_tokens + call.cost.output_tokens)
        return RerankResult(
            ordered_indices=ordered, grades={it.index: it.relevance for it in validated.graded},
            strategy_used=RerankerStrategy.GPT41_MINI, repaired=validated.repaired,
            prompt_version=prompt.version, prompt_hash=prompt.sha256, cost=call.cost,
            latency_ms=round((time.monotonic() - started) * 1000, 2),
        )

    def _failed(self, reason: str, fallback: Callable[..., RerankResult],
                cost: Optional[CostRecord] = None) -> RerankResult:
        self._breaker.record_failure()
        result = fallback(strategy=RerankerStrategy.SCORE_ONLY, degraded=True, reason=reason, skipped=None)
        if cost is not None:
            result.cost = cost                      # a malformed answer still cost money
        return result
