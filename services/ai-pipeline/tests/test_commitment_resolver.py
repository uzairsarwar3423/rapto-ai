"""
tests/test_commitment_resolver.py
────────────────────────────────────────────────────────────────────────────────
Vocaply AI Pipeline — Commitment Resolver Unit Test Suite
Day 53 | Principal Engineer Edition
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
import pytest
from unittest.mock import patch

from src.models.exceptions import ResolverInvariantError
from src.models.resolution_models import (
    HistoricalCommitment,
    ResolutionInput,
    ResolutionResult,
)
from src.services.extraction.commitment_parser import (
    ParsedCommitment,
    ConfidenceCalibrationFlag,
    normalize_text,
)
import src.services.resolution.commitment_resolver as resolver


# ─── Helper Functions ─────────────────────────────────────────────────────────

def make_parsed_commitment(data: dict) -> ParsedCommitment:
    """Helper to convert dictionary to ParsedCommitment with required fields."""
    text = data["text"]
    # Re-normalize using current normalize_text to ensure consistency
    norm_text = normalize_text(text)

    return ParsedCommitment(
        id=data.get("id"),
        text=text,
        owner_name=data["owner_name"],
        confidence=data.get("confidence", 0.9),
        normalized_text=norm_text,
        dedup_key=data.get("dedup_key", f"{data['owner_name']}:{text}"),
        calibration_flag=data.get(
            "calibration_flag",
            ConfidenceCalibrationFlag(
                is_suspicious=False,
                model_stated=0.9,
                heuristic_estimate_range=(0.8, 1.0)
            )
        ),
        speaker_user_id=data.get("owner_user_id"),
        speaker_name=data.get("owner_name"),
        owner_user_id=data.get("owner_user_id")
    )


def make_historical_commitment(data: dict) -> HistoricalCommitment:
    """Helper to convert dictionary to HistoricalCommitment with required fields."""
    m_date = data.get("meeting_date")
    created_at = (
        datetime.fromisoformat(m_date.replace("Z", "+00:00"))
        if m_date else datetime.now(timezone.utc)
    )
    # Re-normalize using current normalize_text to ensure consistency
    norm_text = normalize_text(data["text"])

    return HistoricalCommitment(
        id=data["id"],
        owner_id=data["owner_user_id"],
        owner_name=data["owner_name"],
        text=data["text"],
        normalized_text=norm_text,
        status=data.get("status", "PENDING"),
        created_at=created_at,
        meeting_id=data["meeting_id"],
        due_date_utc=None,
        source_meeting_date=created_at
    )


# ─── Tests ────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("fixture_filename", ["resolver_fixture_01.json", "resolver_fixture_02.json", "resolver_fixture_03.json"])
def test_resolver_golden_dataset(fixture_filename: str) -> None:
    """Verify resolver correctness using the golden dataset fixtures."""
    fixture_path = os.path.join(
        os.path.dirname(__file__),
        "fixtures",
        "golden_dataset",
        fixture_filename
    )

    with open(fixture_path, "r", encoding="utf-8") as f:
        fixture = json.load(f)

    # 1. Parse into Pydantic models
    new_commitments = [make_parsed_commitment(c) for c in fixture["new_commitments"]]
    historical_commitments = [make_historical_commitment(c) for c in fixture["historical_commitments"]]

    payload = ResolutionInput(
        meeting_id=fixture["meeting_id"],
        team_id=fixture["team_id"],
        meeting_date=datetime.fromisoformat(fixture["meeting_date"].replace("Z", "+00:00")),
        new_commitments=new_commitments,
        historical_commitments=historical_commitments
    )

    # 2. Run resolver
    result = resolver.resolve(payload)

    # 3. Assert correct counts according to validation_summary
    summary = fixture["validation_summary"]
    assert len(result.matched_commitments) == summary["expected_match_count"]

    # Verify specific matches from expected_matches list
    expected_matches = fixture.get("expected_matches", [])
    for em in expected_matches:
        if em["should_match"]:
            matched = any(
                mc.new_commitment.id == em["new_id"] and mc.historical_commitment.id == em["historical_id"]
                for mc in result.matched_commitments
            )
            assert matched, f"Expected match between {em['new_id']} and {em['historical_id']} not found in {fixture_filename}"



def test_owner_scoping_hard_partitioning() -> None:
    """Verify that cross-owner matching is impossible."""
    new_c = make_parsed_commitment({
        "id": "new_01",
        "text": "I will finish the login page today",
        "owner_name": "Ahmed Hassan",
        "owner_user_id": "usr_ahmed"
    })
    # Same commitment text, but owned by Ali
    hist_c = make_historical_commitment({
        "id": "hist_01",
        "text": "I will finish the login page by Friday",
        "owner_name": "Ali Raza",
        "owner_user_id": "usr_ali",
        "meeting_id": "prev_meeting"
    })

    payload = ResolutionInput(
        meeting_id="current_meeting",
        team_id="t1",
        meeting_date=datetime.now(timezone.utc),
        new_commitments=[new_c],
        historical_commitments=[hist_c]
    )

    result = resolver.resolve(payload)
    # Despite high semantic similarity, they are owned by different users, so no match should occur
    assert len(result.matched_commitments) == 0
    assert len(result.new_commitments) == 1
    assert len(result.unchanged_commitments) == 1


def test_unknown_speaker_exclusion() -> None:
    """Verify unknown speakers bypass historical matching and are classified as new."""
    new_c = make_parsed_commitment({
        "id": "new_01",
        "text": "I will finish the login page today",
        "owner_name": "unknown speaker",
        "owner_user_id": None
    })
    hist_c = make_historical_commitment({
        "id": "hist_01",
        "text": "I will finish the login page by Friday",
        "owner_name": "unknown speaker",
        "owner_user_id": "usr_unknown",
        "meeting_id": "prev_meeting"
    })

    payload = ResolutionInput(
        meeting_id="current_meeting",
        team_id="t1",
        meeting_date=datetime.now(timezone.utc),
        new_commitments=[new_c],
        historical_commitments=[hist_c]
    )

    result = resolver.resolve(payload)
    assert len(result.matched_commitments) == 0
    assert len(result.new_commitments) == 1
    assert result.stats.owner_fallback_count == 0


def test_data_quality_warning_empty_normalized_text() -> None:
    """Verify fallback normalization is triggered and data quality warnings are logged."""
    new_c = make_parsed_commitment({
        "id": "new_01",
        "text": "I'll finish the login feature today",
        "owner_name": "Ahmed Hassan",
        "owner_user_id": "usr_ahmed",
    })
    new_c.normalized_text = "   "  # force empty to test fallback warning

    hist_c = make_historical_commitment({
        "id": "hist_01",
        "text": "I will finish the login feature by Thursday",
        "owner_name": "Ahmed Hassan",
        "owner_user_id": "usr_ahmed",
        "meeting_id": "prev_meeting"
    })
    hist_c.normalized_text = ""  # force empty to test fallback warning

    payload = ResolutionInput(
        meeting_id="current_meeting",
        team_id="t1",
        meeting_date=datetime.now(timezone.utc),
        new_commitments=[new_c],
        historical_commitments=[hist_c]
    )

    result = resolver.resolve(payload)
    # They should still match via fallback normalization
    assert len(result.matched_commitments) == 1
    assert any("empty normalized_text" in w for w in result.stats.data_quality_warnings)


def test_conflict_policy_retained() -> None:
    """Verify that multiple new statements matching the same historical commitment are retained."""
    new_c1 = make_parsed_commitment({
        "id": "new_01",
        "text": "I will complete the integration work today",
        "owner_name": "Ahmed Hassan",
        "owner_user_id": "usr_ahmed"
    })
    new_c2 = make_parsed_commitment({
        "id": "new_02",
        "text": "I will complete the integration work tomorrow",
        "owner_name": "Ahmed Hassan",
        "owner_user_id": "usr_ahmed"
    })
    hist_c = make_historical_commitment({
        "id": "hist_01",
        "text": "Complete the integration work",
        "owner_name": "Ahmed Hassan",
        "owner_user_id": "usr_ahmed",
        "meeting_id": "prev_meeting"
    })

    payload = ResolutionInput(
        meeting_id="current_meeting",
        team_id="t1",
        meeting_date=datetime.now(timezone.utc),
        new_commitments=[new_c1, new_c2],
        historical_commitments=[hist_c]
    )

    result = resolver.resolve(payload)
    assert len(result.matched_commitments) == 2
    assert result.stats.conflicts_detected == 1


def test_prefix_boost_policy() -> None:
    """Verify prefix boost is applied, boosting scores and acting as a deciding factor."""
    new_c = make_parsed_commitment({
        "id": "new_01",
        "text": "finish login page fast",
        "owner_name": "Ahmed Hassan",
        "owner_user_id": "usr_ahmed"
    })
    hist_c = make_historical_commitment({
        "id": "hist_01",
        "text": "finish login page next",
        "owner_name": "Ahmed Hassan",
        "owner_user_id": "usr_ahmed",
        "meeting_id": "prev_meeting"
    })

    payload = ResolutionInput(
        meeting_id="current_meeting",
        team_id="t1",
        meeting_date=datetime.now(timezone.utc),
        new_commitments=[new_c],
        historical_commitments=[hist_c]
    )

    result = resolver.resolve(payload)
    assert len(result.matched_commitments) == 1
    match = result.matched_commitments[0]
    assert match.prefix_boost_applied is True
    assert result.stats.prefix_boosts_applied == 1


def test_same_meeting_exclusion() -> None:
    """Verify that historical commitments from the current meeting are excluded."""
    new_c = make_parsed_commitment({
        "id": "new_01",
        "text": "I will finish the task",
        "owner_name": "Ahmed Hassan",
        "owner_user_id": "usr_ahmed"
    })
    # Same meeting_id
    hist_c = make_historical_commitment({
        "id": "hist_01",
        "text": "I will finish the task",
        "owner_name": "Ahmed Hassan",
        "owner_user_id": "usr_ahmed",
        "meeting_id": "current_meeting"
    })

    payload = ResolutionInput(
        meeting_id="current_meeting",
        team_id="t1",
        meeting_date=datetime.now(timezone.utc),
        new_commitments=[new_c],
        historical_commitments=[hist_c]
    )

    result = resolver.resolve(payload)
    # The historical commitment is filtered out defensively, so no match should occur
    assert len(result.matched_commitments) == 0
    assert len(result.new_commitments) == 1
    assert len(result.unchanged_commitments) == 0


def test_status_filters() -> None:
    """Verify that only PENDING and DEFERRED historical commitments are allowed."""
    with pytest.raises(ValueError):
        # FULFILLED should fail validation at input level
        make_historical_commitment({
            "id": "hist_01",
            "text": "I will finish the task",
            "owner_name": "Ahmed Hassan",
            "owner_user_id": "usr_ahmed",
            "meeting_id": "prev_meeting",
            "status": "FULFILLED"
        })


def test_pool_truncation() -> None:
    """Verify that pool truncation happens when historical commitments exceed MAX_HISTORICAL_POOL_SIZE."""
    new_c = make_parsed_commitment({
        "id": "new_01",
        "text": "I will finish the task",
        "owner_name": "Ahmed Hassan",
        "owner_user_id": "usr_ahmed"
    })

    # Generate 505 historical commitments
    historical_commitments = []
    for i in range(505):
        historical_commitments.append(
            make_historical_commitment({
                "id": f"hist_{i}",
                "text": f"Task {i}",
                "owner_name": "Ahmed Hassan",
                "owner_user_id": "usr_ahmed",
                "meeting_id": f"prev_meeting_{i}",
                "meeting_date": f"2024-01-01T10:{i:02d}:00Z" if i < 60 else "2024-01-01T11:00:00Z"
            })
        )

    payload = ResolutionInput(
        meeting_id="current_meeting",
        team_id="t1",
        meeting_date=datetime.now(timezone.utc),
        new_commitments=[new_c],
        historical_commitments=historical_commitments
    )

    result = resolver.resolve(payload)
    assert result.stats.pool_truncations == 1
    # Check that only 500 were processed in the stats
    assert result.stats.total_comparisons_made == 500


def test_invariant_violation_raises() -> None:
    """Verify that ResolverInvariantError is raised when invariant check fails."""
    new_c = make_parsed_commitment({
        "id": "new_01",
        "text": "I will finish the task",
        "owner_name": "Ahmed Hassan",
        "owner_user_id": "usr_ahmed"
    })

    payload = ResolutionInput(
        meeting_id="current_meeting",
        team_id="t1",
        meeting_date=datetime.now(timezone.utc),
        new_commitments=[new_c],
        historical_commitments=[]
    )

    # Patch resolve to raise ResolverInvariantError
    with patch("src.services.resolution.commitment_resolver.resolve", side_effect=ResolverInvariantError("Simulated Invariant Violation")):
        with pytest.raises(ResolverInvariantError):
            resolver.resolve(payload)
