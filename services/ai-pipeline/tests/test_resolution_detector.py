"""
tests/test_resolution_detector.py
────────────────────────────────────────────────────────────────────────────────
Vocaply AI Pipeline — Resolution Detector Test Suite
Day 54 | Principal Engineer Edition

Coverage:
  - Stage 1 Keyword Gate (sync, pure Python)
  - Stage 2 Output logic (mocked OpenAI)
  - detect_many concurrent dispatch
  - Live OpenAI prompt validation against the golden dataset
"""

from __future__ import annotations

import json
import os
from unittest.mock import AsyncMock, patch

import pytest

from src.models.resolution_models import (
    DetectionStatus,
    ResolutionDetectionModelResponse,
    Stage1Reason,
)
from src.services.resolution.resolution_detector import (
    _truncate_text,
    _run_stage1,
    detect_resolution,
    detect_many,
)
from src.models.common import AICallResult, CostRecord, ModelTier, TaskType
from src.models.exceptions import AIRateLimitExhaustedError, AITimeoutError


# ─── Stage 1 Unit Tests (Fully Mocked, No Model) ─────────────────────────────

def test_stage1_empty_short_text_guards():
    # Empty
    res = _run_stage1("")
    assert not res.passed
    assert res.reason == Stage1Reason.EMPTY_TEXT
    assert res.stage1_confidence == 0.75

    # 1 word
    res = _run_stage1("done")
    assert not res.passed
    assert res.reason == Stage1Reason.TEXT_TOO_SHORT
    assert res.stage1_confidence == 0.75

    # 2 words
    res = _run_stage1("I'm done")
    assert not res.passed
    assert res.reason == Stage1Reason.TEXT_TOO_SHORT
    
    # 3 words (passes guard, caught by NCP/Keyword)
    res = _run_stage1("I am done")
    assert res.passed
    assert res.reason == Stage1Reason.COMPLETION_KEYWORD_FOUND
    assert res.matched_keyword == "done"


def test_stage1_non_completion_phrases():
    # Explicit NCP
    res = _run_stage1("I'm still working on the login feature")
    assert not res.passed
    assert res.reason == Stage1Reason.NON_COMPLETION_PHRASE_FOUND
    assert "still working on" in res.matched_phrase.lower()

    # Negation
    res = _run_stage1("I haven't finished the payment bug yet")
    assert not res.passed
    assert res.reason == Stage1Reason.NON_COMPLETION_PHRASE_FOUND
    assert "haven't finished" in res.matched_phrase.lower()

    # Proximity
    res = _run_stage1("I almost finished it")
    assert not res.passed
    assert res.reason == Stage1Reason.NON_COMPLETION_PHRASE_FOUND
    assert "almost" in res.matched_phrase.lower()

    # Time-based
    res = _run_stage1("I didn't get to it this week")
    assert not res.passed
    assert res.reason == Stage1Reason.NON_COMPLETION_PHRASE_FOUND
    assert "didn't get to" in res.matched_phrase.lower()


def test_stage1_completion_keywords():
    res = _run_stage1("I finished the login feature")
    assert res.passed
    assert res.reason == Stage1Reason.COMPLETION_KEYWORD_FOUND
    assert "finished" in res.matched_keyword.lower()

    res = _run_stage1("The PR is merged")
    assert res.passed
    assert res.matched_keyword.lower() == "merged"

    res = _run_stage1("I deployed it to production")
    assert res.passed
    assert res.matched_keyword.lower() == "deployed"

    # Future tense is NOT a completion keyword
    res = _run_stage1("I'll finish it tomorrow")
    assert not res.passed
    assert res.reason == Stage1Reason.NO_COMPLETION_KEYWORD


def test_stage1_word_boundaries():
    # "finish" vs "unfinished"
    res = _run_stage1("I am unfinished with that task")
    assert not res.passed
    assert res.reason == Stage1Reason.NO_COMPLETION_KEYWORD

    # "resolved" vs "unresolved"
    res = _run_stage1("It's an unresolved issue")
    assert not res.passed
    assert res.reason == Stage1Reason.NO_COMPLETION_KEYWORD


def test_stage1_priority_ordering():
    # "almost finished" -> "almost" should trigger NCP before "finished" triggers Keyword
    res = _run_stage1("I almost finished it")
    assert not res.passed
    assert res.reason == Stage1Reason.NON_COMPLETION_PHRASE_FOUND
    assert "almost" in res.matched_phrase.lower()

    res = _run_stage1("I haven't done it yet")
    assert not res.passed
    assert res.reason == Stage1Reason.NON_COMPLETION_PHRASE_FOUND
    assert "haven't done" in res.matched_phrase.lower()


def test_truncate_text():
    # Under limit
    text, trunc = _truncate_text("Short text", 500)
    assert text == "Short text"
    assert not trunc

    # At limit
    text, trunc = _truncate_text("a" * 500, 500)
    assert len(text) <= 500
    assert not trunc

    # Over limit
    long_text = "This is a very long text that goes on and on " * 50
    text, trunc = _truncate_text(long_text, 50)
    assert trunc
    assert len(text) <= 50
    assert not text.endswith(" ") # cleanly cut at word boundary


# ─── Stage 2 Unit Tests (Mocked OpenAI) ──────────────────────────────────────

@pytest.mark.asyncio
async def test_stage2_successful_resolved(mock_openai_client):
    # Mock model saying YES, high confidence
    mock_openai_client.generate_structured.return_value = AICallResult(
        data=ResolutionDetectionModelResponse(resolved=True, confidence=0.88, reason="Mock reason", key_signal=None),
        cost=CostRecord(input_tokens=10, output_tokens=10, model_tier=ModelTier.MINI, model_name="gpt-4", estimated_cost_usd=0.0),
        latency_ms=100.0,
        retry_count=0,
        task_type=TaskType.RESOLUTION_CHECK,
        model_name="gpt-4"
    )

    # Note: "I finished it" has 3 words, passes Stage 1
    res = await detect_resolution("I finished it", "commit", mock_openai_client)
    assert res.status == DetectionStatus.RESOLVED
    assert res.confidence == 0.88
    assert res.stage2_invoked
    assert not res.below_threshold_conservative


@pytest.mark.asyncio
async def test_stage2_successful_not_resolved(mock_openai_client):
    # Mock model saying NO, high confidence
    mock_openai_client.generate_structured.return_value = AICallResult(
        data=ResolutionDetectionModelResponse(resolved=False, confidence=0.90, reason="Mock reason", key_signal=None),
        cost=CostRecord(input_tokens=10, output_tokens=10, model_tier=ModelTier.MINI, model_name="gpt-4", estimated_cost_usd=0.0),
        latency_ms=100.0,
        retry_count=0,
        task_type=TaskType.RESOLUTION_CHECK,
        model_name="gpt-4"
    )

    res = await detect_resolution("I finished it", "commit", mock_openai_client)
    assert res.status == DetectionStatus.NOT_RESOLVED
    assert res.confidence == 0.90
    assert not res.below_threshold_conservative


@pytest.mark.asyncio
async def test_stage2_conservative_threshold(mock_openai_client):
    # 0.55 (below 0.70)
    mock_openai_client.generate_structured.return_value = AICallResult(
        data=ResolutionDetectionModelResponse(resolved=True, confidence=0.55, reason="Mock", key_signal=None),
        cost=CostRecord(input_tokens=10, output_tokens=10, model_tier=ModelTier.MINI, model_name="gpt-4", estimated_cost_usd=0.0),
        latency_ms=100.0,
        retry_count=0,
        task_type=TaskType.RESOLUTION_CHECK,
        model_name="gpt-4"
    )

    res = await detect_resolution("I finished it", "commit", mock_openai_client)
    assert res.status == DetectionStatus.NOT_RESOLVED
    assert res.below_threshold_conservative
    assert res.confidence == 0.55

    # 0.69
    mock_openai_client.generate_structured.return_value.data.confidence = 0.69
    res2 = await detect_resolution("I finished it", "commit", mock_openai_client)
    assert res2.status == DetectionStatus.NOT_RESOLVED
    assert res2.below_threshold_conservative

    # 0.70 (exact boundary)
    mock_openai_client.generate_structured.return_value.data.confidence = 0.70
    res3 = await detect_resolution("I finished it", "commit", mock_openai_client)
    assert res3.status == DetectionStatus.RESOLVED


@pytest.mark.asyncio
async def test_stage2_confidence_capping(mock_openai_client):
    # Model returns 1.0 -> cap at 0.95
    mock_openai_client.generate_structured.return_value = AICallResult(
        data=ResolutionDetectionModelResponse(resolved=True, confidence=1.0, reason="Mock", key_signal=None),
        cost=CostRecord(input_tokens=10, output_tokens=10, model_tier=ModelTier.MINI, model_name="gpt-4", estimated_cost_usd=0.0),
        latency_ms=100.0,
        retry_count=0,
        task_type=TaskType.RESOLUTION_CHECK,
        model_name="gpt-4"
    )

    res = await detect_resolution("I finished it", "commit", mock_openai_client)
    assert res.status == DetectionStatus.RESOLVED
    assert res.confidence == 0.95


@pytest.mark.asyncio
async def test_stage2_detection_failed_handling(mock_openai_client):
    # Simulate infrastructure failure returning None/timeout
    mock_openai_client.generate_structured.side_effect = AITimeoutError("timeout", timeout_seconds=5.0)

    # Note: the wrapper `_invoke_stage2` catches Timeout and returns (None, None)
    res = await detect_resolution("I finished it", "commit", mock_openai_client)
    
    assert res.status == DetectionStatus.DETECTION_FAILED
    assert res.confidence == 0.0
    assert res.stage2_invoked
    assert res.stage2_result is None


@pytest.mark.asyncio
async def test_stage2_not_invoked_on_stage1_block(mock_openai_client):
    # Test all stage 1 failures
    failing_texts = [
        "",                             # EMPTY
        "done",                         # SHORT
        "I'm almost done today",        # NCP
        "I will do it tomorrow",        # NO KEYWORD
    ]
    for txt in failing_texts:
        mock_openai_client.generate_structured.reset_mock()
        res = await detect_resolution(txt, "commit", mock_openai_client)
        assert res.status == DetectionStatus.NOT_RESOLVED
        assert not res.stage2_invoked
        mock_openai_client.generate_structured.assert_not_called()


@pytest.mark.asyncio
async def test_detect_many_batching(mock_openai_client):
    mock_openai_client.generate_structured.return_value = AICallResult(
        data=ResolutionDetectionModelResponse(resolved=True, confidence=0.88, reason="Mock", key_signal=None),
        cost=CostRecord(input_tokens=10, output_tokens=10, model_tier=ModelTier.MINI, model_name="gpt-4", estimated_cost_usd=0.0),
        latency_ms=100.0,
        retry_count=0,
        task_type=TaskType.RESOLUTION_CHECK,
        model_name="gpt-4"
    )

    pairs = [
        ("I will do it", "commit 1"),         # NO KEYWORD -> Blocked
        ("I finished it", "commit 2"),        # PASS
        ("almost done today", "commit 3"),    # NCP -> Blocked
        ("I deployed it", "commit 4"),        # PASS
        ("short", "commit 5"),                # SHORT -> Blocked
    ]

    results = await detect_many(pairs, mock_openai_client)
    
    assert len(results) == 5
    
    # Check original order preserved
    assert results[0].stage1_result.passed == False
    assert results[1].stage1_result.passed == True
    assert results[2].stage1_result.passed == False
    assert results[3].stage1_result.passed == True
    assert results[4].stage1_result.passed == False

    # Check stage 2 was only called 2 times
    assert mock_openai_client.generate_structured.call_count == 2


# ─── Live Prompt Validation Tests (Golden Dataset) ───────────────────────────

@pytest.mark.integration
@pytest.mark.asyncio
async def test_live_resolution_golden_dataset():
    """Live test against GPT-4.1 Mini using the golden dataset."""
    from src.services.openai_client import OpenAIClient
    from src.config.settings import Settings
    
    # We only run this if an actual API key is present
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key or api_key.startswith("test-"):
        pytest.skip("Skipping live prompt validation test (no valid OPENAI_API_KEY)")
        
    settings = Settings(
        openai_api_key=api_key,
        environment="test",
        openai_gpt41_mini_model_name="gpt-4o-mini", # using native OpenAI model name
    )
    client = OpenAIClient(settings=settings)

    fixture_path = os.path.join(
        os.path.dirname(__file__),
        "fixtures",
        "golden_dataset",
        "resolution_fixture_01.json"
    )
    with open(fixture_path, "r", encoding="utf-8") as f:
        fixture = json.load(f)

    meta = fixture["_meta"]
    cases = fixture["cases"]
    
    pairs = [(c["new_statement_text"], c["historical_commitment_text"]) for c in cases]
    results = await detect_many(pairs, client)
    
    assert len(results) == len(cases)
    
    stage2_calls = 0
    total_cost = 0.0
    true_positives = 0
    false_positives = 0
    true_negatives = 0
    false_negatives = 0

    expected_resolutions_count = 0
    expected_not_resolutions_count = 0
    
    for i, case in enumerate(cases):
        res = results[i]
        expected_resolved = case["expected_resolved"]
        
        if expected_resolved:
            expected_resolutions_count += 1
            if res.status == DetectionStatus.RESOLVED:
                true_positives += 1
            else:
                false_negatives += 1
        else:
            expected_not_resolutions_count += 1
            if res.status == DetectionStatus.NOT_RESOLVED:
                true_negatives += 1
            else:
                false_positives += 1
                
        if res.stage2_invoked:
            stage2_calls += 1
            if res.stage2_cost:
                total_cost += res.stage2_cost.estimated_cost_usd

        # No adversarial case should be resolved
        if case["category"] == "ADVERSARIAL":
            assert res.status == DetectionStatus.NOT_RESOLVED, f"Adversarial case {case['id']} was resolved!"

        # No clearly_not case should be resolved
        if "CLEARLY_NOT_RESOLVED" in case["category"]:
            assert res.status == DetectionStatus.NOT_RESOLVED, f"Clear NOT case {case['id']} was resolved!"

    tpr = true_positives / expected_resolutions_count if expected_resolutions_count else 1.0
    tnr = true_negatives / expected_not_resolutions_count if expected_not_resolutions_count else 1.0
    
    stage2_rate = stage2_calls / len(cases) * 100

    print(f"\n--- Live Golden Dataset Results ---")
    print(f"TPR: {tpr:.2%} (Expected >= {meta['expected_tpr']:.2%})")
    print(f"TNR: {tnr:.2%} (Expected >= {meta['expected_tnr']:.2%})")
    print(f"Stage 2 Rate: {stage2_rate:.1f}% (Expected {meta['expected_stage2_invocation_range']['min_pct']}-{meta['expected_stage2_invocation_range']['max_pct']}%)")
    print(f"Total Cost: ${total_cost:.4f}")
    
    assert tpr >= meta["expected_tpr"]
    assert tnr >= meta["expected_tnr"]
    
    min_pct = meta["expected_stage2_invocation_range"]["min_pct"]
    max_pct = meta["expected_stage2_invocation_range"]["max_pct"]
    assert min_pct <= stage2_rate <= max_pct, f"Stage 2 invocation rate {stage2_rate}% outside expected range {min_pct}-{max_pct}%"
    
    assert total_cost < 0.02, "Cost exceeded $0.02 budget for golden dataset"
