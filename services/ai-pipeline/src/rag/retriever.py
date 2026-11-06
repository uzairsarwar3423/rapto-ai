"""
rag/retriever.py — the Day 57 pipeline: query → hybrid retrieval → fusion →
source context → re-rank → citations → confidence.

    0 validate  1 process  2 embed  3 vector ∥ lexical  4 fuse
    5 source context (+orphan drop)  6 rerank  7 citations  8 confidence

DEADLINE: one budget is propagated through every stage. Mandatory stages (embed,
vector leg) raise RetrievalTimeoutError (504); the optional ones degrade:
a failed lexical leg continues vector-only, a failed/slow re-rank falls back to the
fused order. Empty results are VALID (no_relevant_context=True), never an error.

SCORES: thresholds belong on `rerank_grade` or raw `cosine_similarity`, never on
`fused_score` (an RRF number that means nothing outside this ranking).
"""

from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone
from typing import Any, Awaitable, Optional

import structlog

from src.config.rag_config import EMBEDDING_MODEL, RagSettings, RetrievalMode
from src.models.common import CostRecord, ModelTier
from src.models.rag_models import (
    LexicalSearchQuery,
    RetrievalFilters,
    RetrievalPipelineResult,
    RetrievalProfile,
    ScoredChunk,
    VectorSearchQuery,
    VectorSearchResult,
)
from src.rag import vector_store as vs
from src.rag.citation_builder import build_citations, meeting_id_of
from src.rag.db import RagDatabase
from src.rag.deadline import Deadline
from src.rag.embedder import QueryEmbedder
from src.rag.errors import RetrievalTimeoutError
from src.rag.fusion import fuse
from src.rag.metrics import metrics
from src.rag.query_processing import ProcessedQuery, process_query
from src.rag.reranker import Reranker, build_rerank_request, load_rerank_prompt
from src.rag.source_context import SourceContextResolver
from src.rag.tenant_context import check_team_id
from src.models.rag_models import SourceContext

log = structlog.get_logger(__name__)


def _zero(tier: ModelTier = ModelTier.EMBED, name: str = EMBEDDING_MODEL) -> CostRecord:
    return CostRecord(input_tokens=0, output_tokens=0, model_tier=tier, model_name=name, estimated_cost_usd=0.0)


class Retriever:
    def __init__(
        self,
        db: RagDatabase,
        embedder: QueryEmbedder,
        reranker: Reranker,
        source_context: SourceContextResolver,
        settings: Optional[RagSettings] = None,
    ) -> None:
        self._db = db
        self._embedder = embedder
        self._reranker = reranker
        self._ctx = source_context
        self._settings = settings or db.settings

    async def _bounded(self, stage: str, awaitable: Awaitable[Any], deadline: Deadline,
                       timings: dict[str, float]) -> Any:
        """Run a stage under the remaining budget and record its latency."""
        started = time.monotonic()
        try:
            return await asyncio.wait_for(awaitable, timeout=deadline.require(stage))
        except asyncio.TimeoutError as exc:
            raise RetrievalTimeoutError(f"stage '{stage}' exceeded the retrieval deadline", stage=stage) from exc
        finally:
            elapsed = time.monotonic() - started
            timings[stage] = round(elapsed * 1000, 2)
            metrics.observe("rag_stage_latency_seconds", elapsed, stage=stage)

    async def retrieve(
        self,
        query_text: str,
        team_id: str,
        *,
        filters: Optional[RetrievalFilters] = None,
        as_of: Optional[datetime] = None,
        timezone_name: str = "UTC",
        deadline_ms: Optional[int] = None,
        mode: Optional[RetrievalMode] = None,
        request_id: Optional[str] = None,
        profile: Optional[RetrievalProfile] = None,
    ) -> RetrievalPipelineResult:
        cfg = self._settings
        started = time.monotonic()
        timings: dict[str, float] = {}
        reasons: list[str] = []
        mode = mode or cfg.retrieval_mode
        filters = filters or RetrievalFilters()

        # 0-1. validate + process (raises RagValidationError → 400)
        check_team_id(team_id)
        processed = process_query(query_text, max_chars=cfg.max_query_chars, max_tokens=cfg.lexical_max_tokens,
                                  min_len=cfg.lexical_min_token_len)
        deadline = Deadline(deadline_ms or cfg.retrieval_deadline_ms)
        prompt_version = load_rerank_prompt().version

        def empty(extra_reason: Optional[str] = None, embed_cost: Optional[CostRecord] = None) -> RetrievalPipelineResult:
            if extra_reason:
                reasons.append(extra_reason)
            timings["total"] = round((time.monotonic() - started) * 1000, 2)
            metrics.inc("rag_retrieval_no_context_total")
            return RetrievalPipelineResult(
                query_hash=processed.query_hash, retrieval_mode=mode, stage_timings_ms=timings,
                degraded=bool(reasons), degrade_reasons=reasons, retrieval_confidence=0.0,
                no_relevant_context=True, reranker_prompt_version=prompt_version,
                embedding_cost=embed_cost or _zero(), reranking_cost=_zero(ModelTier.MINI, "none"),
            )

        shared = filters.shared_fields()
        if shared["meeting_ids"] == []:                       # access scope ∩ request is empty: nothing may be seen
            return empty("access_scope_empty")

        # 2. embed (mandatory)
        embedding = await self._bounded(
            "embed", self._embedder.embed_query_detailed(processed.normalized_text, team_id=team_id,
                                                         request_id=request_id), deadline, timings)
        vector = embedding.vector

        # 3. legs in parallel
        use_vector = mode is not RetrievalMode.LEXICAL_ONLY
        use_lexical = mode is not RetrievalMode.VECTOR_ONLY
        if use_lexical and not processed.tokens:
            use_lexical = False
            metrics.inc("rag_lexical_skipped_total", reason="no_tokens")
            if mode is RetrievalMode.LEXICAL_ONLY:
                return empty("no_lexical_tokens", embedding.cost)

        async def vector_leg() -> list[VectorSearchResult]:
            q = VectorSearchQuery(team_id=team_id, query_embedding=vector, top_k=cfg.hybrid_leg_top_k, **shared)
            return await vs.similarity_search(self._db, q)

        async def lexical_leg() -> list[VectorSearchResult]:
            q = LexicalSearchQuery(team_id=team_id, query_embedding=vector, tokens=processed.tokens,
                                   top_k=cfg.hybrid_leg_top_k, rank_normalization=cfg.lexical_rank_normalization,
                                   **shared)
            return await vs.lexical_search(self._db, q)

        legs: dict[str, Awaitable[Any]] = {}
        if use_vector:
            legs["vector"] = self._bounded("vector", vector_leg(), deadline, timings)
        if use_lexical:
            legs["lexical"] = self._bounded("lexical", lexical_leg(), deadline, timings)
        outcomes = dict(zip(legs, await asyncio.gather(*legs.values(), return_exceptions=True)))

        vector_hits: list[VectorSearchResult] = []
        lexical_hits: list[VectorSearchResult] = []
        if "vector" in outcomes:
            if isinstance(outcomes["vector"], BaseException):
                raise outcomes["vector"]                      # primary leg: the request fails
            vector_hits = outcomes["vector"]
        if "lexical" in outcomes:
            if isinstance(outcomes["lexical"], BaseException):
                if isinstance(outcomes["lexical"], asyncio.CancelledError):
                    raise outcomes["lexical"]
                log.warning("lexical_leg_failed", error_type=type(outcomes["lexical"]).__name__)
                metrics.inc("rag_lexical_skipped_total", reason="error")
                reasons.append("lexical_leg_failed")
                if mode is RetrievalMode.LEXICAL_ONLY:
                    raise outcomes["lexical"]
            else:
                lexical_hits = outcomes["lexical"]

        # 4. fuse. The noise floor discards weak, purely-semantic hits — but NOT for scoped queries.
        # "What was said in standup last Thursday?" describes the CONTAINER, so its answer's chunks have
        # little content overlap and a low cosine by nature; the date/meeting filter already bounds the
        # pool, and relevance within it is the re-ranker's job. (Found by the eval: temporal recall@20
        # was 0.40 with the floor, 1.00 without.)
        scoped = shared["date_range"] is not None or shared["meeting_ids"] is not None
        floor = 0.0 if (scoped or mode is RetrievalMode.LEXICAL_ONLY) else cfg.noise_floor_similarity
        t0 = time.monotonic()
        candidates = fuse(
            vector_hits, lexical_hits, rrf_k=cfg.rrf_k, weight_vector=cfg.rrf_weight_vector,
            weight_lexical=cfg.rrf_weight_lexical, per_source_cap=cfg.max_chunks_per_source_in_candidates,
            noise_floor=floor,
            top_k=(profile.candidate_count if profile and profile.candidate_count else cfg.similarity_top_k),
        )
        timings["fusion"] = round((time.monotonic() - t0) * 1000, 2)
        for leg in ("vector", "lexical", "both"):
            n = sum(1 for c in candidates if c.retrieval_legs == leg)
            if n:
                metrics.inc("rag_candidate_leg_mix", n, leg=leg)
        if not candidates:
            return empty(None, embedding.cost)

        # 5. source context + orphan guard
        ctx = await self._bounded("source_ctx", self._ctx.resolve(candidates, team_id, timezone_name),
                                  deadline, timings)
        kept: list[ScoredChunk] = []
        for c in candidates:
            mid = meeting_id_of(c.chunk.source_type, c.chunk.source_id, c.chunk.metadata)
            if mid and mid in ctx.unresolved_meetings:
                metrics.inc("rag_citation_orphan_total")
                continue
            kept.append(c)
        candidates = kept
        if ctx.stale:
            reasons.append("source_context_stale")
        if not candidates:
            return empty(None, embedding.cost)

        # 6. rerank (never raises; may degrade)
        reranked, rerank_cost, rerank_reason, graded = await self._rerank(
            processed, candidates, ctx, as_of or datetime.now(timezone.utc), timezone_name, deadline, timings, filters,
            top_n=(profile.top_n if profile and profile.top_n else cfg.rerank_top_n))
        if rerank_reason:
            reasons.append(f"rerank:{rerank_reason}")

        # 7. citations (pure)
        t0 = time.monotonic()
        citations = build_citations(reranked, ctx, preview_chars=cfg.citation_preview_chars,
                                    timezone_name=timezone_name)
        timings["citations"] = round((time.monotonic() - t0) * 1000, 2)

        # 8. confidence
        confidence, no_context = self._confidence(reranked, graded, cfg)
        if no_context:
            metrics.inc("rag_retrieval_no_context_total")
        metrics.observe("rag_retrieval_confidence", confidence)
        timings["total"] = round((time.monotonic() - started) * 1000, 2)
        metrics.observe("rag_retrieval_latency_seconds", timings["total"] / 1000)
        log.info("retrieval_complete", request_id=request_id, team_id=team_id, query_hash=processed.query_hash,
                 mode=mode.value, candidates=len(candidates), reranked=len(reranked), graded=graded,
                 degraded=bool(reasons), reasons=reasons, no_context=no_context, timings_ms=timings)
        return RetrievalPipelineResult(
            query_hash=processed.query_hash, retrieval_mode=mode, candidates=candidates, reranked=reranked,
            citations=citations, stage_timings_ms=timings, degraded=bool(reasons), degrade_reasons=reasons,
            retrieval_confidence=confidence, no_relevant_context=no_context,
            reranker_prompt_version=prompt_version, embedding_cost=embedding.cost, reranking_cost=rerank_cost,
        )

    async def _rerank(self, processed: ProcessedQuery, candidates: list[ScoredChunk], ctx: SourceContext,
                      now: datetime, tz_name: str, deadline: Deadline, timings: dict[str, float],
                      filters: RetrievalFilters, top_n: Optional[int] = None) -> tuple[list[ScoredChunk], CostRecord, Optional[str], bool]:
        cfg = self._settings
        # Skip-when-small saves a model call, but a small set also gives NO abstention signal:
        # on a tiny tenant EVERY query would "retrieve" 5 irrelevant chunks and look confident.
        # So the skip is only allowed when the evidence is already strong (found by BOTH legs or
        # a high raw cosine); otherwise the grader runs even for a small set.
        confident = any(c.retrieval_legs == "both" or c.cosine_similarity >= cfg.rerank_skip_min_cosine
                        for c in candidates)
        request = build_rerank_request(processed.normalized_text, candidates, ctx, now=now, timezone_name=tz_name,
                                       top_n=top_n or cfg.rerank_top_n, char_budget=cfg.rerank_chunk_char_budget)
        started = time.monotonic()
        result = await self._reranker.rerank(request, query_hash=processed.query_hash, deadline=deadline,
                                             confident=confident)
        elapsed = time.monotonic() - started
        timings["rerank"] = round(elapsed * 1000, 2)
        metrics.observe("rag_stage_latency_seconds", elapsed, stage="rerank")

        selected: list[ScoredChunk] = []
        for rank, idx in enumerate(result.ordered_indices, start=1):
            chunk = candidates[idx]
            chunk.rerank_grade = result.grades.get(idx)
            chunk.final_rank = rank
            selected.append(chunk)
        return selected, result.cost, (result.degrade_reason if result.degraded else None), bool(result.grades)

    @staticmethod
    def _confidence(reranked: list[ScoredChunk], graded: bool, cfg: RagSettings) -> tuple[float, bool]:
        """(retrieval_confidence, no_relevant_context).

        GRADED (model ran): confidence = best grade / 3; no context when best grade <= NO_CONTEXT_MAX_GRADE
        (or everything was grade 0 and dropped).
        UNGRADED (fallback / skipped): weaker evidence, so confidence is the best raw cosine, and no
        context only when there is nothing, or the best hit is below the noise floor with no lexical support."""
        if not reranked:
            return 0.0, True
        if graded:
            best = max((c.rerank_grade or 0) for c in reranked)
            return round(best / 3.0, 4), best <= cfg.no_context_max_grade
        top = max(reranked, key=lambda c: c.cosine_similarity)
        weak = top.retrieval_legs == "vector" and top.cosine_similarity < cfg.noise_floor_similarity
        return round(top.cosine_similarity, 4), weak
