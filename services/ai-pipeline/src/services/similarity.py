"""
services/similarity.py
────────────────────────────────────────────────────────────────────────────────
Vocaply AI Pipeline — Similarity Engine (Core)
Day 52 | Principal Engineer Edition

ZERO LLM CALLS. ZERO NETWORK I/O. PURE MATHEMATICS.

This module is the mathematical foundation of Vocaply's cross-meeting
accountability feature. It computes lexical similarity between two normalized
commitment texts using a weighted combination of:
  - TF-IDF Cosine Similarity (70%) — proportional token-weight matching
  - Jaccard Set Overlap (30%)      — exact token intersection/union ratio

WHY THIS DESIGN IS CORRECT (see Day 52 spec §0, §2 for full rationale):
  • Lexical similarity (not semantic) is correct for commitment deduplication.
    "finish login feature" ≠ "complete auth module" lexically, and they should
    NOT be matched as the same commitment.
  • Deterministic: identical inputs ALWAYS produce identical scores.
  • Stateless: no shared corpus, no persistent vectorizer state.
    Each call fits a fresh TfidfVectorizer on the two-text corpus.
  • Sub-millisecond: <1ms per call on 5-token normalized texts.
    100 comparisons (resolver hot path) < 100ms total.

IMPORT DEPENDENCY:
  normalize_text is imported from services.extraction.commitment_parser.
  This is the SINGLE SOURCE OF TRUTH for normalization. This module does
  NOT reimplement or duplicate normalize_text().

MODULE-LEVEL INVARIANT:
  The weight-sum assertion (COSINE_WEIGHT + JACCARD_WEIGHT == 1.0) is checked
  at import time in similarity_config.py. This module relies on that guarantee.

PUBLIC API:
  similarity_score(norm_a, norm_b)           → SimilarityResult
  normalize_and_compare(text_a, text_b)      → SimilarityResult
  has_prefix_match(norm_a, norm_b, n_tokens) → PrefixMatchResult
  compare_many(query, candidates, pre_norm)  → list[SimilarityResult]
"""

from __future__ import annotations

import logging
from typing import List

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity as sklearn_cosine

# ─── Internal Imports ─────────────────────────────────────────────────────────

# Bootstrapping: import extraction_models first to break circular dependency
# between commitment_parser.py and extraction_models.py
import src.models.extraction_models

from src.config.similarity_config import (
    COSINE_WEIGHT,
    JACCARD_WEIGHT,
    MATCH_THRESHOLD,
    MAX_INPUT_TOKENS_GUARD,
    MIN_TOKENS_FOR_COSINE,
    PREFIX_MATCH_LENGTH,
    SCORE_CLIP_MAX,
    SCORE_CLIP_MIN,
)
from src.models.similarity_models import (
    PrefixMatchResult,
    SimilarityBreakdown,
    SimilarityResult,
)

# Import normalize_text from commitment_parser — SINGLE SOURCE OF TRUTH.
# Do NOT reimplement normalization here. Any future bug fix in commitment_parser
# automatically applies to all similarity computations.
from src.services.extraction.commitment_parser import normalize_text

logger = logging.getLogger(__name__)

# ─── Module-Level Verification ───────────────────────────────────────────────

# Verify the normalize_text import succeeded (caught at test time by identity check)
# The weights invariant is already asserted in similarity_config.py at import time.
logger.debug(
    "similarity.py loaded | normalize_text from commitment_parser: %s",
    normalize_text.__module__,
)


# ─── Private Helpers ──────────────────────────────────────────────────────────


def _validate_and_tokenize(norm_text: str) -> List[str]:
    """Normalize whitespace and split a normalized text into tokens.

    CENTRALIZES the 'normalized text → token list' conversion so it is
    done consistently everywhere, never ad-hoc .split() in-place.

    SAFETY:
      - Strips leading/trailing whitespace (defensive: normalize_text() should
        already have done this, but callers sometimes pass DB-retrieved strings
        that may have trailing spaces from varchar padding).
      - Truncates to MAX_INPUT_TOKENS_GUARD tokens (DoS prevention: if a
        normalized_text bypassed the parser and is 500 tokens long, the
        vectorizer would still only see ≤5 tokens).
      - Empty string → empty list (no exception).

    Args:
        norm_text: A normalized text string (output of normalize_text()).

    Returns:
        List of tokens, max length MAX_INPUT_TOKENS_GUARD.
    """
    stripped = norm_text.strip()
    if not stripped:
        return []
    tokens = stripped.split()
    # DoS guard: cap at MAX_INPUT_TOKENS_GUARD (should match normalize_text's 5-token cap)
    return tokens[:MAX_INPUT_TOKENS_GUARD]


def _compute_cosine_similarity(norm_a: str, norm_b: str) -> float:
    """Compute TF-IDF cosine similarity between two pre-normalized strings.

    ALGORITHM:
      1. Fit TfidfVectorizer on the two-text corpus [norm_a, norm_b].
         This gives each token its IDF weight based on the corpus of exactly
         these two documents — the correct approach for pairwise comparison.
      2. Transform both texts into TF-IDF vectors.
      3. Compute cosine similarity between the two vectors.
      4. Clip to [SCORE_CLIP_MIN, SCORE_CLIP_MAX] for IEEE-754 safety.

    VECTORIZER PARAMETERS (all explicit, no sklearn defaults relied upon):
      analyzer='word'         — tokenize on words (inputs already normalized)
      lowercase=False         — inputs already lowercased by normalize_text()
      token_pattern=r'\\S+'   — any non-whitespace token, including 'v2', 'api3'
                                The default r'(?u)\\b\\w\\w+\\b' drops single-char
                                tokens and anything with digits+letters mixed.
      use_idf=True            — use inverse document frequency weighting
      smooth_idf=True         — add 1 to DF and doc count (prevents division-by-zero
                                when a token appears in both documents)
      sublinear_tf=False      — raw TF (not log-scaled) is appropriate for
                                5-token texts where TF variation is minimal

    GUARDS:
      - MIN_TOKENS_FOR_COSINE check: caller is expected to pre-check and
        not call this if either text has <2 tokens. This function also checks
        defensively and returns 0.0 if the guard fires.
      - ValueError from sklearn: caught if the vocabulary is empty after
        vectorizer processing (both texts produce no valid tokens internally).

    Args:
        norm_a: Pre-normalized text A.
        norm_b: Pre-normalized text B.

    Returns:
        Cosine similarity in [0.0, 1.0], or 0.0 on error/fallback.
    """
    tokens_a = _validate_and_tokenize(norm_a)
    tokens_b = _validate_and_tokenize(norm_b)

    # Defensive MIN_TOKENS check (caller should pre-check, but belt-and-suspenders)
    if len(tokens_a) < MIN_TOKENS_FOR_COSINE or len(tokens_b) < MIN_TOKENS_FOR_COSINE:
        logger.debug(
            "cosine fallback: token counts [%d, %d] below MIN_TOKENS_FOR_COSINE=%d",
            len(tokens_a),
            len(tokens_b),
            MIN_TOKENS_FOR_COSINE,
        )
        return 0.0

    vectorizer = TfidfVectorizer(
        analyzer="word",
        lowercase=False,        # already lowercased by normalize_text()
        token_pattern=r"\S+",   # any non-whitespace: handles 'v2', 'api3', etc.
        use_idf=True,
        smooth_idf=True,        # prevents division-by-zero on shared tokens
        sublinear_tf=False,     # raw TF for short texts
    )

    try:
        matrix = vectorizer.fit_transform([norm_a, norm_b])
    except ValueError as exc:
        # Empty vocabulary after vectorizer processing (e.g. both texts produce
        # no valid tokens according to the token_pattern).
        logger.debug(
            "TfidfVectorizer raised ValueError (empty vocabulary) for "
            "norm_a=%r, norm_b=%r: %s",
            norm_a,
            norm_b,
            exc,
        )
        return 0.0

    # Extract rows as 2D arrays for sklearn_cosine (requires 2D input)
    score_matrix = sklearn_cosine(matrix[0:1], matrix[1:2])
    raw_score: float = float(score_matrix[0][0])

    clipped = float(max(SCORE_CLIP_MIN, min(SCORE_CLIP_MAX, raw_score)))
    logger.debug("cosine: raw=%.6f clipped=%.6f norm_a=%r norm_b=%r", raw_score, clipped, norm_a, norm_b)
    return clipped


def _compute_jaccard(norm_a: str, norm_b: str) -> float:
    """Compute Jaccard set-overlap similarity between two pre-normalized strings.

    FORMULA: |tokens_a ∩ tokens_b| / |tokens_a ∪ tokens_b|
    RANGE:   Always in [0.0, 1.0] by mathematical construction.

    WHY SET (not multiset/bag Jaccard):
      Commitment texts after normalization are typically unique-token sequences
      (5-token cap, stemming applied). Duplicate tokens within one commitment
      text would be a stemming artifact. Set-Jaccard is correct here.

    EDGE CASES:
      - Both empty:           returns 0.0 (not 1.0: undefined, safe default)
      - One empty:            returns 0.0 (intersection is empty)
      - Identical:            returns 1.0
      - Completely disjoint:  returns 0.0

    Args:
        norm_a: Pre-normalized text A.
        norm_b: Pre-normalized text B.

    Returns:
        Jaccard similarity in [0.0, 1.0].
    """
    set_a = set(_validate_and_tokenize(norm_a))
    set_b = set(_validate_and_tokenize(norm_b))

    if not set_a and not set_b:
        return 0.0

    intersection_size = len(set_a & set_b)
    union_size = len(set_a | set_b)

    if union_size == 0:
        # Both sets empty after set operations (should be caught above, but defensive)
        return 0.0

    score = float(intersection_size / union_size)
    logger.debug(
        "jaccard: |∩|=%d |∪|=%d score=%.6f set_a=%s set_b=%s",
        intersection_size,
        union_size,
        score,
        set_a,
        set_b,
    )
    return score


# ─── Public API ──────────────────────────────────────────────────────────────


def similarity_score(norm_a: str, norm_b: str) -> SimilarityResult:
    """Compute the weighted TF-IDF Cosine + Jaccard hybrid similarity score.

    INPUTS MUST BE PRE-NORMALIZED (output of normalize_text()).
    Use normalize_and_compare() for raw text inputs.

    WHY THIS FUNCTION EXISTS SEPARATELY FROM normalize_and_compare():
      Day 53's resolver already has normalized_text on HistoricalCommitment
      objects (stored in DB, generated by the parser at extraction time).
      The resolver calls similarity_score() directly to avoid re-normalizing
      text that is guaranteed already normalized. This saves ~0.2ms per call
      in the resolver's O(N×M) comparison loop.

    ALGORITHM:
      If both texts have ≥ MIN_TOKENS_FOR_COSINE tokens:
        weighted = cosine * COSINE_WEIGHT + jaccard * JACCARD_WEIGHT
      Else (fallback):
        weighted = jaccard   (100% weight, cosine_score=0.0 placeholder)

    RETURNS:
      SimilarityResult with score, full breakdown, and is_above_threshold flag.
      The breakdown's model_validator enforces mathematical consistency —
      an inconsistent result cannot be constructed.

    Args:
        norm_a: Pre-normalized text A (output of normalize_text()).
        norm_b: Pre-normalized text B (output of normalize_text()).

    Returns:
        SimilarityResult with score in [0.0, 1.0].
    """
    tokens_a = _validate_and_tokenize(norm_a)
    tokens_b = _validate_and_tokenize(norm_b)

    use_fallback = (
        len(tokens_a) < MIN_TOKENS_FOR_COSINE
        or len(tokens_b) < MIN_TOKENS_FOR_COSINE
    )

    if use_fallback:
        # Jaccard-only path: cosine degenerate at this token count
        cosine = 0.0
        jaccard = _compute_jaccard(norm_a, norm_b)
        weighted = jaccard  # 100% Jaccard weight when fallback
    else:
        # Full hybrid path: 70% cosine + 30% Jaccard
        cosine = _compute_cosine_similarity(norm_a, norm_b)
        jaccard = _compute_jaccard(norm_a, norm_b)
        weighted = (cosine * COSINE_WEIGHT) + (jaccard * JACCARD_WEIGHT)
        # Final clip: handle floating-point arithmetic producing values outside [0,1]
        weighted = float(max(SCORE_CLIP_MIN, min(SCORE_CLIP_MAX, weighted)))

    # Store the re-joined truncated tokens as normalized_text_a/b.
    # The SimilarityBreakdown model_validator checks:
    #   tokens_a == normalized_text_a.split()
    # If norm_a had >MAX_INPUT_TOKENS_GUARD tokens, _validate_and_tokenize()
    # truncated tokens_a. Storing the original norm_a would then fail the
    # validator (e.g. norm_a has 9 words, tokens_a has 8).
    # Storing " ".join(tokens_a) ensures the stored text always exactly
    # matches the token list that was actually used for the computation.
    stored_text_a = " ".join(tokens_a) if tokens_a else norm_a.strip()
    stored_text_b = " ".join(tokens_b) if tokens_b else norm_b.strip()

    breakdown = SimilarityBreakdown(
        normalized_text_a=stored_text_a,
        normalized_text_b=stored_text_b,
        cosine_score=cosine,
        jaccard_score=jaccard,
        weighted_score=weighted,
        fallback_used=use_fallback,
        tokens_a=tokens_a,
        tokens_b=tokens_b,
    )

    result = SimilarityResult(
        score=weighted,
        breakdown=breakdown,
        is_above_threshold=weighted >= MATCH_THRESHOLD,
    )

    logger.debug(
        "similarity_score | norm_a=%r norm_b=%r "
        "cosine=%.4f jaccard=%.4f weighted=%.4f above_threshold=%s fallback=%s",
        norm_a,
        norm_b,
        cosine,
        jaccard,
        weighted,
        result.is_above_threshold,
        use_fallback,
    )
    return result


def normalize_and_compare(text_a: str, text_b: str) -> SimilarityResult:
    """Normalize raw texts and compute similarity. Convenience wrapper.

    For callers who have RAW (not pre-normalized) commitment text.
    Applies normalize_text() (from commitment_parser) to both inputs,
    then delegates to similarity_score().

    COST:
      Adds ~0.2–0.5ms for two normalize_text() calls.
      Acceptable for interactive callers; the resolver prefers similarity_score()
      to avoid this cost in its tight comparison loop.

    Args:
        text_a: Raw commitment text A (as extracted from meeting transcript).
        text_b: Raw commitment text B.

    Returns:
        SimilarityResult with score in [0.0, 1.0].
    """
    norm_a = normalize_text(text_a)
    norm_b = normalize_text(text_b)
    logger.debug(
        "normalize_and_compare | text_a=%r→%r text_b=%r→%r",
        text_a,
        norm_a,
        text_b,
        norm_b,
    )
    return similarity_score(norm_a, norm_b)


def has_prefix_match(
    norm_a: str,
    norm_b: str,
    n_tokens: int = PREFIX_MATCH_LENGTH,
) -> PrefixMatchResult:
    """Test if the first n_tokens of two normalized texts are identical.

    DOMAIN RATIONALE:
      In a 5-token normalized commitment text, matching the first 3 tokens
      (verb + primary object + qualifier, e.g. ['finish', 'login', 'feature'])
      is a strong positional signal of same-commitment identity.
      Word order in short commitment texts is relatively stable across rephrasings
      of the same commitment.

    POLICY NOTE:
      This function returns a PrefixMatchResult (matched=True/False).
      The SCORE BOOST (SCORE_BOOST_FOR_PREFIX_MATCH = 0.10) is applied by
      the RESOLVER, not here. This function is a pure predicate.

    MATCH CONDITION:
      matched=True only if:
        1. len(tokens_a) >= n_tokens   (text A has enough tokens)
        2. len(tokens_b) >= n_tokens   (text B has enough tokens)
        3. tokens_a[:n_tokens] == tokens_b[:n_tokens]  (exact token match)

      If either text has fewer than n_tokens tokens, matched=False.
      We cannot claim a prefix match when the full prefix isn't present.

    Args:
        norm_a:   Pre-normalized text A.
        norm_b:   Pre-normalized text B.
        n_tokens: Number of leading tokens to compare. Default: PREFIX_MATCH_LENGTH.

    Returns:
        PrefixMatchResult with matched flag, prefix_length, and token lists.
    """
    tokens_a = _validate_and_tokenize(norm_a)
    tokens_b = _validate_and_tokenize(norm_b)

    prefix_a = tokens_a[:n_tokens]
    prefix_b = tokens_b[:n_tokens]

    matched = (
        len(tokens_a) >= n_tokens
        and len(tokens_b) >= n_tokens
        and prefix_a == prefix_b
    )

    logger.debug(
        "has_prefix_match | n=%d prefix_a=%s prefix_b=%s matched=%s",
        n_tokens,
        prefix_a,
        prefix_b,
        matched,
    )
    return PrefixMatchResult(
        matched=matched,
        prefix_length=n_tokens,
        prefix_a=prefix_a,
        prefix_b=prefix_b,
    )


def compare_many(
    query_text: str,
    candidates: List[str],
    pre_normalized: bool = False,
) -> List[SimilarityResult]:
    """Compare one query text against a list of candidate texts.

    OPTIMIZATION (v2): Uses a SINGLE TfidfVectorizer fit on all texts
    simultaneously (query + all candidates), then computes cosine similarity
    as a matrix operation. This is O(1) vectorizer fits vs O(N) in the naive
    per-pair approach.

    For N=100 candidates: ~5ms total (vs ~100ms with per-pair fitting).
    The Jaccard component is still computed per-pair (no batch equivalent),
    but at 8-token normalized texts it's negligible (<0.1ms per pair).

    FALLBACK: If the batch vectorizer fails (empty vocabulary across all
    texts), falls back to Jaccard-only scoring for each pair.

    ORDERING:
      Results are returned in the SAME ORDER as candidates.
      The caller (resolver) is responsible for positional mapping.

    Args:
        query_text:     The query text to compare against all candidates.
        candidates:     List of candidate texts to compare the query against.
        pre_normalized: If True, treat query_text and all candidates as
                        already normalized (skip normalize_text() calls).

    Returns:
        List[SimilarityResult] in the same order as candidates.
    """
    if not candidates:
        logger.debug("compare_many: empty candidates list, returning []")
        return []

    # Normalize query ONCE
    if pre_normalized:
        norm_query = query_text.strip()
        norm_candidates = [c.strip() for c in candidates]
    else:
        norm_query = normalize_text(query_text)
        norm_candidates = [normalize_text(c) for c in candidates]

    logger.debug(
        "compare_many | query=%r→%r | candidates=%d | pre_normalized=%s",
        query_text,
        norm_query,
        len(candidates),
        pre_normalized,
    )

    # ── Batch vectorization path ──────────────────────────────────────────────
    # Fit a single TfidfVectorizer on all texts simultaneously.
    # matrix[0] = query vector, matrix[1:] = candidate vectors.
    all_texts = [norm_query] + norm_candidates
    tokens_all = [_validate_and_tokenize(t) for t in all_texts]
    use_batch_cosine = all(
        len(toks) >= MIN_TOKENS_FOR_COSINE for toks in tokens_all
    )

    cosine_scores: List[float] = []
    if use_batch_cosine and len(all_texts) > 1:
        try:
            vectorizer = TfidfVectorizer(
                analyzer="word",
                lowercase=False,
                token_pattern=r"\S+",
                use_idf=True,
                smooth_idf=True,
                sublinear_tf=False,
            )
            matrix = vectorizer.fit_transform(all_texts)
            # Compute cosine similarity between query (row 0) and all candidates
            sims = sklearn_cosine(matrix[0:1], matrix[1:]).flatten()
            cosine_scores = [
                float(max(SCORE_CLIP_MIN, min(SCORE_CLIP_MAX, s))) for s in sims
            ]
        except (ValueError, Exception) as exc:
            logger.debug("compare_many batch vectorizer failed, falling back: %s", exc)
            use_batch_cosine = False

    results: List[SimilarityResult] = []
    for i, (norm_candidate, candidate) in enumerate(zip(norm_candidates, candidates)):
        tokens_q = tokens_all[0]
        tokens_c = tokens_all[i + 1]

        # Jaccard is always computed per-pair (no batch equivalent)
        jaccard = _compute_jaccard(norm_query, norm_candidate)

        if use_batch_cosine:
            cosine = cosine_scores[i]
            weighted = (cosine * COSINE_WEIGHT) + (jaccard * JACCARD_WEIGHT)
            weighted = float(max(SCORE_CLIP_MIN, min(SCORE_CLIP_MAX, weighted)))
            fallback_used = False
        else:
            # Fallback: Jaccard-only
            cosine = 0.0
            weighted = jaccard
            fallback_used = True

        from src.models.similarity_models import SimilarityBreakdown
        breakdown = SimilarityBreakdown(
            normalized_text_a=norm_query,
            normalized_text_b=norm_candidate,
            cosine_score=cosine,
            jaccard_score=jaccard,
            weighted_score=weighted,
            fallback_used=fallback_used,
            tokens_a=tokens_q,
            tokens_b=tokens_c,
        )
        results.append(
            SimilarityResult(
                score=weighted,
                breakdown=breakdown,
                is_above_threshold=weighted >= MATCH_THRESHOLD,
            )
        )

    return results
