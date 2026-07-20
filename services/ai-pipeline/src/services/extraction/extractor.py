"""
services/extraction/extractor.py — Industry-Scale Rewrite
──────────────────────────────────────────────────────────
CRITICAL FIXES applied in this version:

  FIX 1 — return_exceptions=True in asyncio.gather():
    Previous: return_exceptions=False → unhandled exceptions in any chunk
    coroutine would surface and discard ALL chunk results from gather().
    Now: BaseException instances are captured per-slot and logged; the
    rest of the chunks are still returned as ChunkExtractionResult.

  FIX 2 — Hierarchical summary for multi-chunk meetings:
    Previous: Summary only on first chunk → 2-hour meeting summarized from
    first 15 minutes. Now: each chunk produces a partial summary; a final
    meta-summary call synthesizes all partial summaries into a coherent whole.

  FIX 3 — Jinja2 template rendering (injection-safe):
    Previous: str.replace() on raw user inputs → if meeting_title contained
    "{{participants}}" as a string, it would be replaced in the next call.
    Now: jinja2.Environment with undefined=StrictUndefined for safe rendering.

  FIX 4 — Cross-chunk dedup uses similarity engine (not 80-char prefix):
    Decisions/blockers/risks used text[:80] as dedup key across chunks.
    Now: similarity_score() on normalized text, consistent with commitments.
"""

from __future__ import annotations

import asyncio
import time
from pathlib import Path
from typing import List, Optional

import jinja2
import structlog

from src.models.common import TaskType, CostRecord
from src.models.chunk_models import TranscriptContent, ChunkingStrategy, TextChunk
from src.models.extraction_models import (
    ExtractRequest,
    ChunkExtractionResult,
    SummaryScopeType,
    ExtractionResultWithMeta,
    PartialExtractionFailure,
    CommitmentsResponse,
    ActionItemsResponse,
    DecisionsResponse,
    BlockersResponse,
    RisksResponse,
)
from src.services.openai_client import OpenAIClient
from src.services.chunker import chunk_content
from src.services.tokenization import estimate_token_count
from src.config.extraction_config import (
    EXTRACTION_CHUNK_MAX_TOKENS,
    EXTRACTION_CHUNK_OVERLAP_TURNS,
    EXTRACTOR_CHUNK_CONCURRENCY,
    EXTRACTION_PROMPT_CACHE,
)
from src.services.extraction.commitment_parser import parse_commitment, normalize_text
from src.services.extraction.action_item_parser import parse_action_item
from src.services.extraction.decision_parser import parse_decision
from src.services.extraction.blocker_parser import parse_blocker
from src.services.extraction.risk_parser import parse_risk
from src.services.similarity import similarity_score
from src.models.exceptions import AIPipelineError

log = structlog.get_logger(__name__)

# ─── Similarity threshold for cross-chunk entity dedup ───────────────────────
_CROSS_CHUNK_DEDUP_THRESHOLD: float = 0.70
"""Minimum similarity score for two decision/blocker/risk texts to be
considered the same entity across chunks. Slightly higher than the
commitment MATCH_THRESHOLD (0.65) because these entity types have less
normalization applied and we want higher precision."""

# ─── Prompt loading ───────────────────────────────────────────────────────────

class PromptLoadError(AIPipelineError):
    pass

PROMPTS_DIR = Path(__file__).parent.parent.parent / "prompts"

_JINJA_ENV = jinja2.Environment(
    undefined=jinja2.StrictUndefined,
    autoescape=False,  # Plain text prompts — not HTML
)

try:
    _USER_PROMPT_TPL_SRC = (PROMPTS_DIR / "extraction_user.txt").read_text(encoding="utf-8")
    _USER_PROMPT_TPL = _JINJA_ENV.from_string(
        _USER_PROMPT_TPL_SRC
        .replace("{{meeting_title}}", "{{ meeting_title }}")
        .replace("{{meeting_date_iso}}", "{{ meeting_date_iso }}")
        .replace("{{participants}}", "{{ participants }}")
        .replace("{{transcript_content}}", "{{ transcript_content }}")
    )

    _META_SUMMARY_SYSTEM = (
        "You are an executive meeting summarizer. You receive multiple partial "
        "summaries from consecutive sections of a long meeting. Synthesize them "
        "into a single coherent summary of 100-150 words. Follow the same structure: "
        "PARAGRAPH 1 — context/theme. PARAGRAPH 2 — key outcomes/decisions/commitments. "
        "PARAGRAPH 3 — critical blockers or risks (omit if none). "
        "Past tense. Professional. Specific. No bullet points. No filler phrases."
    )

    _PROMPTS = {
        TaskType.EXTRACT_COMMITMENTS: (PROMPTS_DIR / "commitment_system.txt").read_text(encoding="utf-8"),
        TaskType.EXTRACT_ACTION_ITEMS: (PROMPTS_DIR / "action_items_system.txt").read_text(encoding="utf-8"),
        TaskType.EXTRACT_DECISIONS: (PROMPTS_DIR / "decisions_system.txt").read_text(encoding="utf-8"),
        TaskType.EXTRACT_BLOCKERS: (PROMPTS_DIR / "blockers_system.txt").read_text(encoding="utf-8"),
        TaskType.EXTRACT_RISKS: (PROMPTS_DIR / "risks_system.txt").read_text(encoding="utf-8"),
        TaskType.SUMMARY: (PROMPTS_DIR / "summary_system.txt").read_text(encoding="utf-8"),
    }

    _first_line = _PROMPTS[TaskType.EXTRACT_COMMITMENTS].split("\n")[0]
    _PROMPT_VERSION = _first_line.strip() if _first_line.startswith("# prompt_version") else "extraction-v4.0"

except Exception as e:
    raise PromptLoadError(f"Failed to load specialized extraction prompts: {e}")


# ─── Public entry point ───────────────────────────────────────────────────────

async def extract(
    request: ExtractRequest,
    ai_client: OpenAIClient,
) -> ExtractionResultWithMeta | PartialExtractionFailure:
    """Run the full extraction pipeline for one meeting.

    Pipeline:
      1. Chunk transcript by speaker turn groups
      2. Run 5 parallel extractors + per-chunk summary for each chunk (bounded concurrency)
      3. Merge chunk results with similarity-based cross-chunk dedup
      4. Run hierarchical meta-summary if meeting has > 1 chunk
      5. Batch date-parse due_date_raw values on commitments

    Args:
        request: Fully populated ExtractRequest (validated upstream).
        ai_client: Process-singleton OpenAI client.

    Returns:
        ExtractionResultWithMeta on full success, PartialExtractionFailure if
        any chunks failed (but at least one succeeded).
    """
    start_time = time.monotonic()

    if not request.participants:
        raise ValueError("Participant list cannot be empty")

    full_transcript_text = "\n".join(
        f"{t.speaker_name}: {t.cleaned_text}" for t in request.cleaned_transcript
    )
    total_transcript_tokens = estimate_token_count(full_transcript_text)

    chunks, chunk_meta = chunk_content(
        content=TranscriptContent(turns=request.cleaned_transcript),
        strategy=ChunkingStrategy.SPEAKER_TURN_GROUPED,
        max_tokens=EXTRACTION_CHUNK_MAX_TOKENS,
        overlap_units=EXTRACTION_CHUNK_OVERLAP_TURNS,
    )

    log.info(
        "extraction_job_started",
        meeting_id=request.meeting_id,
        team_id=request.team_id,
        total_turns=len(request.cleaned_transcript),
        total_tokens_estimate=total_transcript_tokens,
        chunks_count=len(chunks),
        prompt_version=_PROMPT_VERSION,
    )

    extractor_semaphore = asyncio.Semaphore(EXTRACTOR_CHUNK_CONCURRENCY)

    async def _extract_one_chunk_safely(chunk: TextChunk) -> ChunkExtractionResult:
        async with extractor_semaphore:
            return await _extract_one_chunk(chunk, request, ai_client)

    chunk_coroutines = [_extract_one_chunk_safely(chunk) for chunk in chunks]

    # FIX 1: return_exceptions=True — captures per-chunk failures without
    # aborting the entire gather when one chunk raises unexpectedly.
    raw_results = await asyncio.gather(*chunk_coroutines, return_exceptions=True)

    # Normalize: BaseException slots → failed ChunkExtractionResult
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

    merged_result = _merge_chunk_results(request, chunk_results, start_time)

    # ── FIX 2: Hierarchical meta-summary for multi-chunk meetings ─────────────
    final_result = (
        merged_result.partial_result
        if isinstance(merged_result, PartialExtractionFailure)
        else merged_result
    )

    if final_result is not None:
        await _enrich_result(final_result, chunk_results, request, ai_client)

    return merged_result


async def _enrich_result(
    final_result: ExtractionResultWithMeta,
    chunk_results: List[ChunkExtractionResult],
    request: ExtractRequest,
    ai_client: OpenAIClient,
) -> None:
    """Post-merge enrichment: hierarchical summary + date parsing.

    Mutates final_result in place (both summary and commitment dates).
    """
    succeeded_chunks = [r for r in chunk_results if r.succeeded]

    # ── Hierarchical summary ──────────────────────────────────────────────────
    partial_summaries = [r.summary for r in succeeded_chunks if r.summary]

    if len(partial_summaries) > 1:
        # Multiple chunks → synthesize a meta-summary
        combined = "\n\n---\n\n".join(
            f"[Section {i + 1} of {len(partial_summaries)}]:\n{s}"
            for i, s in enumerate(partial_summaries)
        )
        user_prompt = (
            f"MEETING: {request.meeting_title}\n"
            f"DATE: {request.meeting_date.isoformat()}\n\n"
            f"PARTIAL SUMMARIES:\n{combined}"
        )
        try:
            meta_result = await ai_client.generate_text(
                task_type=TaskType.SUMMARY,
                system_prompt=_META_SUMMARY_SYSTEM,
                user_prompt=user_prompt,
            )
            final_result.summary = meta_result.data
            final_result.summary_scope = SummaryScopeType.FULL
            log.info(
                "meta_summary_generated",
                meeting_id=request.meeting_id,
                partial_count=len(partial_summaries),
                meta_summary_chars=len(final_result.summary),
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
    ai_client: OpenAIClient,
) -> ChunkExtractionResult:
    """Run all 5 specialized extractors + summary in parallel for one chunk."""
    is_first_chunk = chunk.chunk_index == 0

    participants_fmt = "\n".join(
        f"- {p.name} ({p.email})" + ("" if p.user_id else " [External]")
        for p in request.participants
    )

    content_text = chunk.content
    if not is_first_chunk:
        content_text = (
            "[Note: This is a continuation of the meeting. "
            "The preceding section may have contained additional context not reproduced here.]\n\n"
            + content_text
        )

    # FIX 3: Jinja2 template rendering (injection-safe)
    user_prompt = _USER_PROMPT_TPL.render(
        meeting_title=request.meeting_title,
        meeting_date_iso=request.meeting_date.isoformat(),
        participants=participants_fmt,
        transcript_content=content_text,
    )

    try:
        coroutines = [
            ai_client.generate_structured(
                task_type=TaskType.EXTRACT_COMMITMENTS,
                system_prompt=_PROMPTS[TaskType.EXTRACT_COMMITMENTS],
                user_prompt=user_prompt,
                response_schema=CommitmentsResponse,
            ),
            ai_client.generate_structured(
                task_type=TaskType.EXTRACT_ACTION_ITEMS,
                system_prompt=_PROMPTS[TaskType.EXTRACT_ACTION_ITEMS],
                user_prompt=user_prompt,
                response_schema=ActionItemsResponse,
            ),
            ai_client.generate_structured(
                task_type=TaskType.EXTRACT_DECISIONS,
                system_prompt=_PROMPTS[TaskType.EXTRACT_DECISIONS],
                user_prompt=user_prompt,
                response_schema=DecisionsResponse,
            ),
            ai_client.generate_structured(
                task_type=TaskType.EXTRACT_BLOCKERS,
                system_prompt=_PROMPTS[TaskType.EXTRACT_BLOCKERS],
                user_prompt=user_prompt,
                response_schema=BlockersResponse,
            ),
            ai_client.generate_structured(
                task_type=TaskType.EXTRACT_RISKS,
                system_prompt=_PROMPTS[TaskType.EXTRACT_RISKS],
                user_prompt=user_prompt,
                response_schema=RisksResponse,
            ),
            # FIX 2: Summary on EVERY chunk (not just first)
            ai_client.generate_text(
                task_type=TaskType.SUMMARY,
                system_prompt=_PROMPTS[TaskType.SUMMARY],
                user_prompt=user_prompt,
            ),
        ]

        results = await asyncio.gather(*coroutines, return_exceptions=True)

        # Unpack — handle per-extractor failures gracefully
        commitments_res = results[0] if not isinstance(results[0], BaseException) else None
        action_items_res = results[1] if not isinstance(results[1], BaseException) else None
        decisions_res = results[2] if not isinstance(results[2], BaseException) else None
        blockers_res = results[3] if not isinstance(results[3], BaseException) else None
        risks_res = results[4] if not isinstance(results[4], BaseException) else None
        summary_res = results[5] if not isinstance(results[5], BaseException) else None

        # Log any per-extractor failures (partial chunk success)
        for i, (res, name) in enumerate(zip(results, [
            "commitments", "action_items", "decisions", "blockers", "risks", "summary"
        ])):
            if isinstance(res, BaseException):
                log.warning(
                    "chunk_extractor_partial_failure",
                    chunk_index=chunk.chunk_index,
                    extractor=name,
                    error_type=type(res).__name__,
                    error=str(res)[:200],
                )

        parsed_commitments = (
            [parse_commitment(c) for c in commitments_res.data.commitments]
            if commitments_res else []
        )
        parsed_action_items = (
            [parse_action_item(a) for a in action_items_res.data.action_items]
            if action_items_res else []
        )
        parsed_decisions = (
            [parse_decision(d) for d in decisions_res.data.decisions]
            if decisions_res else []
        )
        parsed_blockers = (
            [parse_blocker(b) for b in blockers_res.data.blockers]
            if blockers_res else []
        )
        parsed_risks = (
            [parse_risk(r) for r in risks_res.data.risks]
            if risks_res else []
        )
        summary_text = summary_res.data if summary_res else None

        # Aggregate costs from successful calls only
        successful_results = [r for r in results if not isinstance(r, BaseException)]
        total_input_tokens = sum(r.cost.input_tokens for r in successful_results)
        total_output_tokens = sum(r.cost.output_tokens for r in successful_results)
        total_cost_usd = sum(r.cost.estimated_cost_usd for r in successful_results)

        ref_cost = next(
            (r.cost for r in successful_results if hasattr(r, "cost")), None
        )
        combined_cost = CostRecord(
            input_tokens=total_input_tokens,
            output_tokens=total_output_tokens,
            model_tier=ref_cost.model_tier if ref_cost else "mini",
            model_name=ref_cost.model_name if ref_cost else "unknown",
            estimated_cost_usd=total_cost_usd,
        ) if ref_cost else None

        return ChunkExtractionResult(
            chunk_id=f"chunk_{chunk.chunk_index}",
            chunk_index=chunk.chunk_index,
            succeeded=True,
            parsed_commitments=parsed_commitments,
            parsed_action_items=parsed_action_items,
            parsed_decisions=parsed_decisions,
            parsed_blockers=parsed_blockers,
            parsed_risks=parsed_risks,
            summary=summary_text,
            cost=combined_cost,
            error=None,
            is_first_chunk=is_first_chunk,
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
            is_first_chunk=is_first_chunk,
            error=str(exc),
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


# ─── Merge chunk results ─────────────────────────────────────────────────────

def _merge_chunk_results(
    request: ExtractRequest,
    chunk_results: List[ChunkExtractionResult],
    start_time: float,
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
    summary = first_success.summary if first_success else ""
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
