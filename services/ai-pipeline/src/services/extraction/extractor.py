"""
services/extraction/extractor.py — v2 (AI Pipeline Upgrade)
────────────────────────────────────────────────────────────
Pipeline for one meeting:

  1. Resolve meeting type (request.meeting_type, else inferred from the title)
  2. Chunk transcript by speaker turn groups
  3. Per chunk (bounded concurrency):
       a. Render the meeting-type-specific user prompt (prompt_router.py)
       b. Run 5 structured extractors + partial summary in parallel (primary model)
       c. Confidence gate (confidence_gate.py): low-confidence or failed
          extractors are re-run on the fallback model (gpt-4.1 by default) and merged
  4. Merge chunk results with similarity-based cross-chunk dedup
  5. Hierarchical meta-summary for multi-chunk meetings
  6. Batch date-parse commitment due dates

Every AI call is grouped under one LangSmith trace per meeting when tracing is
enabled (services/tracing) — the trace context is propagated via ContextVar.

Preserved from v1 (unchanged behaviour):
  FIX 1 — return_exceptions=True in asyncio.gather() (per-chunk isolation)
  FIX 2 — Hierarchical summary for multi-chunk meetings
  FIX 3 — Jinja2 StrictUndefined rendering (injection-safe) — now in prompt_router
  FIX 4 — Similarity-based cross-chunk dedup for decisions/blockers/risks
"""

from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass
from typing import Any, Callable, List, Optional

import structlog
from pydantic import BaseModel

from src.config.extraction_config import (
    CONFIDENCE_FLOOR,
    EXTRACTION_CHUNK_MAX_TOKENS,
    EXTRACTION_CHUNK_OVERLAP_TURNS,
    EXTRACTOR_CHUNK_CONCURRENCY,
)
from src.config.settings import get_settings
from src.models.chunk_models import ChunkingStrategy, TextChunk, TranscriptContent
from src.models.common import AICallResult, CostRecord, TaskType
from src.models.extraction_models import (
    ActionItemsResponse,
    BlockersResponse,
    ChunkExtractionResult,
    CommitmentsResponse,
    DecisionsResponse,
    ExtractionResultWithMeta,
    ExtractRequest,
    MeetingType,
    PartialExtractionFailure,
    RisksResponse,
    StructuredSummary,
    SummaryScopeType,
)
from src.services.ai_client_protocol import AIClientProtocol
from src.services.chunker import chunk_content
from src.services.extraction.action_item_parser import parse_action_item
from src.services.extraction.blocker_parser import parse_blocker
from src.services.extraction.commitment_parser import normalize_text, parse_commitment
from src.services.extraction.confidence_gate import ConfidenceGate, GateDecision
from src.services.extraction.decision_parser import parse_decision
from src.services.extraction.grounding import GroundingTurn, TranscriptIndex, ground_item
from src.services.extraction.prompt_router import (
    PromptLoadError,
    PromptRouter,
    prompt_bundle_version,
    prompt_versions,
    resolve_meeting_type,
    system_prompt,
)
from src.services.extraction.risk_parser import parse_risk
from src.services.language import (
    LanguageDetection,
    detect_language,
    detect_language_from_turns,
    language_directive,
)
from src.services.similarity import similarity_score
from src.services.tokenization import estimate_token_count
from src.services.tracing import (
    TraceContext,
    current_trace_context,
    get_tracer,
    trace_scope,
)

log = structlog.get_logger(__name__)

__all__ = ["extract", "PromptLoadError"]

# ─── Similarity threshold for cross-chunk entity dedup ───────────────────────
_CROSS_CHUNK_DEDUP_THRESHOLD: float = 0.70
"""Minimum similarity score for two decision/blocker/risk texts to be
considered the same entity across chunks. Slightly higher than the
commitment MATCH_THRESHOLD (0.65) because these entity types have less
normalization applied and we want higher precision."""


# ─── Extractor table ──────────────────────────────────────────────────────────


@dataclass(frozen=True)
class ExtractorSpec:
    name: str                                   # also the ChunkExtractionResult field suffix
    task_type: TaskType
    response_schema: type[BaseModel]
    response_field: str                         # list field on the response schema
    parser: Callable[[Any], Any]

    @property
    def result_field(self) -> str:
        return f"parsed_{self.name}"


EXTRACTORS: tuple[ExtractorSpec, ...] = (
    ExtractorSpec("commitments", TaskType.EXTRACT_COMMITMENTS, CommitmentsResponse, "commitments", parse_commitment),
    ExtractorSpec("action_items", TaskType.EXTRACT_ACTION_ITEMS, ActionItemsResponse, "action_items", parse_action_item),
    ExtractorSpec("decisions", TaskType.EXTRACT_DECISIONS, DecisionsResponse, "decisions", parse_decision),
    ExtractorSpec("blockers", TaskType.EXTRACT_BLOCKERS, BlockersResponse, "blockers", parse_blocker),
    ExtractorSpec("risks", TaskType.EXTRACT_RISKS, RisksResponse, "risks", parse_risk),
)
_EXTRACTORS_BY_NAME = {spec.name: spec for spec in EXTRACTORS}

# Fail fast at import if any prompt is missing (same guarantee as v1).
_SYSTEM_PROMPTS: dict[TaskType, str] = {
    spec.task_type: system_prompt(spec.task_type) for spec in EXTRACTORS
}
_SYSTEM_PROMPTS[TaskType.SUMMARY] = system_prompt(TaskType.SUMMARY)

_PROMPT_VERSION: str = prompt_bundle_version()
_PROMPT_VERSIONS: dict[str, str] = prompt_versions()
_ROUTER = PromptRouter()

_META_SUMMARY_SYSTEM = (
    "# prompt_version: meta-summary-v1.0\n"
    "You are a Principal Meeting Intelligence Engine. You receive multiple partial "
    "structured summaries (JSON) from consecutive sections of a long meeting. "
    "Synthesize ALL sections into a single, complete structured summary. "
    "Return ONLY a valid JSON object with these exact keys: "
    "meeting_purpose (string, 1-2 sentences), "
    "overview (string, 2-5 sentences, prose, max 150 words), "
    "key_takeaways (array of strings — high-signal insights, no action items), "
    "topics_discussed (array of {topic: string, bullets: string[]}), "
    "conclusions (array of strings — final outcomes only), "
    "decisions (array of strings — confirmed decisions only, never suggestions). "
    "Ground every point strictly in the partial summaries provided. "
    "Never hallucinate. Empty sections use '' or []. Past tense. No filler. "
    "LANGUAGE: write every text value in the OUTPUT LANGUAGE stated in the user message "
    "(the language the partial summaries are already written in) and never translate to "
    "English unless that is the OUTPUT LANGUAGE. Urdu stays in Urdu script, Hindi in "
    "Devanagari; keep names, numbers, dates and common English technical terms as written."
)


# ─── Evidence grounding ──────────────────────────────────────────────────────


@dataclass(frozen=True)
class _Grounding:
    """The transcript the models were given, indexed once per meeting."""

    index: TranscriptIndex
    participant_names: tuple[str, ...]

    @classmethod
    def for_request(cls, request: ExtractRequest) -> "_Grounding":
        return cls(
            index=TranscriptIndex(
                GroundingTurn(speaker=t.speaker_name, text=t.cleaned_text, start_time=t.start_time)
                for t in request.cleaned_transcript
            ),
            participant_names=tuple(p.name for p in request.participants),
        )


def _ground_chunk_result(
    result: ChunkExtractionResult, grounding: Optional[_Grounding]
) -> ChunkExtractionResult:
    """Verify each commitment / action item / decision against the transcript.

    See services/extraction/grounding.py. Runs BEFORE the confidence gate, so
    items without verifiable evidence lower the chunk confidence and are
    re-checked by the fallback model. Items left under CONFIDENCE_FLOOR are
    dropped — the floor was configured but previously never applied.
    """
    if grounding is None or not result.succeeded:
        return result
    idx = grounding.index

    commitments = [
        ground_item(c, idx, owner_field="owner_name", owner_must_be_speaker=True)
        for c in result.parsed_commitments or []
    ]

    action_items = []
    for a in result.parsed_action_items or []:
        grounded = ground_item(
            a, idx,
            owner_field="assignee_name",
            participant_names=grounding.participant_names,
            clear_unknown_owner=True,
        )
        if grounded.assignee_name != a.assignee_name:
            # Owner cleared → the dedup key must follow ("<assignee>::<text>").
            normalized = a.dedup_key.split("::", 1)[-1]
            grounded = grounded.model_copy(update={"dedup_key": f"unassigned::{normalized}"})
        action_items.append(grounded)

    decisions = [ground_item(d, idx) for d in result.parsed_decisions or []]

    def _floor(items: list) -> list:
        return [i for i in items if i.confidence >= CONFIDENCE_FLOOR]

    kept = {
        "parsed_commitments": _floor(commitments),
        "parsed_action_items": _floor(action_items),
        "parsed_decisions": _floor(decisions),
    }
    dropped = sum(len(v) for v in (commitments, action_items, decisions)) - sum(len(v) for v in kept.values())
    log.info(
        "chunk_grounding_applied",
        chunk_index=result.chunk_index,
        unverified=sum(1 for i in [*commitments, *action_items, *decisions] if not i.evidence_verified),
        dropped_below_floor=dropped,
    )
    return result.model_copy(update=kept)


# ─── Public entry point ───────────────────────────────────────────────────────


async def extract(
    request: ExtractRequest,
    ai_client: AIClientProtocol,
    fallback_client: Optional[AIClientProtocol] = None,
) -> ExtractionResultWithMeta | PartialExtractionFailure:
    """Run the full extraction pipeline for one meeting.

    Args:
        request: Fully populated ExtractRequest (validated upstream).
        ai_client: Process-singleton primary AI client.
        fallback_client: Optional fallback client (stronger OpenAI model or Claude). When None (or the
            confidence gate is disabled) the pipeline runs primary-only,
            exactly as before the upgrade.

    Returns:
        ExtractionResultWithMeta on full success, PartialExtractionFailure if
        any chunks failed (but at least one succeeded).
    """
    start_time = time.monotonic()

    if not request.participants:
        raise ValueError("Participant list cannot be empty")

    settings = get_settings()
    gate = (
        ConfidenceGate.from_settings(settings)
        if fallback_client is not None and settings.confidence_gate_enabled
        else None
    )
    meeting_type = resolve_meeting_type(request)
    language = detect_language_from_turns(request.cleaned_transcript)

    full_transcript_text = "\n".join(
        f"{t.speaker_name}: {t.cleaned_text}" for t in request.cleaned_transcript
    )
    total_transcript_tokens = estimate_token_count(full_transcript_text)

    chunks, _chunk_meta = chunk_content(
        content=TranscriptContent(turns=request.cleaned_transcript),
        strategy=ChunkingStrategy.SPEAKER_TURN_GROUPED,
        max_tokens=EXTRACTION_CHUNK_MAX_TOKENS,
        overlap_units=EXTRACTION_CHUNK_OVERLAP_TURNS,
    )

    log.info(
        "extraction_job_started",
        meeting_id=request.meeting_id,
        team_id=request.team_id,
        meeting_type=meeting_type.value,
        meeting_type_inferred=request.meeting_type is None,
        total_turns=len(request.cleaned_transcript),
        total_tokens_estimate=total_transcript_tokens,
        chunks_count=len(chunks),
        prompt_version=_PROMPT_VERSION,
        language=language.code,
        language_confidence=language.confidence,
        confidence_gate=gate is not None,
    )

    tracer = get_tracer()
    meeting_run = tracer.start_run(
        name="extract_meeting",
        inputs={"turns": len(request.cleaned_transcript), "chunks": len(chunks)},
        metadata={
            "meeting_id": request.meeting_id,
            "team_id": request.team_id,
            "meeting_type": meeting_type.value,
            "prompt_version": _PROMPT_VERSION,
            "prompt_versions": _PROMPT_VERSIONS,
            "confidence_gate_enabled": gate is not None,
        },
        run_type="chain",
        tags=["extraction", meeting_type.value, _PROMPT_VERSION],
    )
    ctx_token = current_trace_context.set(
        TraceContext(
            meeting_id=request.meeting_id,
            team_id=request.team_id,
            prompt_version=_PROMPT_VERSION,
            meeting_type=meeting_type.value,
            parent_run=meeting_run,
        )
    )

    grounding = _Grounding.for_request(request)

    try:
        extractor_semaphore = asyncio.Semaphore(EXTRACTOR_CHUNK_CONCURRENCY)
        total_chunks = len(chunks)

        async def _extract_one_chunk_safely(chunk: TextChunk) -> ChunkExtractionResult:
            async with extractor_semaphore:
                with trace_scope(chunk_index=chunk.chunk_index):
                    return await _extract_one_chunk(
                        chunk, request, ai_client, meeting_type, total_chunks,
                        gate=gate, fallback_client=fallback_client, language=language,
                        grounding=grounding,
                    )

        # FIX 1: return_exceptions=True — one chunk failing never discards the others.
        raw_results = await asyncio.gather(
            *(_extract_one_chunk_safely(chunk) for chunk in chunks), return_exceptions=True
        )

        chunk_results: List[ChunkExtractionResult] = []
        for i, r in enumerate(raw_results):
            if isinstance(r, BaseException):
                log.error(
                    "chunk_extraction_unhandled_exception",
                    chunk_index=i,
                    error_type=type(r).__name__,
                    error_detail=str(r),
                    meeting_id=request.meeting_id,
                )
                chunk_results.append(
                    ChunkExtractionResult(
                        chunk_id=f"chunk_{i}",
                        chunk_index=i,
                        succeeded=False,
                        is_first_chunk=(i == 0),
                        error=f"Unhandled: {type(r).__name__}: {r}",
                    )
                )
            else:
                chunk_results.append(r)

        merged_result = _merge_chunk_results(request, chunk_results, start_time, meeting_type)

        final_result = (
            merged_result.partial_result
            if isinstance(merged_result, PartialExtractionFailure)
            else merged_result
        )
        if final_result is not None:
            final_result.detected_language = language.code
            final_result.language_confidence = language.confidence
            await _enrich_result(final_result, chunk_results, request, ai_client, language)
            final_result.processing_time_ms = (time.monotonic() - start_time) * 1000

        tracer.end_run(
            meeting_run,
            outputs=_trace_outputs(merged_result),
            metadata={
                "fallback_chunks": final_result.fallback_chunks if final_result else 0,
                "chunks_total": len(chunk_results),
                "chunks_succeeded": sum(1 for r in chunk_results if r.succeeded),
            },
        )
        return merged_result
    except Exception as exc:
        tracer.end_run(meeting_run, error=f"{type(exc).__name__}: {str(exc)[:500]}")
        raise
    finally:
        current_trace_context.reset(ctx_token)


def _trace_outputs(result: ExtractionResultWithMeta | PartialExtractionFailure) -> dict[str, Any]:
    final = result.partial_result if isinstance(result, PartialExtractionFailure) else result
    if final is None:
        return {"succeeded": False}
    return {
        "succeeded": not isinstance(result, PartialExtractionFailure),
        "commitments": len(final.commitments),
        "action_items": len(final.action_items),
        "decisions": len(final.decisions),
        "blockers": len(final.blockers),
        "risks": len(final.risks),
        "cost_usd": final.total_cost.estimated_cost_usd,
        "providers_used": final.providers_used,
    }


async def _enrich_result(
    final_result: ExtractionResultWithMeta,
    chunk_results: List[ChunkExtractionResult],
    request: ExtractRequest,
    ai_client: AIClientProtocol,
    language: Optional[LanguageDetection] = None,
) -> None:
    """Post-merge enrichment: hierarchical summary + date parsing.

    Mutates final_result in place (both summary and commitment dates).
    """
    succeeded_chunks = [r for r in chunk_results if r.succeeded]

    # ── Hierarchical summary ──────────────────────────────────────────────────
    partial_summaries = [r.summary for r in succeeded_chunks if r.summary]

    def _summary_to_text(s: Any) -> str:
        """Flatten a StructuredSummary or plain str to text for meta-summary user prompt."""
        if isinstance(s, StructuredSummary):
            return json.dumps(s.model_dump(), ensure_ascii=False)
        return str(s) if s else ""

    if len(partial_summaries) > 1:
        combined = "\n\n---\n\n".join(
            f"[Section {i + 1} of {len(partial_summaries)}]:\n{_summary_to_text(s)}"
            for i, s in enumerate(partial_summaries)
        )
        user_prompt = (
            f"MEETING: {request.meeting_title}\n"
            f"DATE: {request.meeting_date.isoformat()}\n\n"
            f"{language_directive(language or detect_language(''))}\n\n"
            f"PARTIAL SUMMARIES:\n{combined}"
        )
        try:
            meta_result = await ai_client.generate_text(
                task_type=TaskType.SUMMARY,
                system_prompt=_META_SUMMARY_SYSTEM,
                user_prompt=user_prompt,
            )
            final_result.summary = StructuredSummary.from_raw(meta_result.data)
            final_result.summary_scope = SummaryScopeType.FULL
            log.info(
                "meta_summary_generated",
                meeting_id=request.meeting_id,
                partial_count=len(partial_summaries),
                meta_summary_chars=len(meta_result.data) if isinstance(meta_result.data, str) else 0,
            )
        except Exception as exc:
            log.warning(
                "meta_summary_failed_using_first_partial",
                meeting_id=request.meeting_id,
                error=str(exc)[:200],
            )
            # Graceful degradation: keep first partial summary
            final_result.summary = partial_summaries[0]
            final_result.summary_scope = SummaryScopeType.PARTIAL_FIRST_CHUNK

    # ── Date parsing for commitments ─────────────────────────────────────────
    if final_result.commitments:
        from src.models.date_models import DateParseRequest
        from src.services.date_parser import batch_parse_dates

        date_requests = []
        commitments_to_enrich = []
        for c in final_result.commitments:
            if c.due_date_raw:
                date_requests.append(
                    DateParseRequest(
                        raw_expression=c.due_date_raw,
                        meeting_datetime_utc=request.meeting_date,
                        team_timezone=request.team_timezone,
                        meeting_duration_minutes=(
                            int(request.meeting_duration_seconds / 60)
                            if request.meeting_duration_seconds
                            else None
                        ),
                    )
                )
                commitments_to_enrich.append(c)

        if date_requests:
            parse_results = await batch_parse_dates(date_requests, ai_client)
            for c, res in zip(commitments_to_enrich, parse_results):
                c.due_date_utc = res.resolved_datetime_utc
                c.due_date_resolution = res


# ─── Per-chunk extraction ────────────────────────────────────────────────────


async def _extract_one_chunk(
    chunk: TextChunk,
    request: ExtractRequest,
    ai_client: AIClientProtocol,
    meeting_type: MeetingType,
    total_chunks: int,
    *,
    gate: Optional[ConfidenceGate] = None,
    fallback_client: Optional[AIClientProtocol] = None,
    language: Optional[LanguageDetection] = None,
    grounding: Optional[_Grounding] = None,
) -> ChunkExtractionResult:
    """Primary extraction for one chunk, evidence grounding, then the confidence gate."""
    user_prompt = _ROUTER.render_user_prompt(
        request,
        chunk_text=chunk.content,
        chunk_index=chunk.chunk_index,
        total_chunks=total_chunks,
        meeting_type=meeting_type,
        language=language,
    )

    try:
        result = await _run_extractors(
            ai_client, user_prompt, chunk, EXTRACTORS, include_summary=True
        )
    except Exception as exc:
        log.error(
            "chunk_extraction_failed",
            meeting_id=request.meeting_id,
            chunk_index=chunk.chunk_index,
            error_type=type(exc).__name__,
            error_detail=str(exc),
        )
        return ChunkExtractionResult(
            chunk_id=f"chunk_{chunk.chunk_index}",
            chunk_index=chunk.chunk_index,
            succeeded=False,
            is_first_chunk=chunk.chunk_index == 0,
            error=str(exc),
        )

    result = _ground_chunk_result(result, grounding)

    if gate is None or fallback_client is None:
        return result

    decision = gate.evaluate(result)
    if not decision.triggered:
        return result
    return await _apply_fallback(
        result, decision, gate, fallback_client, user_prompt, chunk, request, grounding=grounding
    )


async def _apply_fallback(
    primary: ChunkExtractionResult,
    decision: GateDecision,
    gate: ConfidenceGate,
    fallback_client: AIClientProtocol,
    user_prompt: str,
    chunk: TextChunk,
    request: ExtractRequest,
    *,
    grounding: Optional[_Grounding] = None,
) -> ChunkExtractionResult:
    log.info(
        "confidence_gate_triggered",
        meeting_id=request.meeting_id,
        chunk_index=chunk.chunk_index,
        extractors=list(decision.extractors),
        reasons=decision.reasons,
        avg_confidence=decision.mean_confidence,
        item_count=decision.item_count,
    )
    specs = tuple(_EXTRACTORS_BY_NAME[name] for name in decision.extractors)
    try:
        with trace_scope(fallback_triggered=True):
            fallback = await _run_extractors(
                fallback_client, user_prompt, chunk, specs, include_summary=False
            )
    except Exception as exc:  # fallback must never make a chunk worse
        log.warning(
            "confidence_gate_fallback_failed",
            meeting_id=request.meeting_id,
            chunk_index=chunk.chunk_index,
            error_type=type(exc).__name__,
            error=str(exc)[:200],
        )
        return primary

    fallback = _ground_chunk_result(fallback, grounding)
    merged = gate.merge_primary_and_fallback(primary, fallback, decision.extractors)
    log.info(
        "confidence_gate_merged",
        meeting_id=request.meeting_id,
        chunk_index=chunk.chunk_index,
        **{
            f"{spec.name}_count": len(getattr(merged, spec.result_field) or [])
            for spec in specs
        },
        fallback_failed_extractors=fallback.failed_extractors,
    )
    return merged


async def _run_extractors(
    client: AIClientProtocol,
    user_prompt: str,
    chunk: TextChunk,
    specs: tuple[ExtractorSpec, ...],
    *,
    include_summary: bool,
) -> ChunkExtractionResult:
    """Run the given extractors (+ optional partial summary) in parallel.

    Per-extractor failures are isolated: the failed extractor's list is empty
    and its name is recorded in `failed_extractors`.
    """
    coroutines: list[Any] = [
        client.generate_structured(
            task_type=spec.task_type,
            system_prompt=_SYSTEM_PROMPTS[spec.task_type],
            user_prompt=user_prompt,
            response_schema=spec.response_schema,
        )
        for spec in specs
    ]
    if include_summary:
        coroutines.append(
            client.generate_text(
                task_type=TaskType.SUMMARY,
                system_prompt=_SYSTEM_PROMPTS[TaskType.SUMMARY],
                user_prompt=user_prompt,
            )
        )

    results = await asyncio.gather(*coroutines, return_exceptions=True)
    names = [spec.name for spec in specs] + (["summary"] if include_summary else [])

    failed: list[str] = []
    for name, res in zip(names, results):
        if isinstance(res, BaseException):
            failed.append(name)
            log.warning(
                "chunk_extractor_partial_failure",
                chunk_index=chunk.chunk_index,
                extractor=name,
                error_type=type(res).__name__,
                error=str(res)[:200],
            )

    fields: dict[str, Any] = {}
    for spec, res in zip(specs, results):
        if isinstance(res, BaseException):
            fields[spec.result_field] = []
            continue
        raw_items = getattr(res.data, spec.response_field, None) or []
        fields[spec.result_field] = [spec.parser(item) for item in raw_items]

    summary: Any = None
    if include_summary and not isinstance(results[-1], BaseException):
        summary = StructuredSummary.from_raw(results[-1].data)

    successful: list[AICallResult[Any]] = [r for r in results if not isinstance(r, BaseException)]
    return ChunkExtractionResult(
        chunk_id=f"chunk_{chunk.chunk_index}",
        chunk_index=chunk.chunk_index,
        succeeded=True,
        summary=summary,
        cost=_combine_costs(successful),
        error=None,
        is_first_chunk=chunk.chunk_index == 0,
        failed_extractors=[n for n in failed if n != "summary"],
        providers_used=sorted({r.provider_used for r in successful}),
        **fields,
    )


def _combine_costs(results: list[AICallResult[Any]]) -> Optional[CostRecord]:
    if not results:
        return None
    ref = results[0].cost
    return CostRecord(
        input_tokens=sum(r.cost.input_tokens for r in results),
        output_tokens=sum(r.cost.output_tokens for r in results),
        model_tier=ref.model_tier,
        model_name=ref.model_name,
        estimated_cost_usd=sum(r.cost.estimated_cost_usd for r in results),
    )


# ─── Cross-chunk similarity dedup ────────────────────────────────────────────

def _text_similarity_dedup(
    items: list,
    get_text: callable,
    get_confidence: callable,
) -> list:
    """Generic similarity-based dedup for decisions/blockers/risks across chunks.

    Replaces the 80-char prefix key approach. Uses the same similarity_score()
    engine as the commitment resolver for consistency.

    NORMALIZATION: get_text() must return already-normalized text OR raw text.
    This function applies normalize_text() to ALL inputs before comparison to
    ensure token counts stay within MAX_INPUT_TOKENS_GUARD and the
    SimilarityBreakdown validator (tokens == text.split()) never fails.

    Args:
        items: List of parsed entities (decisions/blockers/risks).
        get_text: Callable(item) -> str raw or partially normalized text.
        get_confidence: Callable(item) -> float confidence score.

    Returns:
        Deduplicated list.
    """
    kept: list = []
    # Pre-normalize all texts once — avoids repeated normalize_text() calls
    # in the O(N^2) inner loop.
    norm_cache: dict[int, str] = {}

    def _norm(item) -> str:
        key = id(item)
        if key not in norm_cache:
            norm_cache[key] = normalize_text(get_text(item))
        return norm_cache[key]

    for item in items:
        item_norm = _norm(item)
        item_conf = get_confidence(item)
        is_dup = False
        for i, existing in enumerate(kept):
            sim = similarity_score(item_norm, _norm(existing))
            if sim.score >= _CROSS_CHUNK_DEDUP_THRESHOLD:
                # Keep the higher confidence version
                if item_conf > get_confidence(existing):
                    kept[i] = item
                    # Invalidate cache for replaced item
                    norm_cache[id(existing)] = item_norm
                is_dup = True
                break
        if not is_dup:
            kept.append(item)
    return kept


def _same_owner_similarity_dedup(items: list, owner: Callable, text: Callable) -> list:
    """_text_similarity_dedup applied separately per owner (None = unassigned)."""
    groups: dict[str, list] = {}
    for item in items:
        groups.setdefault((owner(item) or "").strip().lower(), []).append(item)
    out: list = []
    for group in groups.values():
        out.extend(_text_similarity_dedup(group, get_text=text, get_confidence=lambda i: i.confidence))
    return out


# ─── Merge chunk results ─────────────────────────────────────────────────────

def _merge_chunk_results(
    request: ExtractRequest,
    chunk_results: List[ChunkExtractionResult],
    start_time: float,
    meeting_type: MeetingType = MeetingType.GENERAL,
) -> ExtractionResultWithMeta | PartialExtractionFailure:
    succeeded_chunks = [r for r in chunk_results if r.succeeded]
    failed_chunks = [r for r in chunk_results if not r.succeeded]

    if not succeeded_chunks:
        return PartialExtractionFailure(
            meeting_id=request.meeting_id,
            team_id=request.team_id,
            succeeded_chunks=0,
            failed_chunks=len(chunk_results),
            total_chunks=len(chunk_results),
            partial_result=None,
            failed_chunk_indices=[r.chunk_index for r in failed_chunks],
            error_summary="All chunks failed",
        )

    # ── Commitments — keyed dedup by dedup_key, confidence wins on tie ────────
    merged_commitments: dict = {}
    for res in succeeded_chunks:
        for c in res.parsed_commitments or []:
            if c.dedup_key not in merged_commitments:
                merged_commitments[c.dedup_key] = (c, res.chunk_index)
            else:
                existing, existing_idx = merged_commitments[c.dedup_key]
                if c.confidence > existing.confidence:
                    merged_commitments[c.dedup_key] = (c, res.chunk_index)
                elif c.confidence == existing.confidence and res.chunk_index > existing_idx:
                    merged_commitments[c.dedup_key] = (c, res.chunk_index)
    final_commitments = [c for c, _ in merged_commitments.values()]

    # ── Action Items — keyed dedup ────────────────────────────────────────────
    merged_action_items: dict = {}
    for res in succeeded_chunks:
        for a in res.parsed_action_items or []:
            if a.dedup_key not in merged_action_items:
                merged_action_items[a.dedup_key] = a
            elif a.confidence > merged_action_items[a.dedup_key].confidence:
                merged_action_items[a.dedup_key] = a
    final_action_items = list(merged_action_items.values())

    # ── Near-duplicates across chunk overlap ─────────────────────────────────
    # The keyed merge above only collapses identical "<owner>::<text>" keys. The
    # same promise extracted from two overlapping chunks is usually worded a
    # little differently, so also collapse similar texts for the same person.
    # Single-chunk meetings are untouched (there is no overlap to repeat items).
    if len(succeeded_chunks) > 1:
        final_commitments = _same_owner_similarity_dedup(
            final_commitments,
            owner=lambda c: c.owner_name,
            text=lambda c: c.normalized_text,
        )
        final_action_items = _same_owner_similarity_dedup(
            final_action_items,
            owner=lambda a: a.assignee_name,
            text=lambda a: a.dedup_key.split("::", 1)[-1],
        )

    # ── Commitment ↔ ActionItem dedup (similarity-based) ─────────────────────
    from src.services.extraction.deduplicator import deduplicate_commitments_and_action_items
    final_commitments, final_action_items = deduplicate_commitments_and_action_items(
        final_commitments, final_action_items
    )

    # ── FIX 4: Decisions — similarity-based cross-chunk dedup ────────────────
    all_decisions = [
        d for res in succeeded_chunks for d in (res.parsed_decisions or [])
    ]
    final_decisions = _text_similarity_dedup(
        all_decisions,
        get_text=lambda d: d.text_normalized,
        get_confidence=lambda d: d.confidence,
    )

    # ── Blockers — similarity-based cross-chunk dedup ─────────────────────────
    all_blockers = [
        b for res in succeeded_chunks for b in (res.parsed_blockers or [])
    ]
    final_blockers = _text_similarity_dedup(
        all_blockers,
        get_text=lambda b: b.text_normalized,
        get_confidence=lambda b: b.confidence,
    )

    # ── Risks — similarity-based cross-chunk dedup ────────────────────────────
    all_risks = [
        r for res in succeeded_chunks for r in (res.parsed_risks or [])
    ]
    final_risks = _text_similarity_dedup(
        all_risks,
        get_text=lambda r: r.text_normalized,
        get_confidence=lambda r: r.confidence,
    )

    # ── Summary — from first successful chunk (meta-summary added in _enrich) ─
    first_success = next((r for r in succeeded_chunks if r.summary), None)
    summary = first_success.summary if first_success else StructuredSummary()
    summary_scope = (
        SummaryScopeType.FULL
        if len(chunk_results) == 1
        else SummaryScopeType.PARTIAL_FIRST_CHUNK  # Upgraded to FULL after meta-summary
    )

    # ── Cost aggregation ──────────────────────────────────────────────────────
    total_input = total_output = 0
    total_cost_usd = 0.0
    extraction_model = "unknown"
    for res in succeeded_chunks:
        if res.cost:
            total_input += res.cost.input_tokens
            total_output += res.cost.output_tokens
            total_cost_usd += res.cost.estimated_cost_usd
            extraction_model = res.cost.model_name

    total_cost = CostRecord(
        input_tokens=total_input,
        output_tokens=total_output,
        model_tier=succeeded_chunks[0].cost.model_tier if succeeded_chunks and succeeded_chunks[0].cost else "mini",
        model_name=extraction_model,
        estimated_cost_usd=total_cost_usd,
    )

    processing_time_ms = (time.monotonic() - start_time) * 1000

    full_result = ExtractionResultWithMeta(
        meeting_id=request.meeting_id,
        team_id=request.team_id,
        commitments=final_commitments,
        action_items=final_action_items,
        decisions=final_decisions,
        blockers=final_blockers,
        risks=final_risks,
        summary=summary,
        summary_scope=summary_scope,
        extraction_model=extraction_model,
        prompt_version=_PROMPT_VERSION,
        chunks_total=len(chunk_results),
        chunks_succeeded=len(succeeded_chunks),
        total_cost=total_cost,
        per_chunk_costs=[r.cost if r.succeeded else None for r in chunk_results],
        processing_time_ms=processing_time_ms,
        meeting_type=meeting_type,
        prompt_versions=_PROMPT_VERSIONS,
        fallback_chunks=sum(1 for r in succeeded_chunks if r.fallback_triggered),
        providers_used=sorted({p for r in succeeded_chunks for p in r.providers_used}),
    )

    log.info(
        "extraction_merge_complete",
        meeting_id=request.meeting_id,
        commitments=len(final_commitments),
        action_items=len(final_action_items),
        decisions=len(final_decisions),
        blockers=len(final_blockers),
        risks=len(final_risks),
        chunks_total=len(chunk_results),
        chunks_succeeded=len(succeeded_chunks),
        chunks_failed=len(failed_chunks),
        processing_time_ms=round(processing_time_ms, 2),
    )

    if failed_chunks:
        return PartialExtractionFailure(
            meeting_id=request.meeting_id,
            team_id=request.team_id,
            succeeded_chunks=len(succeeded_chunks),
            failed_chunks=len(failed_chunks),
            total_chunks=len(chunk_results),
            partial_result=full_result,
            failed_chunk_indices=[r.chunk_index for r in failed_chunks],
            error_summary=f"{len(failed_chunks)} of {len(chunk_results)} chunks failed",
        )

    return full_result
