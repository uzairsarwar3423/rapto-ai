"""
services/resolution/resolver_pipeline.py
────────────────────────────────────────────────────────────────────────────────
Vocaply AI Pipeline — Resolution Pipeline Orchestrator
Day 55 | Principal Backend Engineer + Principal AI/RAG Engineer Edition

This module is the SINGLE INTEGRATION POINT for the entire resolution chain.
The route handler (api/routes/resolve.py) calls ONLY run_resolution_pipeline().
It never calls the resolver (Day 53) or detector (Day 54) directly.

ARCHITECTURAL DECISION (Decision 1 from Day 55):
  The route handler is a routing concern.
  The pipeline orchestrator is a business-logic concern.
  These must never merge. If a fourth stage is added (e.g., a confidence
  booster), it is added here — not in the route handler.

SIX-PHASE EXECUTION MODEL:
  Phase 1: Build ResolutionInput → call resolve() (Day 53's resolver)
  Phase 2: Stage 1 pre-screening on ALL matched pairs (sync, free)
  Phase 3: Stage 2 concurrent detection for pairs that passed Stage 1
  Phase 4: Result classification into four output lists
  Phase 5: Cost aggregation + partial-failure assembly
  Phase 6: Invariant assertion + PipelineResult assembly

CONCURRENCY DESIGN:
  Stage 2 calls are dispatched concurrently using asyncio.Semaphore bounded
  to STAGE2_MAX_CONCURRENT_CALLS. This mirrors Day 50's extractor and Day 51's
  date parser — consistent bounded-concurrency pattern across the service.
  return_exceptions=False in gather(): detect_resolution() already converts
  all exceptions into typed DetectionResult(status=DETECTION_FAILED) values.
  gather() never sees an unhandled exception in the normal-degradation case.

WHY STAGE 1 PRE-SCREENING IN THE PIPELINE (not just inside detect_resolution()):
  Running Stage 1 synchronously up front on ALL matched pairs gives the pipeline:
  a. Exact Stage 2 call count BEFORE any async call starts (predictable semaphore)
  b. A single structured log event: "N pairs need Stage 2 out of M matched"
  c. stage1_blocks computed without introspecting DetectionResult objects post-hoc

PARTIAL FAILURE SEMANTICS:
  If some detection calls fail (DETECTION_FAILED), we return HTTP 206
  with the partial result. The Node.js side can:
    - Use the successful resolutions immediately
    - Retry detection for the failed IDs in a subsequent job
  We NEVER collapse DETECTION_FAILED into NOT_RESOLVED silently.
"""

from __future__ import annotations

import asyncio
import time
from typing import List, Optional

import structlog

from src.config.logging import get_logger
from src.config.resolution_config import (
    STAGE2_MAX_CONCURRENT_CALLS,
)
from src.models.common import CostRecord, ModelTier
from src.models.exceptions import ResolverInvariantError
from src.models.resolution_models import (
    DetectionStatus,
    HistoricalCommitment,
    MatchedCommitment,
    NotResolvedReference,
    PartialResolutionFailure,
    PipelineResult,
    ResolvedCommitmentUpdate,
    ResolvePipelineStats,
    ResolveRequest,
    ResolutionInput,
)
from src.services.extraction.commitment_parser import ParsedCommitment
from src.services.openai_client import OpenAIClient
from src.services.resolution.commitment_resolver import resolve
from src.services.resolution.resolution_detector import (
    _resolution_prompt_version,
    _run_stage1,
    detect_resolution,
)

log: structlog.BoundLogger = get_logger(__name__)


def _zero_cost_record() -> CostRecord:
    """Return a zero-valued CostRecord accumulator for cost aggregation.

    Uses model_name='none' and ModelTier.MINI as a sentinel — the accumulated
    cost will have actual model metadata added as calls are summed.
    When no Stage 2 calls succeed, the caller receives a zero-cost record
    (cost of Stage 1 is zero — pure Python, no API calls).
    """
    return CostRecord(
        input_tokens=0,
        output_tokens=0,
        model_tier=ModelTier.MINI,
        model_name="gpt-4.1-mini",
        estimated_cost_usd=0.0,
    )


def _accumulate_cost(accumulator: CostRecord, addition: CostRecord) -> CostRecord:
    """Add one CostRecord to an accumulator, returning a new CostRecord.

    Called for each successful Stage 2 detection call. The model_name and
    model_tier of the accumulator are taken from the first non-zero addition
    (all Stage 2 calls use the same model, so this is consistent).
    """
    return CostRecord(
        input_tokens=accumulator.input_tokens + addition.input_tokens,
        output_tokens=accumulator.output_tokens + addition.output_tokens,
        model_tier=addition.model_tier,
        model_name=addition.model_name,
        estimated_cost_usd=accumulator.estimated_cost_usd + addition.estimated_cost_usd,
    )


async def run_resolution_pipeline(
    request: ResolveRequest,
    openai_client: OpenAIClient,
) -> PipelineResult:
    """Orchestrate the complete resolution pipeline for one meeting.

    The single callable that the /resolve route handler calls. Owns the entire
    resolution flow: resolver → pre-screening → detection → classification →
    cost aggregation → result assembly.

    Args:
        request: The validated ResolveRequest from the HTTP layer.
        openai_client: The process-singleton OpenAI client from app.state.

    Returns:
        PipelineResult with all four commitment categories, pipeline stats,
        and optional partial_failure descriptor.

    Raises:
        ResolverInvariantError: If the pipeline's invariant check fails (a code bug,
            not a data issue). The route handler maps this to HTTP 500 non_retryable.
    """

    # ═══════════════════════════════════════════════════════════════════════════
    # Phase 0: Start total pipeline timer
    # ═══════════════════════════════════════════════════════════════════════════

    total_start = time.monotonic()

    # ═══════════════════════════════════════════════════════════════════════════
    # Phase 1: Build ResolutionInput and invoke Day 53's resolver
    # ═══════════════════════════════════════════════════════════════════════════

    resolution_input = ResolutionInput(
        meeting_id=request.meeting_id,
        team_id=request.team_id,
        meeting_date=request.meeting_date,
        new_commitments=request.new_commitments,
        historical_commitments=request.historical_commitments,
    )

    resolver_start = time.monotonic()
    resolution_result = resolve(resolution_input)
    resolver_time_ms = (time.monotonic() - resolver_start) * 1000.0

    log.info(
        "resolver_complete",
        meeting_id=request.meeting_id,
        team_id=request.team_id,
        new_count=len(resolution_result.new_commitments),
        matched_count=len(resolution_result.matched_commitments),
        unchanged_count=len(resolution_result.unchanged_commitments),
        comparisons_made=resolution_result.stats.total_comparisons_made,
        resolver_time_ms=round(resolver_time_ms, 2),
    )

    matched_commitments: List[MatchedCommitment] = resolution_result.matched_commitments

    # ═══════════════════════════════════════════════════════════════════════════
    # Phase 2: Stage 1 pre-screening on ALL matched pairs (synchronous, free)
    # ═══════════════════════════════════════════════════════════════════════════

    # Running Stage 1 synchronously up front on ALL matched pairs allows:
    #   a. Know exact Stage 2 call count before any async call starts
    #   b. Emit one precise log event for cost monitoring
    #   c. Compute stage1_blocks without post-hoc DetectionResult inspection

    pairs_needing_stage2: List[MatchedCommitment] = []
    stage1_blocked_pairs: List[MatchedCommitment] = []

    for matched in matched_commitments:
        stage1 = _run_stage1(matched.new_commitment.text)
        if stage1.passed:
            pairs_needing_stage2.append(matched)
        else:
            stage1_blocked_pairs.append(matched)

    stage1_blocks = len(stage1_blocked_pairs)

    log.info(
        "stage1_prescreening_complete",
        meeting_id=request.meeting_id,
        total_matched=len(matched_commitments),
        stage2_needed=len(pairs_needing_stage2),
        stage1_blocked=stage1_blocks,
    )

    # ═══════════════════════════════════════════════════════════════════════════
    # Phase 3: Stage 2 concurrent detection for pairs that passed Stage 1
    # ═══════════════════════════════════════════════════════════════════════════

    detector_start = time.monotonic()

    if pairs_needing_stage2:
        semaphore = asyncio.Semaphore(STAGE2_MAX_CONCURRENT_CALLS)

        async def _bounded_detect(matched_pair: MatchedCommitment):
            """Semaphore-bounded single-pair detection for concurrent dispatch."""
            async with semaphore:
                return await detect_resolution(
                    new_statement_text=matched_pair.new_commitment.text,
                    historical_commitment_text=matched_pair.historical_commitment.text,
                    openai_client=openai_client,
                )

        # Dispatch all Stage 2 calls concurrently.
        # return_exceptions=False: detect_resolution() converts all exceptions
        # to DETECTION_FAILED — gather() never sees unhandled exceptions in
        # the normal-degradation case. Same pattern as Day 50's extractor.
        coroutines = [_bounded_detect(pair) for pair in pairs_needing_stage2]
        stage2_results = await asyncio.gather(*coroutines)
    else:
        stage2_results = []

    detector_time_ms = (time.monotonic() - detector_start) * 1000.0

    detection_calls_succeeded = sum(
        1 for r in stage2_results if r.status != DetectionStatus.DETECTION_FAILED
    )
    detection_calls_failed_count = sum(
        1 for r in stage2_results if r.status == DetectionStatus.DETECTION_FAILED
    )

    log.info(
        "detection_complete",
        meeting_id=request.meeting_id,
        pairs_attempted=len(pairs_needing_stage2),
        succeeded=detection_calls_succeeded,
        failed=detection_calls_failed_count,
        stage1_blocks=stage1_blocks,
        detector_time_ms=round(detector_time_ms, 2),
    )

    # ═══════════════════════════════════════════════════════════════════════════
    # Phase 4: Result classification into four output lists
    # ═══════════════════════════════════════════════════════════════════════════

    resolved_updates: List[ResolvedCommitmentUpdate] = []
    not_resolved_references: List[NotResolvedReference] = []
    failed_historical_ids: List[str] = []

    # Group A: Stage 1-blocked pairs → NotResolvedReference (definitively NOT resolved)
    for matched_pair in stage1_blocked_pairs:
        not_resolved_references.append(
            NotResolvedReference(
                historical_commitment_id=matched_pair.historical_commitment.id,
                new_statement_text=matched_pair.new_commitment.text,
                similarity_score=matched_pair.similarity_score,
                detection_status="NOT_RESOLVED",
            )
        )

    # Group B: Stage 2 pairs — classify by DetectionResult
    below_threshold_conservatives = 0
    for matched_pair, detection_result in zip(pairs_needing_stage2, stage2_results):
        if detection_result.status == DetectionStatus.RESOLVED:
            resolved_updates.append(
                ResolvedCommitmentUpdate(
                    historical_commitment_id=matched_pair.historical_commitment.id,
                    historical_commitment_text=matched_pair.historical_commitment.text,
                    resolved_by_new_commitment=matched_pair.new_commitment,
                    detection_confidence=detection_result.confidence,
                    similarity_score=matched_pair.similarity_score,
                    prompt_version=_resolution_prompt_version,
                )
            )
        elif detection_result.status == DetectionStatus.NOT_RESOLVED:
            if detection_result.below_threshold_conservative:
                below_threshold_conservatives += 1
            not_resolved_references.append(
                NotResolvedReference(
                    historical_commitment_id=matched_pair.historical_commitment.id,
                    new_statement_text=matched_pair.new_commitment.text,
                    similarity_score=matched_pair.similarity_score,
                    detection_status="NOT_RESOLVED",
                )
            )
        elif detection_result.status == DetectionStatus.DETECTION_FAILED:
            not_resolved_references.append(
                NotResolvedReference(
                    historical_commitment_id=matched_pair.historical_commitment.id,
                    new_statement_text=matched_pair.new_commitment.text,
                    similarity_score=matched_pair.similarity_score,
                    detection_status="DETECTION_FAILED",
                )
            )
            failed_historical_ids.append(matched_pair.historical_commitment.id)

    # Group C: Resolver's new_commitments — pass through directly
    new_commitments: List[ParsedCommitment] = resolution_result.new_commitments

    # Group D: Unchanged — pass through from resolver
    unchanged_commitments: List[HistoricalCommitment] = resolution_result.unchanged_commitments

    # ═══════════════════════════════════════════════════════════════════════════
    # Phase 5: Cost aggregation and partial-failure assembly
    # ═══════════════════════════════════════════════════════════════════════════

    total_cost = _zero_cost_record()
    for detection_result in stage2_results:
        if (
            detection_result.stage2_invoked
            and detection_result.stage2_cost is not None
            and detection_result.status != DetectionStatus.DETECTION_FAILED
        ):
            total_cost = _accumulate_cost(total_cost, detection_result.stage2_cost)

    total_pipeline_time_ms = (time.monotonic() - total_start) * 1000.0

    stats = ResolvePipelineStats(
        new_commitments_count=len(new_commitments),
        resolved_count=len(resolved_updates),
        not_resolved_references_count=len(not_resolved_references),
        unchanged_count=len(unchanged_commitments),
        detection_calls_made=len(pairs_needing_stage2),
        detection_calls_succeeded=detection_calls_succeeded,
        detection_calls_failed=detection_calls_failed_count,
        total_detection_cost=total_cost,
        resolver_time_ms=round(resolver_time_ms, 2),
        detector_time_ms=round(detector_time_ms, 2),
        total_pipeline_time_ms=round(total_pipeline_time_ms, 2),
        stage1_blocks=stage1_blocks,
        below_threshold_conservatives=below_threshold_conservatives,
    )

    # Partial-failure assembly
    partial_failure: Optional[PartialResolutionFailure] = None
    if detection_calls_failed_count > 0:
        partial_failure = PartialResolutionFailure(
            total_matched=len(matched_commitments),
            detection_succeeded=detection_calls_succeeded,
            detection_failed=detection_calls_failed_count,
            failed_historical_ids=failed_historical_ids,
            partial_result=None,  # Populated below after PipelineResult is assembled
        )

    # ═══════════════════════════════════════════════════════════════════════════
    # Phase 6: Invariant assertion + PipelineResult assembly
    # ═══════════════════════════════════════════════════════════════════════════

    # PIPELINE-LEVEL INVARIANT:
    # Every new commitment from the request must appear in exactly one of
    # the three outcome lists: new_commitments, resolved_updates, or not_resolved_references.
    #
    # The resolver accounts for all of request.new_commitments as either
    # new_commitments or matched_commitments. The pipeline then classifies
    # all matched_commitments into resolved_updates or not_resolved_references.
    # So: new_commitments + resolved_updates + not_resolved_references must == request.new_commitments count.
    expected_total = len(request.new_commitments)
    actual_total = len(new_commitments) + len(resolved_updates) + len(not_resolved_references)

    if expected_total != actual_total:
        error_msg = (
            f"Pipeline invariant violation: new commitment count mismatch. "
            f"Expected: {expected_total} (from request.new_commitments). "
            f"Actual total across three output lists: {actual_total} "
            f"(new={len(new_commitments)}, resolved={len(resolved_updates)}, "
            f"not_resolved_refs={len(not_resolved_references)}). "
            f"This is a code bug in the pipeline dispatch logic — not a data issue."
        )
        log.error(
            "pipeline_invariant_violation",
            meeting_id=request.meeting_id,
            team_id=request.team_id,
            expected=expected_total,
            actual=actual_total,
            new=len(new_commitments),
            resolved=len(resolved_updates),
            not_resolved=len(not_resolved_references),
        )
        raise ResolverInvariantError(error_msg)

    pipeline_result = PipelineResult(
        meeting_id=request.meeting_id,
        team_id=request.team_id,
        new_commitments=new_commitments,
        resolved_updates=resolved_updates,
        not_resolved_references=not_resolved_references,
        unchanged_commitments=unchanged_commitments,
        partial_failure=partial_failure,
        stats=stats,
    )

    # Attach the partial_result to partial_failure (circular reference resolved
    # by building PipelineResult first, then assigning)
    if partial_failure is not None:
        # Check if there is any usable result (not all detections failed)
        has_usable_data = (len(resolved_updates) > 0) or (
            len(not_resolved_references) - detection_calls_failed_count > 0
        )
        if has_usable_data:
            partial_failure.partial_result = pipeline_result

    log.info(
        "pipeline_complete",
        meeting_id=request.meeting_id,
        team_id=request.team_id,
        new_count=stats.new_commitments_count,
        resolved_count=stats.resolved_count,
        not_resolved_refs=stats.not_resolved_references_count,
        unchanged=stats.unchanged_count,
        stage1_blocks=stats.stage1_blocks,
        detection_calls_made=stats.detection_calls_made,
        detection_calls_failed=stats.detection_calls_failed,
        detection_cost_usd=stats.total_detection_cost.estimated_cost_usd,
        total_pipeline_time_ms=stats.total_pipeline_time_ms,
        has_partial_failure=partial_failure is not None,
    )

    return pipeline_result
