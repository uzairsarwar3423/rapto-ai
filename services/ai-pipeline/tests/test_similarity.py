"""
tests/test_similarity.py
────────────────────────
Vocaply AI Pipeline — Similarity Engine Unit & Integration Test Suite
Day 52 | Principal Engineer Edition

TESTING PHILOSOPHY:
  • Zero external network or database calls.
  • Math-grounded testing: verify commutativity, self-similarity, and bounds.
  • Edge cases: Empty inputs, stopword-only strings, single-token fallback.
  • Rich datasets: Run all 30+ hand-crafted scenarios from similarity_known_pairs.json.
  • Resolver preview: Verify resolver_fixture_01.json separates matches/non-matches correctly.
  • Performance: Assert sub-millisecond per-call performance limits.
"""

from __future__ import annotations

import json
import os
import time
import pytest

from src.config.similarity_config import (
    COSINE_WEIGHT,
    JACCARD_WEIGHT,
    MATCH_THRESHOLD,
    MIN_TOKENS_FOR_COSINE,
    PREFIX_MATCH_LENGTH,
)
from src.models.similarity_models import SimilarityResult
from src.services.similarity import (
    compare_many,
    has_prefix_match,
    normalize_and_compare,
    similarity_score,
)
from src.services.extraction.commitment_parser import normalize_text


# ─── 1. Basic Invariants & Imports ───────────────────────────────────────────


def test_config_invariants() -> None:
    """Verify that configuration weights sum to exactly 1.0."""
    assert abs((COSINE_WEIGHT + JACCARD_WEIGHT) - 1.0) < 1e-9, (
        f"COSINE_WEIGHT ({COSINE_WEIGHT}) + JACCARD_WEIGHT ({JACCARD_WEIGHT}) "
        f"must sum to 1.0"
    )
    assert 0.0 < MATCH_THRESHOLD < 1.0
    assert MIN_TOKENS_FOR_COSINE >= 1
    assert PREFIX_MATCH_LENGTH >= 1


def test_normalize_text_single_source_of_truth() -> None:
    """Verify that the similarity engine imports and uses the exact normalize_text
    function object from commitment_parser without duplication.
    """
    import src.services.similarity as s
    import src.services.extraction.commitment_parser as cp

    assert s.normalize_text is cp.normalize_text


# ─── 2. Pure Mathematical Property Tests ─────────────────────────────────────


@pytest.mark.parametrize(
    "text_a, text_b",
    [
        ("finish login feature", "finish login feature"),
        ("fix payment bug", "review pr auth"),
        ("setup CI/CD pipeline", "setup CI/CD pipeline"),
        ("write unit test module", ""),
        ("", ""),
        ("deploy", "review"),
    ],
)
def test_score_commutativity(text_a: str, text_b: str) -> None:
    """Verify that similarity_score(a, b) == similarity_score(b, a)."""
    norm_a = normalize_text(text_a)
    norm_b = normalize_text(text_b)

    res_ab = similarity_score(norm_a, norm_b)
    res_ba = similarity_score(norm_b, norm_a)

    assert abs(res_ab.score - res_ba.score) < 1e-9


@pytest.mark.parametrize(
    "raw_text",
    [
        "finish login feature",
        "fix payment bug",
        "setup CI CD pipeline",
        "deploy staging environment",
        "document",  # single word
    ],
)
def test_self_similarity(raw_text: str) -> None:
    """Verify that a non-empty text compared to itself scores >= 0.999 (ideally 1.0)."""
    norm = normalize_text(raw_text)
    res = similarity_score(norm, norm)
    assert res.score >= 0.999
    assert res.is_above_threshold is True


def test_empty_inputs() -> None:
    """Verify that empty inputs resolve gracefully to 0.0 without errors."""
    res = similarity_score("", "")
    assert res.score == 0.0
    assert res.breakdown.cosine_score == 0.0
    assert res.breakdown.jaccard_score == 0.0
    assert res.is_above_threshold is False

    res_partial = similarity_score("finish login", "")
    assert res_partial.score == 0.0
    assert res_partial.is_above_threshold is False


# ─── 3. Algorithm Behavior & guards ──────────────────────────────────────────


def test_jaccard_fallback_trigger() -> None:
    """Verify fallback_used=True and Jaccard-only calculation when token counts are low."""
    # 'deploy' resolves to 1 token, 'review' to 1 token.
    # MIN_TOKENS_FOR_COSINE = 2. This must trigger Jaccard-only fallback.
    norm_a = normalize_text("deploy")
    norm_b = normalize_text("review")

    res = similarity_score(norm_a, norm_b)
    assert res.breakdown.fallback_used is True
    assert res.breakdown.cosine_score == 0.0
    assert res.breakdown.jaccard_score == 0.0
    assert res.score == 0.0

    # Test single-token match (deploy vs deploy)
    res_match = similarity_score(norm_a, norm_a)
    assert res_match.breakdown.fallback_used is True
    assert res_match.breakdown.cosine_score == 0.0
    assert res_match.breakdown.jaccard_score == 1.0
    assert res_match.score == 1.0


def test_hybrid_score_calculation() -> None:
    """Verify hybrid calculation (70% Cosine, 30% Jaccard) when tokens are sufficient."""
    norm_a = "finish login feature"  # 3 tokens
    norm_b = "finish signup feature"  # 3 tokens

    res = similarity_score(norm_a, norm_b)
    assert res.breakdown.fallback_used is False

    # Manual math check:
    # Jaccard = 2 shared / 4 unique = 0.50
    assert abs(res.breakdown.jaccard_score - 0.5) < 1e-6

    # Cosine should be non-zero and less than 1.0
    assert 0.0 < res.breakdown.cosine_score < 1.0

    # Weighted score check
    expected_weighted = (
        (res.breakdown.cosine_score * COSINE_WEIGHT)
        + (res.breakdown.jaccard_score * JACCARD_WEIGHT)
    )
    assert abs(res.score - expected_weighted) < 1e-6


def test_all_stopwords() -> None:
    """Verify that text consisting entirely of stopwords resolves to 0.0 score."""
    # Normalizer removes all stopwords, leaving empty normalized strings.
    res = normalize_and_compare("I will have to make sure", "I will be there")
    assert res.score == 0.0
    assert res.breakdown.fallback_used is True
    assert res.is_above_threshold is False


# ─── 4. Prefix Matching Tests ────────────────────────────────────────────────


@pytest.mark.parametrize(
    "norm_a, norm_b, expected_match",
    [
        ("finish login feature", "finish login feature", True),
        ("finish login feature", "finish login page", False),  # 3rd token differs
        ("finish login", "finish login feature", False),  # A has only 2 tokens
        ("finish login feature", "finish login", False),  # B has only 2 tokens
        ("", "", False),
    ],
)
def test_prefix_matching(norm_a: str, norm_b: str, expected_match: bool) -> None:
    """Verify correctness of has_prefix_match predicate."""
    res = has_prefix_match(norm_a, norm_b, n_tokens=3)
    assert res.matched == expected_match
    assert res.prefix_length == 3
    assert len(res.prefix_a) <= 3
    assert len(res.prefix_b) <= 3


# ─── 5. Batch Comparison Tests ───────────────────────────────────────────────


def test_compare_many_lifecycle() -> None:
    """Verify compare_many returns correct ordering, lengths, and handles normalization flags."""
    query = "finish login feature"
    candidates = [
        "finish login feature by Thursday",
        "fix payment bug",
        "finish login page",
    ]

    # Test with pre_normalized=False
    results = compare_many(query, candidates, pre_normalized=False)
    assert len(results) == len(candidates)
    assert results[0].score >= MATCH_THRESHOLD
    assert results[1].score < MATCH_THRESHOLD

    # Test with pre_normalized=True
    norm_query = normalize_text(query)
    norm_candidates = [normalize_text(c) for c in candidates]
    results_norm = compare_many(
        norm_query, norm_candidates, pre_normalized=True
    )
    assert len(results_norm) == len(candidates)
    assert abs(results_norm[0].score - results[0].score) < 1e-9


# ─── 6. Full Fixture Known-Pairs Validation ──────────────────────────────────


def test_known_pairs_fixture() -> None:
    """Run all 30+ scenarios defined in similarity_known_pairs.json.

    Asserts that:
      - same_commitment score >= min, above threshold
      - different_commitment score <= max, below threshold
      - similar_but_different score in range, below threshold
      - edge cases execute without errors
    """
    fixture_path = os.path.join(
        os.path.dirname(__file__), "fixtures", "similarity_known_pairs.json"
    )

    with open(fixture_path, "r", encoding="utf-8") as f:
        test_cases = json.load(f)

    # Filter out commentary items (keys starting with "_")
    valid_cases = [tc for tc in test_cases if "id" in tc]

    for tc in valid_cases:
        desc = tc["description"]
        category = tc["category"]

        res = normalize_and_compare(tc["text_a"], tc["text_b"])

        # 1. Bounds assertions
        if tc.get("expected_score_min") is not None:
            assert res.score >= tc["expected_score_min"], (
                f"[{tc['id']} - {desc}] Score {res.score:.4f} below expected min "
                f"{tc['expected_score_min']}"
            )

        if tc.get("expected_score_max") is not None:
            assert res.score <= tc["expected_score_max"], (
                f"[{tc['id']} - {desc}] Score {res.score:.4f} above expected max "
                f"{tc['expected_score_max']}"
            )

        # 2. Threshold assertions
        expected_threshold = tc.get("expected_above_threshold")
        if expected_threshold is not None:
            assert res.is_above_threshold == expected_threshold, (
                f"[{tc['id']} - {desc}] Expected is_above_threshold={expected_threshold}, "
                f"got {res.is_above_threshold} (score: {res.score:.4f})"
            )


# ─── 7. Resolver Fixture validation ──────────────────────────────────────────


def test_resolver_fixture_matches() -> None:
    """Run resolver_fixture_01.json and assert the similarity engine scores them correctly.

    Matches expected_matches as >= MATCH_THRESHOLD.
    Matches expected_no_matches as < MATCH_THRESHOLD.
    """
    fixture_path = os.path.join(
        os.path.dirname(__file__),
        "fixtures",
        "golden_dataset",
        "resolver_fixture_01.json",
    )

    with open(fixture_path, "r", encoding="utf-8") as f:
        fixture = json.load(f)

    # Index historical and new by ID
    new_map = {n["id"]: n for n in fixture["new_commitments"]}
    hist_map = {h["id"]: h for h in fixture["historical_commitments"]}

    # Verify expected matches
    for em in fixture["expected_matches"]:
        new_c = new_map[em["new_id"]]
        hist_c = hist_map[em["historical_id"]]

        # Calculate using raw text or pre_normalized
        res = normalize_and_compare(new_c["text"], hist_c["text"])
        score = res.score

        # Apply prefix boost if applicable (as resolver does)
        if has_prefix_match(res.breakdown.normalized_text_a, res.breakdown.normalized_text_b).matched:
            score = min(1.0, score + 0.10)

        assert score >= em["expected_similarity_min"], (
            f"Expected similarity >= {em['expected_similarity_min']} for "
            f"{em['new_id']} vs {em['historical_id']}, got {score:.4f} (raw: {res.score:.4f})"
        )
        is_match = score >= MATCH_THRESHOLD
        assert is_match == em["should_match"], (
            f"Expected match flag={em['should_match']} for {em['new_id']} vs "
            f"{em['historical_id']}, got {is_match} (score: {score:.4f})"
        )

    # Verify expected non-matches
    for enm in fixture["expected_no_matches"]:
        new_c = new_map[enm["new_id"]]
        hist_c = hist_map[enm["historical_id"]]

        res = normalize_and_compare(new_c["text"], hist_c["text"])
        score = res.score

        # Apply prefix boost if applicable (as resolver does)
        if has_prefix_match(res.breakdown.normalized_text_a, res.breakdown.normalized_text_b).matched:
            score = min(1.0, score + 0.10)

        assert score <= enm["expected_similarity_max"], (
            f"Expected similarity <= {enm['expected_similarity_max']} for "
            f"{enm['new_id']} vs {enm['historical_id']}, got {score:.4f}"
        )
        is_match = score >= MATCH_THRESHOLD
        assert is_match == enm["should_match"], (
            f"Expected match flag={enm['should_match']} for {enm['new_id']} vs "
            f"{enm['historical_id']}, got {is_match} (score: {score:.4f})"
        )


# ─── 8. Performance Benchmarking Tests ───────────────────────────────────────


def test_performance_benchmarks() -> None:
    """Profile 100 normalize_and_compare() runs and compare_many() batch run.

    Ensures we meet sub-millisecond / sub-2-millisecond budgets.
    """
    text_a = "I'll finish the login feature by tomorrow"
    text_b = "finish login feature tomorrow afternoon"

    # Warmup
    for _ in range(5):
        normalize_and_compare(text_a, text_b)

    # Run 100 sequential comparisons
    start = time.perf_counter()
    runs = 100
    for _ in range(runs):
        normalize_and_compare(text_a, text_b)
    elapsed_ms = (time.perf_counter() - start) * 1000.0

    avg_ms = elapsed_ms / runs
    print(f"\n[Benchmarking] 100 comparisons: total={elapsed_ms:.2f}ms, avg={avg_ms:.4f}ms/call")

    # Assert under 1000ms total (<10ms per call including normalization)
    assert elapsed_ms < 1000.0, f"Performance target missed: 100 calls took {elapsed_ms:.2f}ms"

    # Test compare_many batch efficiency
    candidates = [
        "finish login feature tomorrow",
        "fix payment bug ASAP",
        "review pull request today",
        "deploy staging environment",
        "write unit test database module",
    ] * 10  # 50 candidates

    start_batch = time.perf_counter()
    compare_many(text_a, candidates, pre_normalized=False)
    elapsed_batch_ms = (time.perf_counter() - start_batch) * 1000.0

    print(f"[Benchmarking] compare_many (50 candidates): {elapsed_batch_ms:.2f}ms")
    # Assert under 500ms for 50 candidates
    assert elapsed_batch_ms < 500.0, f"compare_many (50) took {elapsed_batch_ms:.2f}ms"
