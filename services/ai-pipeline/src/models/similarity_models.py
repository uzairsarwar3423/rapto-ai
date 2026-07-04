"""
models/similarity_models.py
────────────────────────────────────────────────────────────────────────────────
Vocaply AI Pipeline — Similarity Engine Pydantic Models
Day 52 | Principal Engineer Edition

TYPE SYSTEM PHILOSOPHY:
  • Rich types carry ALL context needed for debugging wrong matches.
  • Mathematical invariants are encoded as Pydantic @model_validators —
    it is IMPOSSIBLE to construct an inconsistent SimilarityBreakdown
    (e.g. weighted_score that doesn't match cosine*0.7 + jaccard*0.3).
  • The resolver consumes SimilarityResult.score (top-level float).
    The eval harness and logging layer consume SimilarityResult.breakdown.
  • SimilarityResult.is_above_threshold is a pre-computed convenience field —
    it saves every caller from importing and comparing MATCH_THRESHOLD
    while still keeping the POLICY (whether to act on the match) in the resolver.

MODELS:
  SimilarityBreakdown — full mathematical decomposition of one comparison
  SimilarityResult    — resolver-consumed type (score + breakdown)
  PrefixMatchResult   — returned by has_prefix_match()
"""

from __future__ import annotations

from typing import List

from pydantic import BaseModel, Field, model_validator

from src.config.similarity_config import (
    COSINE_WEIGHT,
    JACCARD_WEIGHT,
    MATCH_THRESHOLD,
)


# ─── SimilarityBreakdown ──────────────────────────────────────────────────────


class SimilarityBreakdown(BaseModel):
    """Full mathematical decomposition of a single pairwise comparison.

    Stored inside SimilarityResult so every caller can answer the question
    "why did these two texts score X?" without re-running the computation.

    OBSERVABILITY CONTRACT:
      - normalized_text_a / normalized_text_b expose exactly what text was
        compared (after normalize_text()) — the primary debugging tool for
        wrong scores.
      - tokens_a / tokens_b are the split token lists, stored explicitly
        (not recomputed from the string) so has_prefix_match() and logging
        can consume them without re-splitting.
      - fallback_used=True means cosine_score is meaningless (0.0 placeholder,
        not a real cosine result). The consumer must check this flag before
        interpreting cosine_score.
    """

    normalized_text_a: str = Field(
        ...,
        description="Text A after normalize_text() was applied. "
        "This is what the vectorizer and Jaccard function received.",
    )
    normalized_text_b: str = Field(
        ...,
        description="Text B after normalize_text() was applied.",
    )
    cosine_score: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Raw TF-IDF cosine similarity before weighting. "
        "0.0 when fallback_used=True (not a real cosine result — "
        "the text was too short for meaningful TF-IDF vectorization).",
    )
    jaccard_score: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Jaccard set-intersection score: |tokens_a ∩ tokens_b| / |tokens_a ∪ tokens_b|. "
        "Always in [0.0, 1.0] by mathematical construction.",
    )
    weighted_score: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Final combined score: cosine*COSINE_WEIGHT + jaccard*JACCARD_WEIGHT "
        "(or jaccard alone when fallback_used=True). "
        "This is the canonical similarity score for this pair.",
    )
    fallback_used: bool = Field(
        ...,
        description="True when Jaccard-only scoring was used because one or both "
        "normalized texts had fewer than MIN_TOKENS_FOR_COSINE tokens. "
        "When True: cosine_score=0.0 (placeholder), "
        "weighted_score=jaccard_score (100% Jaccard weight).",
    )
    tokens_a: List[str] = Field(
        ...,
        description="Token list from normalized_text_a.split(). "
        "Stored explicitly (not recomputed) for resolver logging and prefix-match checks.",
    )
    tokens_b: List[str] = Field(
        ...,
        description="Token list from normalized_text_b.split().",
    )

    @model_validator(mode="after")
    def validate_weighted_score_consistency(self) -> "SimilarityBreakdown":
        """Enforce: weighted_score == (cosine * COSINE_WEIGHT) + (jaccard * JACCARD_WEIGHT)
        within floating-point tolerance, OR weighted_score == jaccard when fallback_used.

        This makes it IMPOSSIBLE to construct a SimilarityBreakdown where the
        weighted_score is arithmetically inconsistent with its components.
        Any future code change that accidentally breaks this formula will be caught
        at model construction time, not silently produce wrong scores.
        """
        if self.fallback_used:
            # Fallback path: 100% Jaccard, cosine is 0.0 placeholder
            expected = self.jaccard_score
            if abs(self.weighted_score - expected) > 1e-6:
                raise ValueError(
                    f"Invariant violation (fallback): weighted_score ({self.weighted_score}) "
                    f"must equal jaccard_score ({self.jaccard_score}) when fallback_used=True. "
                    f"Difference: {abs(self.weighted_score - expected):.2e}"
                )
        else:
            # Normal path: cosine*70% + jaccard*30%
            expected = (self.cosine_score * COSINE_WEIGHT) + (self.jaccard_score * JACCARD_WEIGHT)
            if abs(self.weighted_score - expected) > 1e-6:
                raise ValueError(
                    f"Invariant violation: weighted_score ({self.weighted_score}) != "
                    f"cosine ({self.cosine_score}) * {COSINE_WEIGHT} + "
                    f"jaccard ({self.jaccard_score}) * {JACCARD_WEIGHT} = {expected:.6f}. "
                    f"Difference: {abs(self.weighted_score - expected):.2e}"
                )
        return self

    @model_validator(mode="after")
    def validate_token_consistency(self) -> "SimilarityBreakdown":
        """Enforce: tokens_a is consistent with normalized_text_a.

        A mismatch here would mean the token list used for comparison differs
        from what the stored normalized text says — a correctness bug.
        """
        expected_a = self.normalized_text_a.split() if self.normalized_text_a.strip() else []
        expected_b = self.normalized_text_b.split() if self.normalized_text_b.strip() else []

        if self.tokens_a != expected_a:
            raise ValueError(
                f"tokens_a {self.tokens_a} is inconsistent with "
                f"normalized_text_a '{self.normalized_text_a}' (expected {expected_a})"
            )
        if self.tokens_b != expected_b:
            raise ValueError(
                f"tokens_b {self.tokens_b} is inconsistent with "
                f"normalized_text_b '{self.normalized_text_b}' (expected {expected_b})"
            )
        return self


# ─── SimilarityResult ─────────────────────────────────────────────────────────


class SimilarityResult(BaseModel):
    """The resolver-consumed type: score + breakdown + threshold flag.

    RESOLVER USAGE PATTERN:
      result = similarity_score(norm_a, norm_b)
      if result.is_above_threshold:
          # handle as match
      # logging: result.breakdown.cosine_score, result.breakdown.normalized_text_a, etc.

    DESIGN CHOICES:
      - score is duplicated at top level (also at breakdown.weighted_score) for
        ergonomic access: result.score vs result.breakdown.weighted_score.
        A model_validator enforces they are always identical (within 1e-9).
      - is_above_threshold is pre-computed here (mathematical operation) but
        policy decisions on WHAT TO DO with a match belong to the resolver.
    """

    score: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="The final similarity score in [0.0, 1.0]. "
        "Identical to breakdown.weighted_score. "
        "Provided at top level for ergonomic resolver access.",
    )
    breakdown: SimilarityBreakdown = Field(
        ...,
        description="Full mathematical decomposition. Use for logging, "
        "debugging wrong matches, and the eval harness.",
    )
    is_above_threshold: bool = Field(
        ...,
        description="Pre-computed: score >= MATCH_THRESHOLD. "
        "True = these texts are likely the same commitment. "
        "POLICY (whether to act on this) lives in the resolver.",
    )

    @model_validator(mode="after")
    def validate_score_consistency(self) -> "SimilarityResult":
        """Enforce: score == breakdown.weighted_score within floating-point tolerance."""
        if abs(self.score - self.breakdown.weighted_score) > 1e-9:
            raise ValueError(
                f"score ({self.score}) != breakdown.weighted_score "
                f"({self.breakdown.weighted_score}). "
                "These must be identical — score is a convenience duplicate."
            )
        return self

    @model_validator(mode="after")
    def validate_threshold_flag(self) -> "SimilarityResult":
        """Enforce: is_above_threshold == (score >= MATCH_THRESHOLD)."""
        expected = self.score >= MATCH_THRESHOLD
        if self.is_above_threshold != expected:
            raise ValueError(
                f"is_above_threshold ({self.is_above_threshold}) is inconsistent "
                f"with score ({self.score}) and MATCH_THRESHOLD ({MATCH_THRESHOLD}). "
                f"Expected: {expected}"
            )
        return self


# ─── PrefixMatchResult ────────────────────────────────────────────────────────


class PrefixMatchResult(BaseModel):
    """Result of has_prefix_match() — typed for full observability.

    WHY NOT A BARE BOOL:
      When the resolver applies a score boost because has_prefix_match() is True,
      the log entry should include WHICH prefix tokens matched, not just True/False.
      A PrefixMatchResult makes this possible without an additional computation.

    FIELDS:
      matched       — did the first prefix_length tokens match exactly?
      prefix_length — how many tokens were compared (the n_tokens parameter)
      prefix_a      — the actual prefix token list from text A
      prefix_b      — the actual prefix token list from text B

    WHEN matched=False:
      prefix_a and prefix_b still contain the tokens that were compared,
      so callers can log "first 3 tokens: ['finish','login','feature'] vs
      ['finish','login','page'] → no match" for debugging.
    """

    matched: bool = Field(
        ...,
        description="True if the first prefix_length tokens of both normalized texts "
        "are identical. False if either text has fewer than prefix_length tokens "
        "or if the token lists differ.",
    )
    prefix_length: int = Field(
        ...,
        ge=1,
        description="The number of leading tokens that were compared "
        "(the n_tokens parameter passed to has_prefix_match()).",
    )
    prefix_a: List[str] = Field(
        ...,
        description="The first min(prefix_length, len(tokens_a)) tokens from text A.",
    )
    prefix_b: List[str] = Field(
        ...,
        description="The first min(prefix_length, len(tokens_b)) tokens from text B.",
    )
