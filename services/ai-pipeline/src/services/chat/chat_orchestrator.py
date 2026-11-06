"""
services/chat/chat_orchestrator.py
──────────────────────────────────
POST /chat/query, in two phases (plan §4.1).

PREFLIGHT  (`ChatService.prepare`, runs in the route handler → real HTTP status codes)
    feature flag → sanitize → rate limit → breaker fast-fail → access scope + filter ownership →
    idempotency (409 / replay / proceed) → leases (user ≤ 2, session = 1, pod) → quota reserve (worst case) →
    cleanup registry. Any failure AFTER the user message was accepted marks it FAILED so a retry re-runs
    instead of waiting out a live lease, and releases whatever was acquired so far.

STREAM PHASE (`ChatService.run`, an independent task owned by SSEStream)
    meta → [rewrite] → intent → [analytics ∥ retrieve] → hydrate → relevance gate → context → sources →
    generate (scrubbed) → validate → citations → PERSIST → usage → done
    It is an explicit event pipeline (no value-returning async generator). Its `finally` runs `_finalize` SHIELDED:
    persist the (partial) answer, settle quota from the cost accumulator, write the ledger, emit the terminal event.
    Persisted text == streamed text, always.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Optional

import structlog

from src.api.sse import EventEmitter, run_shielded
from src.config.chat_config import ChatSettings
from src.models.chat_models import (
    ChatClaims, ChatFilters, ChatRequest, CitationsEvent, DoneEvent, ErrorEvent, FinishReason, Intent, MessageStatus,
    MetaEvent, SourcesEvent, StatusEvent, TokenEvent, UsageEvent,
)
from src.models.common import ModelTier
from src.models.rag_models import EmbeddingSource, RetrievalFilters, RetrievalPipelineResult, RetrievalProfile
from src.rag.errors import RagError
from src.rag.metrics import metrics
from src.repositories.chat_repository import AcceptResult, ChatRepository, FinalizeInput
from src.services.chat import canned, date_ranges
from src.services.chat.access_scope import resolve_access_scope
from src.services.chat.analytics_tools import AnalyticsResult, ToolContext, ToolParamError, run_tool, validate_call
from src.services.chat.commitment_hydrator import Hydration, hydrate
from src.services.chat.context_builder import BuiltContext, build_context
from src.services.chat.conversation_memory import ConversationMemory
from src.services.chat.cost_accumulator import CostAccumulator
from src.services.chat.data_store import ChatDataStore
from src.services.chat.entity_resolver import ResolvedMentions, resolve_mentions
from src.services.chat.errors import (
    ChatError, DependencyUnavailableError, DuplicateInFlightError, FeatureDisabledError, GenerationFailure,
    ModelUnavailableError, ProviderError, RateLimitedError, StreamCancelled,
)
from src.services.chat.grounding_guard import relevance_gate, validate_final
from src.services.chat.input_sanitizer import ValidatedFilters, requested_but_empty, sanitize_message, validate_filters
from src.services.chat.intent_router import IntentDecision, IntentRouter, PROFILES
from src.services.chat.llm import ChatStreamer, ProviderBreaker
from src.services.chat.quota_service import LedgerOutbox, QuotaService, Reservation
from src.services.chat.query_rewriter import QueryRewriter, RewriteResult
from src.services.chat.rate_limiter import RateLimiter
from src.services.chat.request_context import Clock, RequestContext, new_request_id, utc_now
from src.services.chat.stream_leases import StreamLease, StreamLeaseManager
from src.services.chat.stream_sanitizer import StreamScrubber
from src.services.chat.token_estimator import estimate_tokens, observe

log = structlog.get_logger(__name__)

TOKEN_CHUNK_CHARS = 400
_END = object()


@dataclass
class ChatDeps:
    settings: ChatSettings
    repo_factory: Callable[[str, str], ChatRepository]
    quota: QuotaService
    outbox: LedgerOutbox
    leases: StreamLeaseManager
    limiter: RateLimiter
    breaker: ProviderBreaker
    store: ChatDataStore
    retriever: Any
    streamer: ChatStreamer
    rewriter: QueryRewriter
    router: IntentRouter
    memory: ConversationMemory
    answer_model: Callable[[], str] = lambda: "gpt-4.1"
    clock: Clock = utc_now


@dataclass
class PreparedRun:
    ctx: RequestContext
    message: str
    accepted: AcceptResult
    reservation: Optional[Reservation]
    filters: ValidatedFilters
    requested: ChatFilters
    repo: ChatRepository
    replay: bool = False


@dataclass
class RunState:
    assistant_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    outcome: str = "pending"                     # completed | no_results | canned | cancelled | error
    finish: FinishReason = FinishReason.STOP
    error: Optional[GenerationFailure] = None
    text: str = ""
    intent: Optional[str] = None
    rewritten: Optional[str] = None
    included: list[Any] = field(default_factory=list)
    citations: dict[str, Any] = field(default_factory=dict)
    flags: list[str] = field(default_factory=list)
    prompt_versions: dict[str, str] = field(default_factory=dict)
    rerank_summary: dict[str, Any] = field(default_factory=dict)
    degraded: bool = False
    counts_as_query: bool = False
    tokens_streamed: bool = False
    gen_usage: Optional[tuple[int, int, bool]] = None      # (input, output, estimated)
    gen_estimated_input: int = 0
    timings: dict[str, float] = field(default_factory=dict)
    first_token_at: Optional[float] = None
    citations_emitted: bool = False
    started: float = field(default_factory=time.monotonic)


async def _anext(it: Any) -> Any:
    try:
        return await it.__anext__()
    except StopAsyncIteration:
        return _END


class ChatService:
    def __init__(self, deps: ChatDeps) -> None:
        self.d = deps
        self.cfg = deps.settings

    # ═════════════════════════════════════════════════════════════════════════
    # PREFLIGHT
    # ═════════════════════════════════════════════════════════════════════════

    async def prepare(self, claims: ChatClaims, req: ChatRequest) -> PreparedRun:
        d, cfg = self.d, self.cfg
        if not cfg.is_enabled_for(claims.team_id):
            metrics.inc("chat_feature_disabled_total")
            raise FeatureDisabledError(retry_after_s=60)
        message = sanitize_message(req.message, max_chars=cfg.chat_question_max_chars, max_tokens=cfg.chat_question_max_tokens)

        rate = await d.limiter.check(claims.team_id, claims.user_id)
        if not rate.allowed:
            raise RateLimitedError(retry_after_s=max(1, rate.retry_after_s))
        if d.breaker.is_open:
            metrics.inc("chat_breaker_fast_fail_total")
            raise ModelUnavailableError(retry_after_s=int(cfg.chat_breaker_open_s))     # no reservation, no stream

        ctx = RequestContext(claims=claims, request_id=claims.request_id or new_request_id(), clock=d.clock)
        try:
            ctx.access_scope = await resolve_access_scope(d.store, cfg, claims.team_id, claims.user_id)
            validated = await validate_filters(req.filters, team_id=claims.team_id, store=d.store, scope=ctx.access_scope)
        except ChatError:
            raise
        except Exception as exc:  # noqa: BLE001
            metrics.inc("chat_preflight_dependency_failed_total", error=type(exc).__name__)
            raise DependencyUnavailableError() from exc

        repo = d.repo_factory(claims.team_id, claims.user_id)
        accepted = await repo.accept_user_message(
            session_id=str(req.session_id) if req.session_id else None, text=message,
            client_message_id=str(req.client_message_id), request_id=ctx.request_id)
        if accepted.state == "in_flight":
            raise DuplicateInFlightError(accepted.active_request_id or "")
        if accepted.state == "completed":
            metrics.inc("chat_replay_total")
            return PreparedRun(ctx, message, accepted, None, validated, req.filters, repo, replay=True)

        lease: Optional[StreamLease] = None
        reservation: Optional[Reservation] = None
        try:
            lease = await d.leases.acquire(team_id=claims.team_id, user_id=claims.user_id, session_id=accepted.session_id)
            reservation = await d.quota.reserve(team_id=claims.team_id, user_id=claims.user_id, plan=claims.plan,
                                                client_message_id=str(req.client_message_id), now_local=ctx.as_of)
        except BaseException:
            if lease is not None:
                await lease.release()
            await repo.mark_user_message(accepted.user_message_id, MessageStatus.FAILED, ctx.request_id)
            raise
        ctx.cleanup.register("ledger_flush", d.outbox.flush)                     # LIFO: runs last
        ctx.cleanup.register("lease", lease.release)
        res = reservation
        ctx.cleanup.register("quota_safety_net", lambda: d.quota.release(res))   # idempotent: no-op once settled
        return PreparedRun(ctx, message, accepted, reservation, validated, req.filters, repo)

    def producer(self, p: PreparedRun) -> Callable[[EventEmitter], Awaitable[None]]:
        return (lambda em: self.run_replay(p, em)) if p.replay else (lambda em: self.run(p, em))

    # ═════════════════════════════════════════════════════════════════════════
    # REPLAY (idempotent retry of a completed message: free, no model, no quota)
    # ═════════════════════════════════════════════════════════════════════════

    async def run_replay(self, p: PreparedRun, em: EventEmitter) -> None:
        a = p.accepted.assistant or {}
        try:
            await em.emit(MetaEvent(request_id=p.ctx.request_id, session_id=p.accepted.session_id,
                                    message_id=str(a.get("_id", "")), replayed=True))
            refs = [r for r in (a.get("source_refs") or [])]
            from src.models.chat_models import SourceItem
            items = []
            for r in refs:
                try:
                    items.append(SourceItem.model_validate({k: v for k, v in r.items() if k in SourceItem.model_fields}))
                except ValueError:
                    continue
            if items:
                await em.emit(SourcesEvent(sources=items))
            text = a.get("content") or ""
            for i in range(0, len(text), TOKEN_CHUNK_CHARS):
                await em.emit(TokenEvent(t=text[i:i + TOKEN_CHUNK_CHARS]))
            cit = a.get("citations") or {}
            if a.get("finish_reason") in (FinishReason.STOP.value, FinishReason.LENGTH.value, FinishReason.FILTERED.value) and cit:
                await em.emit(CitationsEvent(valid=cit.get("valid", []), removed=cit.get("removed", []),
                                             grounded=cit.get("grounded", True), flags=cit.get("flags", [])))
                u = a.get("usage") or {}
                await em.emit(UsageEvent(input_tokens=int(u.get("input_tokens", 0)), output_tokens=int(u.get("output_tokens", 0)),
                                         quota_remaining=None))
            await em.emit(DoneEvent(finish_reason=a.get("finish_reason", "stop")))
        except StreamCancelled:
            pass

    # ═════════════════════════════════════════════════════════════════════════
    # STREAM PHASE
    # ═════════════════════════════════════════════════════════════════════════

    async def run(self, p: PreparedRun, em: EventEmitter) -> None:
        st = RunState()
        pending_cancel: Optional[BaseException] = None
        try:
            await self._pipeline(p, em, st)
        except StreamCancelled:
            st.outcome = "cancelled"
        except asyncio.CancelledError as exc:
            st.outcome, pending_cancel = "cancelled", exc
        except GenerationFailure as exc:
            st.outcome, st.error = "error", exc
        except Exception as exc:  # noqa: BLE001
            metrics.inc("chat_pipeline_crash_total", error=type(exc).__name__)
            log.error("chat_pipeline_crash", request_id=p.ctx.request_id, error_type=type(exc).__name__)
            st.outcome, st.error = "error", GenerationFailure("INTERNAL", "Something went wrong.", retryable=True)
        finally:
            await run_shielded(self._finalize(p, em, st), self.cfg.chat_cleanup_timeout_s * 2)
        if pending_cancel is not None:
            raise pending_cancel

    # ── helpers ──────────────────────────────────────────────────────────────

    def _check_cancel(self, ctx: RequestContext) -> None:
        if ctx.cancel.is_set:
            raise StreamCancelled(ctx.cancel.reason or "cancelled")

    async def _race(self, ctx: RequestContext, awaitable: Awaitable[Any], timeout_s: float) -> Any:
        """Await with a deadline = min(stage timeout, remaining total), abandoning on cancel."""
        budget = min(timeout_s, ctx.remaining_s(self.cfg.chat_total_timeout_s))
        if budget <= 0:
            raise asyncio.TimeoutError()
        task = asyncio.ensure_future(awaitable)
        waiter = asyncio.ensure_future(ctx.cancel.wait())
        try:
            done, _ = await asyncio.wait({task, waiter}, timeout=budget, return_when=asyncio.FIRST_COMPLETED)
            if task in done:
                return task.result()
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
            if ctx.cancel.is_set:
                raise StreamCancelled(ctx.cancel.reason or "cancelled")
            raise asyncio.TimeoutError()
        finally:
            waiter.cancel()

    async def _emit_text(self, em: EventEmitter, st: RunState, text: str) -> None:
        for i in range(0, len(text), TOKEN_CHUNK_CHARS):
            await self._emit_token(em, st, text[i:i + TOKEN_CHUNK_CHARS])

    async def _emit_token(self, em: EventEmitter, st: RunState, piece: str) -> None:
        if st.first_token_at is None:
            st.first_token_at = time.monotonic()
        st.text += piece
        st.tokens_streamed = True
        await em.emit(TokenEvent(t=piece))

    def _lap(self, st: RunState, name: str, t0: float) -> None:
        st.timings[name] = round((time.monotonic() - t0) * 1000, 2)
        metrics.observe("chat_stage_seconds", time.monotonic() - t0, stage=name)

    async def _canned_finish(self, p: PreparedRun, em: EventEmitter, st: RunState, text: str, *, outcome: str,
                             counts: bool) -> None:
        st.outcome, st.finish = outcome, FinishReason.NO_RESULTS if outcome == "no_results" else FinishReason.STOP
        st.counts_as_query = counts
        await self._emit_text(em, st, text)

    # ── the pipeline ─────────────────────────────────────────────────────────

    async def _pipeline(self, p: PreparedRun, em: EventEmitter, st: RunState) -> None:
        d, cfg, ctx = self.d, self.cfg, p.ctx
        loop_t0 = time.monotonic()
        await em.emit(MetaEvent(request_id=ctx.request_id, session_id=p.accepted.session_id, message_id=st.assistant_id))
        st.timings["first_event_ms"] = round((time.monotonic() - st.started) * 1000, 2)

        # ── history / memory ────────────────────────────────────────────────
        session = await p.repo.get_session(p.accepted.session_id)
        window = await d.memory.window(p.repo, session, exclude_id=p.accepted.user_message_id)
        self._check_cancel(ctx)

        # ── rewrite (follow-ups only) ───────────────────────────────────────
        rewrite = RewriteResult(standalone=p.message)
        if window.turns:
            await em.emit(StatusEvent(stage="rewriting"))
            t = time.monotonic()
            rewrite = await d.rewriter.rewrite(p.message, window.turns, ctx.cost)
            self._lap(st, "rewrite", t)
            st.prompt_versions["condense"] = d.rewriter.prompt_version
        question = rewrite.standalone
        st.rewritten = question if question != p.message else None
        self._check_cancel(ctx)

        # ── intent ──────────────────────────────────────────────────────────
        t = time.monotonic()
        decision = await d.router.route(question, ctx.as_of, ctx.cost)
        self._lap(st, "intent", t)
        st.intent = decision.kind.value
        st.prompt_versions["intent"] = d.router.prompt_version
        if decision.source == "classifier":
            st.flags.append("intent_classifier")
        self._check_cancel(ctx)

        if decision.kind is Intent.CHITCHAT:
            return await self._canned_finish(p, em, st, canned.CHITCHAT, outcome="canned", counts=cfg.chat_count_chitchat_as_query)
        if decision.kind is Intent.OUT_OF_SCOPE:
            return await self._canned_finish(p, em, st, canned.OUT_OF_SCOPE, outcome="canned", counts=cfg.chat_count_chitchat_as_query)

        # ── entities and dates ──────────────────────────────────────────────
        mentions = list(dict.fromkeys([*rewrite.mentions, *decision.owner_mentions]))
        resolved = ResolvedMentions()
        if mentions:
            resolved = resolve_mentions(mentions, await d.store.roster(ctx.team_id))
        extracted = decision.date_range
        if extracted is None and rewrite.date_phrase:
            extracted = date_ranges.resolve(rewrite.date_phrase, ctx.as_of)       # the model copies the phrase; WE resolve it
        ui_range = (p.filters.date_from, p.filters.date_to) if p.filters.date_from and p.filters.date_to else None
        merged, empty = date_ranges.intersect(ui_range, (extracted.date_from, extracted.date_to) if extracted else None)  # type: ignore[arg-type]
        detail: dict[str, Any] = {"question": question}
        if merged:
            detail["date_range"] = {"from": merged[0].isoformat(), "to": merged[1].isoformat(),
                                    "convention": date_ranges.CONVENTION, "label": extracted.label if extracted else "filter"}
        if resolved.items:
            detail["people"] = [{"mention": r.mention, "names": list(r.names)} for r in resolved.items]
        if empty:
            return await self._canned_finish(p, em, st, canned.EMPTY_FILTER, outcome="no_results", counts=cfg.chat_count_no_results_as_query)
        if requested_but_empty(p.requested.meeting_ids, p.filters.meeting_ids):
            return await self._canned_finish(p, em, st, canned.UNKNOWN_FILTER_IDS, outcome="no_results", counts=cfg.chat_count_no_results_as_query)

        notes: list[str] = []
        if resolved.note():
            notes.append(resolved.note())
        if merged:
            notes.append(f"Date range applied to the search: {merged[0].isoformat()} to {merged[1].isoformat()} ({date_ranges.CONVENTION}).")
        if len(p.filters.speaker_ids) > 1:
            notes.append("Only one speaker filter can be applied at a time; the search was not restricted by speaker.")
            metrics.inc("chat_speaker_filter_ignored_total")

        await em.emit(StatusEvent(stage="searching", detail=detail))

        # ── analytics ∥ retrieval ───────────────────────────────────────────
        profile = PROFILES[decision.kind]
        analytics_calls = self._plan_tools(decision, resolved, merged)
        if decision.kind is Intent.ANALYTICS and not analytics_calls:
            decision.kind, decision.needs_rag = Intent.LOOKUP, True               # e.g. the named person isn't on the team
            profile = PROFILES[Intent.LOOKUP]
        want_rag = decision.needs_rag and profile.candidates > 0
        t = time.monotonic()
        a_task = asyncio.ensure_future(self._run_analytics(ctx, analytics_calls, p)) if analytics_calls else None
        r_task = asyncio.ensure_future(self._retrieve(p, decision, resolved, question, merged, profile)) if want_rag else None
        try:
            analytics: list[AnalyticsResult] = await a_task if a_task else []
            retrieval: Optional[RetrievalPipelineResult] = None
            retrieval_error: Optional[BaseException] = None
            if r_task is not None:
                try:
                    retrieval = await r_task
                except StreamCancelled:
                    raise
                except Exception as exc:  # noqa: BLE001
                    retrieval_error = exc
        finally:
            for tsk in (a_task, r_task):
                if tsk is not None and not tsk.done():
                    tsk.cancel()
        self._lap(st, "retrieve", t)
        self._check_cancel(ctx)

        if retrieval is not None:
            ctx.cost.add_record("embed", retrieval.embedding_cost)
            ctx.cost.add_record("rerank", retrieval.reranking_cost)
            st.prompt_versions["rerank"] = retrieval.reranker_prompt_version or ""
            st.degraded = retrieval.degraded
            st.rerank_summary = {"degraded": retrieval.degraded, "reasons": retrieval.degrade_reasons,
                                 "confidence": retrieval.retrieval_confidence, "no_relevant_context": retrieval.no_relevant_context,
                                 "grades": [c.rerank_grade for c in retrieval.reranked]}
            if retrieval.degraded:
                notes.append("Re-ranking was unavailable, so relevance of the sources is approximate; say so if confidence is low.")
        if retrieval_error is not None and not analytics:
            metrics.inc("chat_retrieval_failed_total", error=type(retrieval_error).__name__)
            from src.rag.errors import RetrievalTimeoutError
            if isinstance(retrieval_error, (asyncio.TimeoutError, RetrievalTimeoutError)):
                raise GenerationFailure("TIMEOUT", "Searching took too long. Please try again.", retryable=True)
            raise GenerationFailure("INTERNAL", "Search is temporarily unavailable. Please try again.", retryable=True)
        if retrieval_error is not None:
            st.flags.append("retrieval_failed")
            st.degraded = True

        # ── hydrate (current commitment status, deleted ones dropped) ────────
        reranked = retrieval.reranked if retrieval else []
        t = time.monotonic()
        hydration = await hydrate(d.store, ctx.team_id, ctx.access_scope, reranked, timeout_s=cfg.chat_hydrate_timeout_s) if reranked else Hydration()
        self._lap(st, "hydrate", t)
        usable = [c for c in reranked if (c.chunk.source_type.value, c.chunk.source_id) not in hydration.dropped]

        # ── relevance gate ──────────────────────────────────────────────────
        gate = relevance_gate(intent=decision.kind, analytics_present=bool(analytics), retrieval=retrieval,
                              usable_rag_sources=len(usable), settings=cfg)
        st.rerank_summary["gate"] = gate.reason
        if not gate.passed:
            metrics.inc("chat_no_results_total", reason=gate.reason)
            await em.emit(StatusEvent(stage="reading"))
            return await self._canned_finish(p, em, st, canned.no_results_for(p.message), outcome="no_results",
                                             counts=cfg.chat_count_no_results_as_query)

        # ── context → sources → generate ────────────────────────────────────
        await em.emit(StatusEvent(stage="reading"))
        t = time.monotonic()
        built = build_context(
            settings=cfg, plan=ctx.plan, tz_name=ctx.tz_name, now_local=ctx.as_of, question=p.message,
            standalone=question if question != p.message else None, summary=window.summary, history=window.turns,
            analytics=analytics, chunks=reranked, citations=retrieval.citations if retrieval else [],
            hydration=hydration, notes=notes)
        self._lap(st, "context", t)
        st.included, st.prompt_versions["system"] = built.included, built.prompt_version
        st.gen_estimated_input = built.estimated_input_tokens
        await em.emit(SourcesEvent(sources=[s.item for s in built.included]))
        await em.emit(StatusEvent(stage="answering"))
        self._check_cancel(ctx)

        t = time.monotonic()
        await self._generate(p, em, st, built)
        self._lap(st, "generate", t)

    # ── tools ────────────────────────────────────────────────────────────────

    def _plan_tools(self, decision: IntentDecision, resolved: ResolvedMentions, merged: Optional[tuple[Any, Any]]) -> list[tuple[str, dict[str, Any]]]:
        calls: list[tuple[str, dict[str, Any]]] = []
        owner_ids = resolved.user_ids
        if decision.tool:
            params = dict(decision.tool_params)
            if decision.tool in ("count_commitments", "list_overdue_commitments", "find_commitments") and owner_ids:
                params["owner_ids"] = owner_ids[:10]
            if resolved.unresolved and decision.tool in ("count_commitments", "list_overdue_commitments"):
                return []              # asked about a person we can't find: answering for EVERYONE would be wrong
            if merged and decision.tool in ("count_commitments", "commitment_completion_rate", "meeting_count"):
                params["date_from"], params["date_to"] = merged[0].isoformat(), merged[1].isoformat()
            calls.append((decision.tool, params))
        if decision.secondary_tool and owner_ids and not calls:
            calls.append((decision.secondary_tool, {"owner_ids": owner_ids[:10], "limit": 10}))
        return calls

    async def _run_analytics(self, ctx: RequestContext, calls: list[tuple[str, dict[str, Any]]], p: PreparedRun) -> list[AnalyticsResult]:
        out: list[AnalyticsResult] = []
        tctx = ToolContext(team_id=ctx.team_id, tz=ctx.tz_name, today=ctx.today, as_of=ctx.as_of, scope=ctx.access_scope)
        for name, params in calls:
            try:
                spec, model = validate_call(name, params)
                res = await self._race(ctx, run_tool(self.d.store, spec, model, tctx, timeout_ms=int(self.cfg.chat_analytics_timeout_s * 1000)),
                                       self.cfg.chat_analytics_timeout_s + 0.5)
                out.append(res)
            except StreamCancelled:
                raise
            except (ToolParamError, asyncio.TimeoutError, Exception) as exc:  # noqa: BLE001 — continue without this source
                metrics.inc("chat_analytics_failed_total", tool=name, error=type(exc).__name__)
                log.warning("chat_analytics_failed", tool=name, error_type=type(exc).__name__)
        return out

    async def _retrieve(self, p: PreparedRun, decision: IntentDecision, resolved: ResolvedMentions, question: str,
                        merged: Optional[tuple[Any, Any]], profile: Any) -> RetrievalPipelineResult:
        ctx, cfg = p.ctx, self.cfg
        types = decision.source_types or (list(profile.source_types) if profile.source_types else None)
        meeting_ids: Optional[list[str]] = list(p.filters.meeting_ids) if p.filters.meeting_ids else None
        speaker_meta = {"speaker_user_id": p.filters.speaker_ids[0]} if len(p.filters.speaker_ids) == 1 else None
        filters = RetrievalFilters(
            source_types=[EmbeddingSource(t) for t in types] if types else None,
            date_range=(merged[0], merged[1]) if merged else None, meeting_ids=meeting_ids,
            metadata_filter=speaker_meta, access_scope=ctx.access_scope)
        names = resolved.canonical_names()
        query = question + (" " + " ".join(names) if names else "")            # lexical boost: canonical full names
        return await self._race(ctx, self.d.retriever.retrieve(
            query, ctx.team_id, filters=filters, as_of=ctx.as_of, timezone_name=ctx.tz_name,
            deadline_ms=int(cfg.chat_retrieval_timeout_s * 1000), request_id=ctx.request_id,
            profile=RetrievalProfile(candidate_count=profile.candidates, top_n=profile.top_n)),
            cfg.chat_retrieval_timeout_s + 0.5)

    # ── generation ───────────────────────────────────────────────────────────

    async def _next(self, it: Any, timeout_s: float, ctx: RequestContext) -> Any:
        task = asyncio.ensure_future(_anext(it))
        waiter = asyncio.ensure_future(ctx.cancel.wait())
        try:
            done, _ = await asyncio.wait({task, waiter}, timeout=timeout_s, return_when=asyncio.FIRST_COMPLETED)
            if task in done:
                return task.result()
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
            if ctx.cancel.is_set:
                raise StreamCancelled(ctx.cancel.reason or "cancelled")
            raise asyncio.TimeoutError()
        finally:
            waiter.cancel()

    async def _generate(self, p: PreparedRun, em: EventEmitter, st: RunState, built: BuiltContext) -> None:
        d, cfg, ctx = self.d, self.cfg, p.ctx
        scrub = StreamScrubber(built.source_ids, built.canary)
        provider_usage: Optional[tuple[int, int]] = None
        provider_finish: Optional[str] = None
        attempt = 0
        try:
            while True:
                attempt += 1
                if not d.breaker.allow():
                    raise GenerationFailure("MODEL_UNAVAILABLE", "The assistant is temporarily unavailable.", retryable=True)
                it = d.streamer.stream(system=built.system, user=built.user, max_tokens=cfg.max_output_tokens(ctx.plan),
                                       temperature=cfg.chat_answer_temperature).__aiter__()
                error: Optional[GenerationFailure] = None
                try:
                    while True:
                        self._check_cancel(ctx)             # a fast stream is always "ready": the race alone would not notice a cancel
                        timeout = cfg.chat_idle_timeout_s if scrub.text else cfg.chat_first_token_timeout_s
                        timeout = min(timeout, ctx.remaining_s(cfg.chat_total_timeout_s))
                        if timeout <= 0:
                            raise asyncio.TimeoutError()
                        delta = await self._next(it, timeout, ctx)
                        if delta is _END:
                            break
                        if delta.usage:
                            provider_usage = delta.usage
                        if delta.finish_reason:
                            provider_finish = delta.finish_reason
                        if delta.text:
                            safe = scrub.feed(delta.text)
                            if safe:
                                await self._emit_token(em, st, safe)
                            if scrub.tripped:
                                break
                    d.breaker.record(True)
                except asyncio.TimeoutError:
                    d.breaker.record(False)
                    error = GenerationFailure("TIMEOUT", "The assistant took too long to respond.", retryable=True)
                except ProviderError as pe:
                    if pe.counts_for_breaker:
                        d.breaker.record(False)
                    if pe.kind == "filtered":
                        provider_finish = "filtered"
                    elif pe.kind == "client":
                        error = GenerationFailure("INTERNAL", "The request could not be processed.", retryable=False)
                    else:
                        error = GenerationFailure("MODEL_UNAVAILABLE", "The assistant is temporarily unavailable.", retryable=True)
                finally:
                    aclose = getattr(it, "aclose", None)
                    if aclose is not None:
                        try:
                            await aclose()
                        except Exception:  # noqa: BLE001
                            pass
                if error is None:
                    break
                if scrub.text:
                    # tokens already reached the client: no silent retry (would duplicate text)
                    st.finish = FinishReason.ERROR
                    raise error
                if attempt >= 2 or ctx.cancel.is_set:
                    raise error
                metrics.inc("chat_generation_retry_total")
        finally:
            produced = scrub.text
            if provider_usage is not None:
                st.gen_usage = (provider_usage[0], provider_usage[1], False)
                observe(built.estimated_input_tokens, provider_usage[0])
            elif produced:                                    # cancelled / failed mid-stream: no provider usage → ESTIMATE
                st.gen_usage = (built.estimated_input_tokens, estimate_tokens(produced), True)
            # else: nothing was produced and nothing was reported → nothing to charge (pre-token failure releases quota)

        tail = scrub.finish()
        if tail:
            await self._emit_token(em, st, tail)
        if scrub.tripped:
            metrics.inc("chat_canary_trip_total")
            log.error("chat_canary_tripped", request_id=ctx.request_id, team_hash=hash(ctx.team_id) & 0xFFFF)   # alert: page on any
            await self._emit_token(em, st, canned.SAFE_REPLACEMENT)
            st.finish, st.outcome, st.counts_as_query = FinishReason.FILTERED, "completed", True
            st.flags.append("canary_tripped")
        elif provider_finish == "filtered" and not scrub.text:
            await self._emit_token(em, st, canned.CONTENT_FILTERED)
            st.finish, st.outcome, st.counts_as_query = FinishReason.FILTERED, "completed", False
        else:
            st.finish = {"length": FinishReason.LENGTH, "filtered": FinishReason.FILTERED}.get(provider_finish or "", FinishReason.STOP)
            st.outcome, st.counts_as_query = "completed", True
            if st.finish is FinishReason.LENGTH:
                metrics.inc("chat_truncated_total")
        for k, v in scrub.report.strips.items():
            metrics.inc("chat_scrubber_strips_total", v, kind=k)

        report = validate_final(scrub.text, built.included, scrub_removed=scrub.report.removed)
        st.flags.extend(report.flags)
        st.citations = {"valid": report.valid, "removed": report.removed, "grounded": report.grounded, "flags": report.flags}
        await em.emit(CitationsEvent(valid=report.valid, removed=report.removed, grounded=report.grounded, flags=report.flags))
        st.citations_emitted = True

    # ═════════════════════════════════════════════════════════════════════════
    # FINALIZE (shielded): persist → settle quota → ledger → terminal events
    # ═════════════════════════════════════════════════════════════════════════

    async def _finalize(self, p: PreparedRun, em: EventEmitter, st: RunState) -> None:
        d, cfg, ctx = self.d, self.cfg, p.ctx
        total_ms = round((time.monotonic() - st.started) * 1000, 2)

        # 0. generation cost (exactly once, estimated when the provider never sent usage — e.g. a cancel)
        if st.gen_usage is not None:
            tin, tout, est = st.gen_usage
            ctx.cost.add_usage("generate", model=d.answer_model(), tier=ModelTier.FULL, input_tokens=tin, output_tokens=tout, estimated=est)

        # 1. persist the assistant message (never silently lose an answer the user already saw)
        persisted = False
        keep = bool(st.text) or st.outcome in ("completed", "no_results", "canned")
        if st.outcome == "error" and not st.text:
            keep = False
        if keep:
            status = {"cancelled": "cancelled", "error": "error"}.get(st.outcome, "answered")
            finish = {"cancelled": FinishReason.CANCELLED, "error": FinishReason.ERROR}.get(st.outcome, st.finish)
            gin, gout = ctx.cost.generation_tokens()
            fin = FinalizeInput(
                user_message_id=p.accepted.user_message_id, assistant_id=st.assistant_id, run_id=ctx.request_id, content=st.text,
                status=status, finish_reason=finish.value, intent=st.intent, rewritten_query=st.rewritten,
                source_refs=[{**s.item.model_dump(mode="json"), "grade": (s.chunk.rerank_grade if s.chunk else None)} for s in st.included],
                citations=st.citations,
                usage={"input_tokens": gin, "output_tokens": gout, "cost_usd": ctx.cost.total_cost_usd, "by_stage": ctx.cost.by_stage(),
                       "estimated": ctx.cost.any_estimated},
                prompt_versions=st.prompt_versions, rerank_summary=st.rerank_summary,
                latency={**st.timings, "ttft_ms": round((st.first_token_at - st.started) * 1000, 2) if st.first_token_at else 0.0,
                         "total_ms": total_ms},
                flags=st.flags, degraded=st.degraded)
            for attempt in range(3):
                try:
                    await asyncio.wait_for(p.repo.finalize_assistant_message(fin, p.accepted.session_id), cfg.chat_persist_timeout_s)
                    persisted = True
                    break
                except Exception as exc:  # noqa: BLE001
                    metrics.inc("chat_persist_retry_total", error=type(exc).__name__)
                    await asyncio.sleep(0.05 * (2 ** attempt))
            if not persisted:
                metrics.inc("chat_persist_failed_total")
                log.error("chat_persist_failed", request_id=ctx.request_id)      # the user saw an answer absent from history: alert

        # 2. user-message status (only the run that owns the lease may change it)
        status_map = {"completed": MessageStatus.ANSWERED, "no_results": MessageStatus.ANSWERED,
                      "canned": MessageStatus.ANSWERED, "cancelled": MessageStatus.CANCELLED, "error": MessageStatus.FAILED}
        try:
            await p.repo.mark_user_message(p.accepted.user_message_id, status_map.get(st.outcome, MessageStatus.FAILED), ctx.request_id)
        except Exception as exc:  # noqa: BLE001
            metrics.inc("chat_status_update_failed_total", error=type(exc).__name__)

        # 3. quota: commit actuals (cancel/error → estimated partial cost), or release when nothing was spent
        counts = st.counts_as_query or (st.outcome == "cancelled" and st.tokens_streamed)
        remaining: Optional[int] = None
        if p.reservation is not None:
            remaining = await d.quota.settle(p.reservation, ctx.cost, counts_as_query=counts)

        # 4. ledger (outbox → Postgres, flushed in cleanup as well)
        try:
            category = "unmetered" if (p.reservation and p.reservation.unmetered) else "chat"
            await d.outbox.enqueue(d.outbox.rows_for(request_id=ctx.request_id, team_id=ctx.team_id, user_id=ctx.user_id,
                                                     cost=ctx.cost, counts_as_query=counts, category=category, now=ctx.clock()))
        except Exception as exc:  # noqa: BLE001
            metrics.inc("chat_ledger_enqueue_failed_total", error=type(exc).__name__)

        # 5. terminal events (best effort: the consumer may be gone)
        try:
            if st.outcome == "error" and st.error is not None:
                await em.emit(ErrorEvent(code=st.error.code, message=st.error.public_message, retryable=st.error.retryable))  # type: ignore[arg-type]
            elif st.outcome == "cancelled":
                await em.emit(DoneEvent(finish_reason="cancelled"))
            else:
                if st.citations_emitted:
                    gin, gout = ctx.cost.generation_tokens()
                    await em.emit(UsageEvent(input_tokens=gin, output_tokens=gout, quota_remaining=remaining))
                await em.emit(DoneEvent(finish_reason=st.finish.value))     # type: ignore[arg-type]
        except StreamCancelled:
            pass

        # 6. memory: fold old turns into the summary AFTER the response, off the hot path
        if st.outcome == "completed" and persisted:
            async def sink(cost: CostAccumulator) -> None:
                rows = d.outbox.rows_for(request_id=f"{ctx.request_id}:memory", team_id=ctx.team_id, user_id=ctx.user_id,
                                         cost=cost, counts_as_query=False, category="system", now=ctx.clock())
                await d.outbox.enqueue(rows)
                await d.outbox.flush()
            d.memory.schedule_summary(p.repo, p.accepted.session_id, sink)

        reason = st.outcome if st.outcome in ("error", "cancelled") else st.finish.value
        metrics.inc("chat_requests_total", intent=st.intent or "none", finish_reason=reason)
        metrics.observe("chat_total_seconds", total_ms / 1000)
        if st.first_token_at:
            metrics.observe("chat_ttft_seconds", st.first_token_at - st.started)
        if st.outcome == "cancelled":
            metrics.inc("chat_cancel_total", phase="after_tokens" if st.tokens_streamed else "before_tokens")
        log.info("chat_request_done", request_id=ctx.request_id, outcome=st.outcome, intent=st.intent, finish=st.finish.value,
                 total_ms=total_ms, cost_usd=ctx.cost.total_cost_usd, sources=len(st.included), degraded=st.degraded,
                 persisted=persisted, flags=st.flags)
