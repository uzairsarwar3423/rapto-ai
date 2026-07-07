"""
tests/test_resolver_pipeline.py
────────────────────────────────────────────────────────────────────────────────
Vocaply AI Pipeline — Resolver Pipeline Unit Tests
Day 55 | Principal Engineer Edition

Tests cover:
  - Happy path: full resolution pipeline with mixed matched/new/unchanged
  - Stage 1 pre-screening savings (N matched, M blocked by Stage 1)
  - Partial failure path (some DETECTION_FAILED outcomes)
  - Total no-match path (resolver found no matches → no Stage 2 calls)
  - Pipeline invariant assertion (deliberate bug simulation)
  - Cost aggregation accuracy (sum across multiple Stage 2 calls)

ALL OpenAI calls are mocked — these are unit tests of the orchestration logic,
not integration tests. Integration tests with live OpenAI calls are in
test_resolve_endpoint.py and the eval harness.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.models.common import CostRecord, ModelTier
from src.models.exceptions import ResolverInvariantError
from src.models.resolution_models import (
    DetectionResult,
    DetectionStatus,
    HistoricalCommitment,
    MatchedCommitment,
    PipelineResult,
    ResolveRequest,
    ResolutionResult,
    ResolutionStats,
    Stage1Reason,
    Stage1Result,
)
from src.services.resolution.resolver_pipeline import run_resolution_pipeline


# ─── Test Fixtures ─────────────────────────────────────────────────────────────

from src.models.extraction_models import (
    ConfidenceCalibrationFlag,
    ParsedCommitment,
)

# Shared sentinel calibration_flag for test fixtures (not suspicious)
_TEST_CALIBRATION_FLAG = ConfidenceCalibrationFlag(
    is_suspicious=False,
    reason=None,
    model_stated=0.85,
    heuristic_estimate_range=(0.75, 0.95),
)


def _make_parsed_commitment(
    id: str,
    text: str,
    owner_name: str = "Ahmed",
    owner_user_id: str = "user_001",
    normalized_text: str = "",
) -> ParsedCommitment:
    return ParsedCommitment(
        id=id,
        dedup_key=f"{id}_dedup",
        text=text,
        normalized_text=normalized_text or text.lower(),
        confidence=0.85,
        owner_name=owner_name,
        owner_user_id=owner_user_id,
        speaker_name=owner_name,
        speaker_user_id=owner_user_id,
        due_date_utc=None,
        due_date_raw=None,
        calibration_flag=_TEST_CALIBRATION_FLAG,
    )



def _make_historical_commitment(
    id: str,
    text: str,
    owner_name: str = "Ahmed",
    owner_id: str = "user_001",
) -> HistoricalCommitment:
    return HistoricalCommitment(
        id=id,
        owner_id=owner_id,
        owner_name=owner_name,
        text=text,
        normalized_text=text.lower(),
        status="PENDING",
        due_date_utc=None,
        created_at=datetime(2026, 6, 10, 9, 0, 0, tzinfo=timezone.utc),
        meeting_id="meeting_prev_01",
        source_meeting_date=datetime(2026, 6, 10, 9, 0, 0, tzinfo=timezone.utc),
    )


def _make_matched_commitment(
    new_comm: ParsedCommitment,
    hist_comm: HistoricalCommitment,
    similarity_score: float = 0.82,
) -> MatchedCommitment:
    from src.models.similarity_models import SimilarityBreakdown
    # Use fallback (Jaccard-only) path so weighted_score == jaccard_score
    # avoiding dependency on COSINE_WEIGHT in tests
    norm_text = "test commitment text"
    tokens = norm_text.split()
    return MatchedCommitment(
        new_commitment=new_comm,
        historical_commitment=hist_comm,
        similarity_score=similarity_score,
        similarity_breakdown=SimilarityBreakdown(
            normalized_text_a=norm_text,
            normalized_text_b=norm_text,
            cosine_score=0.0,
            jaccard_score=similarity_score,
            weighted_score=similarity_score,  # Must equal jaccard when fallback_used=True
            fallback_used=True,
            tokens_a=tokens,
            tokens_b=tokens,
        ),
        prefix_boost_applied=False,
    )



def _make_cost_record(cost_usd: float = 0.0001) -> CostRecord:
    return CostRecord(
        input_tokens=150,
        output_tokens=50,
        model_tier=ModelTier.MINI,
        model_name="gpt-4.1-mini",
        estimated_cost_usd=cost_usd,
    )


def _make_stage1_passed() -> Stage1Result:
    return Stage1Result(
        passed=True,
        reason=Stage1Reason.COMPLETION_KEYWORD_FOUND,
        matched_keyword="finished",
        matched_phrase=None,
        stage1_confidence=0.0,
    )


def _make_stage1_blocked() -> Stage1Result:
    return Stage1Result(
        passed=False,
        reason=Stage1Reason.NON_COMPLETION_PHRASE_FOUND,
        matched_phrase="still working on",
        matched_keyword=None,
        stage1_confidence=0.92,
    )


def _make_resolved_detection(cost_usd: float = 0.0001) -> DetectionResult:
    stage1 = _make_stage1_passed()
    cost = _make_cost_record(cost_usd)
    from src.models.resolution_models import ResolutionDetectionModelResponse
    model_resp = ResolutionDetectionModelResponse(
        resolved=True,
        confidence=0.91,
        reason="Clear completion — merged and deployed.",
        key_signal="finished",
    )
    return DetectionResult(
        status=DetectionStatus.RESOLVED,
        confidence=0.91,
        stage1_result=stage1,
        stage2_invoked=True,
        stage2_result=model_resp,
        stage2_cost=cost,
        below_threshold_conservative=False,
        new_statement_text="I finished the login feature",
        historical_commitment_text="finish the login feature",
    )


def _make_not_resolved_detection() -> DetectionResult:
    stage1 = _make_stage1_passed()
    from src.models.resolution_models import ResolutionDetectionModelResponse
    model_resp = ResolutionDetectionModelResponse(
        resolved=False,
        confidence=0.15,
        reason="Future intent, not completion.",
        key_signal="I'll",
    )
    return DetectionResult(
        status=DetectionStatus.NOT_RESOLVED,
        confidence=0.15,
        stage1_result=stage1,
        stage2_invoked=True,
        stage2_result=model_resp,
        stage2_cost=_make_cost_record(0.00008),
        below_threshold_conservative=False,
        new_statement_text="I'll review Ali's PR today",
        historical_commitment_text="review Ali's PR",
    )


def _make_failed_detection() -> DetectionResult:
    stage1 = _make_stage1_passed()
    return DetectionResult(
        status=DetectionStatus.DETECTION_FAILED,
        confidence=0.0,
        stage1_result=stage1,
        stage2_invoked=True,
        stage2_result=None,
        stage2_cost=None,
        below_threshold_conservative=False,
        new_statement_text="I completed the review",
        historical_commitment_text="review the deployment plan",
    )


def _make_resolve_request(
    new_commitments: List[ParsedCommitment],
    historical_commitments: List[HistoricalCommitment],
) -> ResolveRequest:
    return ResolveRequest(
        meeting_id="meeting_test_01",
        team_id="team_test_01",
        meeting_date=datetime(2026, 6, 15, 9, 0, 0, tzinfo=timezone.utc),
        new_commitments=new_commitments,
        historical_commitments=historical_commitments,
        team_timezone="UTC",
    )


def _make_resolution_stats(
    new_count: int = 0,
    matched_count: int = 0,
    unchanged_count: int = 0,
) -> ResolutionStats:
    return ResolutionStats(
        new_commitments_count=new_count,
        matched_commitments_count=matched_count,
        unchanged_commitments_count=unchanged_count,
        total_owners_processed=1,
        total_comparisons_made=matched_count * 2,
        prefix_boosts_applied=0,
        conflicts_detected=0,
        owner_fallback_count=0,
        pool_truncations=0,
        processing_time_ms=12.5,
        data_quality_warnings=[],
    )


# ─── Test: Happy Path ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_happy_path_full_resolution():
    """Resolver returns 3 matched + 2 new + 4 unchanged; 1 RESOLVED, 2 NOT_RESOLVED.

    Expected pipeline result:
      - resolved_updates: 1
      - not_resolved_references: 2 (1 NOT_RESOLVED Stage2 + 1 Stage1 blocked)
      - new_commitments: 2
      - unchanged_commitments: 4
    """
    # Build test commitments
    new_resolved = _make_parsed_commitment("new_01", "I finished the login feature", "Ahmed", "user_001")
    new_not_resolved = _make_parsed_commitment("new_02", "I'll review the PR today", "Sara", "user_002")
    new_01 = _make_parsed_commitment("new_03", "I'll set up the caching", "Ali", "user_003")  # Stage 1 blocks
    extra_new_01 = _make_parsed_commitment("new_04", "new commitment 1", "Zara", "user_004")
    extra_new_02 = _make_parsed_commitment("new_05", "new commitment 2", "Omar", "user_005")

    hist_01 = _make_historical_commitment("hist_01", "finish the login feature", "Ahmed", "user_001")
    hist_02 = _make_historical_commitment("hist_02", "review the PR", "Sara", "user_002")
    hist_03 = _make_historical_commitment("hist_03", "set up caching", "Ali", "user_003")
    hist_unchanged = [
        _make_historical_commitment(f"hist_unch_0{i}", f"old commitment {i}", "Eve", f"user_00{i+4}")
        for i in range(1, 5)
    ]

    matched_resolved = _make_matched_commitment(new_resolved, hist_01)
    matched_stage1_blocked = _make_matched_commitment(new_01, hist_03)  # Stage 1 blocks (no keyword)
    matched_not_resolved = _make_matched_commitment(new_not_resolved, hist_02)

    mock_resolution_result = ResolutionResult(
        meeting_id="meeting_test_01",
        team_id="team_test_01",
        new_commitments=[extra_new_01, extra_new_02],
        matched_commitments=[matched_resolved, matched_stage1_blocked, matched_not_resolved],
        unchanged_commitments=hist_unchanged,
        stats=_make_resolution_stats(new_count=2, matched_count=3, unchanged_count=4),
    )

    request = _make_resolve_request(
        new_commitments=[new_resolved, new_not_resolved, new_01, extra_new_01, extra_new_02],
        historical_commitments=[hist_01, hist_02, hist_03] + hist_unchanged,
    )

    mock_ai_client = MagicMock()

    # Stage 1: "I finished" → passes; "I'll review" → passes; "I'll set up caching" → no keyword, blocks
    # Stage 2: for "I finished" → RESOLVED; for "I'll review" → NOT_RESOLVED
    resolved_detection = _make_resolved_detection()
    not_resolved_detection = _make_not_resolved_detection()

    with (
        patch("src.services.resolution.resolver_pipeline.resolve", return_value=mock_resolution_result),
        patch(
            "src.services.resolution.resolver_pipeline._run_stage1",
            side_effect=[
                _make_stage1_passed(),    # new_resolved → passes
                Stage1Result(             # new_01 (I'll set up) → no keyword, blocks
                    passed=False,
                    reason=Stage1Reason.NO_COMPLETION_KEYWORD,
                    matched_phrase=None,
                    matched_keyword=None,
                    stage1_confidence=0.88,
                ),
                _make_stage1_passed(),    # new_not_resolved → passes
            ],
        ),
        patch(
            "src.services.resolution.resolver_pipeline.detect_resolution",
            side_effect=[resolved_detection, not_resolved_detection],
        ),
    ):
        result = await run_resolution_pipeline(request, mock_ai_client)

    assert isinstance(result, PipelineResult)
    assert len(result.resolved_updates) == 1
    assert len(result.not_resolved_references) == 2  # 1 Stage1 blocked + 1 NOT_RESOLVED
    assert len(result.new_commitments) == 2
    assert len(result.unchanged_commitments) == 4
    assert result.partial_failure is None

    # Verify the resolved update points to hist_01
    assert result.resolved_updates[0].historical_commitment_id == "hist_01"

    # Stats sanity
    assert result.stats.stage1_blocks == 1
    assert result.stats.detection_calls_made == 2
    assert result.stats.resolved_count == 1
    assert result.stats.total_pipeline_time_ms > 0


# ─── Test: Stage 1 Pre-Screening Savings ─────────────────────────────────────

@pytest.mark.asyncio
async def test_stage1_prescreening_blocks_majority():
    """5 matched pairs; 4 blocked by Stage 1; 1 passes to Stage 2.

    Verifies that exactly 1 detect_resolution() call is made
    and stage1_blocks == 4 in stats.
    """
    new_comms = [
        _make_parsed_commitment(f"new_{i:02d}", f"commitment {i}", "Ahmed", "user_001")
        for i in range(1, 6)
    ]
    hist_comms = [
        _make_historical_commitment(f"hist_{i:02d}", f"hist commitment {i}", "Ahmed", "user_001")
        for i in range(1, 6)
    ]
    matched = [_make_matched_commitment(nc, hc) for nc, hc in zip(new_comms, hist_comms)]

    mock_resolution_result = ResolutionResult(
        meeting_id="meeting_test_01",
        team_id="team_test_01",
        new_commitments=[],
        matched_commitments=matched,
        unchanged_commitments=[],
        stats=_make_resolution_stats(matched_count=5),
    )

    request = _make_resolve_request(new_comms, hist_comms)
    mock_ai_client = MagicMock()

    # Stage 1: 4 blocked, 1 passes
    stage1_results = [
        Stage1Result(passed=False, reason=Stage1Reason.NO_COMPLETION_KEYWORD,
                     matched_phrase=None, matched_keyword=None, stage1_confidence=0.88),
        Stage1Result(passed=False, reason=Stage1Reason.NON_COMPLETION_PHRASE_FOUND,
                     matched_phrase="still working", matched_keyword=None, stage1_confidence=0.92),
        Stage1Result(passed=True, reason=Stage1Reason.COMPLETION_KEYWORD_FOUND,
                     matched_phrase=None, matched_keyword="finished", stage1_confidence=0.0),
        Stage1Result(passed=False, reason=Stage1Reason.NO_COMPLETION_KEYWORD,
                     matched_phrase=None, matched_keyword=None, stage1_confidence=0.88),
        Stage1Result(passed=False, reason=Stage1Reason.NO_COMPLETION_KEYWORD,
                     matched_phrase=None, matched_keyword=None, stage1_confidence=0.88),
    ]

    detect_call_count = 0

    async def mock_detect(*args, **kwargs):
        nonlocal detect_call_count
        detect_call_count += 1
        return _make_resolved_detection()

    with (
        patch("src.services.resolution.resolver_pipeline.resolve", return_value=mock_resolution_result),
        patch("src.services.resolution.resolver_pipeline._run_stage1", side_effect=stage1_results),
        patch("src.services.resolution.resolver_pipeline.detect_resolution", side_effect=mock_detect),
    ):
        result = await run_resolution_pipeline(request, mock_ai_client)

    assert detect_call_count == 1, f"Expected exactly 1 Stage 2 call, got {detect_call_count}"
    assert result.stats.stage1_blocks == 4
    assert result.stats.detection_calls_made == 1
    assert len(result.resolved_updates) == 1
    assert len(result.not_resolved_references) == 4  # 4 Stage1 blocked


# ─── Test: Partial Failure Path ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_partial_failure_one_detection_failed():
    """3 matched pairs pass Stage 1; 1 returns DETECTION_FAILED.

    Verifies:
      - partial_failure is not None
      - partial_failure.detection_failed == 1
      - failed_historical_ids contains the failed pair's hist ID
      - The 2 successful detection results are still in PipelineResult
    """
    new_comms = [
        _make_parsed_commitment(f"new_{i:02d}", f"I finished task {i}", "Ahmed", "user_001")
        for i in range(1, 4)
    ]
    hist_comms = [
        _make_historical_commitment(f"hist_{i:02d}", f"finish task {i}", "Ahmed", "user_001")
        for i in range(1, 4)
    ]
    matched = [_make_matched_commitment(nc, hc) for nc, hc in zip(new_comms, hist_comms)]

    mock_resolution_result = ResolutionResult(
        meeting_id="meeting_test_01",
        team_id="team_test_01",
        new_commitments=[],
        matched_commitments=matched,
        unchanged_commitments=[],
        stats=_make_resolution_stats(matched_count=3),
    )

    request = _make_resolve_request(new_comms, hist_comms)
    mock_ai_client = MagicMock()

    stage1_all_pass = [
        Stage1Result(passed=True, reason=Stage1Reason.COMPLETION_KEYWORD_FOUND,
                     matched_phrase=None, matched_keyword="finished", stage1_confidence=0.0)
        for _ in range(3)
    ]

    detection_results = [
        _make_resolved_detection(0.0001),
        _make_failed_detection(),  # DETECTION_FAILED for hist_02
        _make_not_resolved_detection(),
    ]

    with (
        patch("src.services.resolution.resolver_pipeline.resolve", return_value=mock_resolution_result),
        patch("src.services.resolution.resolver_pipeline._run_stage1", side_effect=stage1_all_pass),
        patch("src.services.resolution.resolver_pipeline.detect_resolution", side_effect=detection_results),
    ):
        result = await run_resolution_pipeline(request, mock_ai_client)

    assert result.partial_failure is not None
    assert result.partial_failure.detection_failed == 1
    assert result.partial_failure.detection_succeeded == 2
    assert result.partial_failure.total_matched == 3
    assert "hist_02" in result.partial_failure.failed_historical_ids
    assert len(result.resolved_updates) == 1
    # not_resolved_references includes both NOT_RESOLVED and DETECTION_FAILED
    assert len(result.not_resolved_references) == 2

    # Verify DETECTION_FAILED is marked with detection_status DETECTION_FAILED
    failed_refs = [r for r in result.not_resolved_references if r.detection_status == "DETECTION_FAILED"]
    assert len(failed_refs) == 1
    assert failed_refs[0].historical_commitment_id == "hist_02"


# ─── Test: Zero Matches (No Stage 2 calls needed) ─────────────────────────────

@pytest.mark.asyncio
async def test_zero_matched_commitments():
    """Resolver found no matches → partial_failure is None, detection_calls_made == 0."""
    new_comm = _make_parsed_commitment("new_01", "I'll start the new project", "Ahmed", "user_001")
    hist_comm = _make_historical_commitment("hist_01", "completely different task", "Sara", "user_002")

    mock_resolution_result = ResolutionResult(
        meeting_id="meeting_test_01",
        team_id="team_test_01",
        new_commitments=[new_comm],  # All classified as new
        matched_commitments=[],      # No matches
        unchanged_commitments=[hist_comm],
        stats=_make_resolution_stats(new_count=1, unchanged_count=1),
    )

    request = _make_resolve_request([new_comm], [hist_comm])
    mock_ai_client = MagicMock()

    with (
        patch("src.services.resolution.resolver_pipeline.resolve", return_value=mock_resolution_result),
        patch("src.services.resolution.resolver_pipeline.detect_resolution") as mock_detect,
    ):
        result = await run_resolution_pipeline(request, mock_ai_client)

    mock_detect.assert_not_called()
    assert result.partial_failure is None
    assert result.stats.detection_calls_made == 0
    assert result.stats.stage1_blocks == 0
    assert len(result.new_commitments) == 1
    assert len(result.unchanged_commitments) == 1


# ─── Test: Invariant Assertion ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_invariant_violation_raises_error():
    """Deliberate bug simulation: resolver drops one commitment → ResolverInvariantError raised."""
    new_comm_01 = _make_parsed_commitment("new_01", "I finished the login feature", "Ahmed", "user_001")
    new_comm_02 = _make_parsed_commitment("new_02", "I'll do the tests", "Sara", "user_002")
    hist_comm = _make_historical_commitment("hist_01", "finish the login feature", "Ahmed", "user_001")

    # BUG SIMULATION: resolver returns new_comm_01 in matched, but new_comm_02 is
    # dropped entirely (not in new_commitments or matched_commitments)
    mock_resolution_result = ResolutionResult(
        meeting_id="meeting_test_01",
        team_id="team_test_01",
        new_commitments=[],  # new_comm_02 is missing!
        matched_commitments=[_make_matched_commitment(new_comm_01, hist_comm)],
        unchanged_commitments=[],
        stats=_make_resolution_stats(matched_count=1),
    )

    # Request has 2 new_commitments, but resolver only accounts for 1
    request = _make_resolve_request([new_comm_01, new_comm_02], [hist_comm])
    mock_ai_client = MagicMock()

    with (
        patch("src.services.resolution.resolver_pipeline.resolve", return_value=mock_resolution_result),
        patch(
            "src.services.resolution.resolver_pipeline._run_stage1",
            return_value=_make_stage1_passed(),
        ),
        patch(
            "src.services.resolution.resolver_pipeline.detect_resolution",
            return_value=_make_resolved_detection(),
        ),
    ):
        with pytest.raises(ResolverInvariantError) as exc_info:
            await run_resolution_pipeline(request, mock_ai_client)

    assert "invariant" in str(exc_info.value).lower()


# ─── Test: Cost Aggregation ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_cost_aggregation_exact():
    """3 Stage 2 calls with known mock costs → total_cost == sum to 6 decimal places."""
    costs = [0.000123, 0.000087, 0.000156]  # 3 individual call costs
    expected_total = sum(costs)

    new_comms = [
        _make_parsed_commitment(f"new_{i:02d}", f"I finished task {i}", "Ahmed", "user_001")
        for i in range(1, 4)
    ]
    hist_comms = [
        _make_historical_commitment(f"hist_{i:02d}", f"finish task {i}", "Ahmed", "user_001")
        for i in range(1, 4)
    ]
    matched = [_make_matched_commitment(nc, hc) for nc, hc in zip(new_comms, hist_comms)]

    mock_resolution_result = ResolutionResult(
        meeting_id="meeting_test_01",
        team_id="team_test_01",
        new_commitments=[],
        matched_commitments=matched,
        unchanged_commitments=[],
        stats=_make_resolution_stats(matched_count=3),
    )

    request = _make_resolve_request(new_comms, hist_comms)
    mock_ai_client = MagicMock()

    stage1_all_pass = [
        Stage1Result(passed=True, reason=Stage1Reason.COMPLETION_KEYWORD_FOUND,
                     matched_phrase=None, matched_keyword="finished", stage1_confidence=0.0)
        for _ in range(3)
    ]

    detection_results = [
        _make_resolved_detection(c) for c in costs
    ]

    with (
        patch("src.services.resolution.resolver_pipeline.resolve", return_value=mock_resolution_result),
        patch("src.services.resolution.resolver_pipeline._run_stage1", side_effect=stage1_all_pass),
        patch("src.services.resolution.resolver_pipeline.detect_resolution", side_effect=detection_results),
    ):
        result = await run_resolution_pipeline(request, mock_ai_client)

    actual_total = result.stats.total_detection_cost.estimated_cost_usd
    assert abs(actual_total - expected_total) < 1e-9, (
        f"Cost aggregation error: expected {expected_total:.9f}, got {actual_total:.9f}"
    )
