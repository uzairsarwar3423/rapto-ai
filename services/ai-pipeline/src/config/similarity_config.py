"""
config/similarity_config.py
────────────────────────────────────────────────────────────────────────────────
Vocaply AI Pipeline — Similarity Engine Configuration
Day 52 | Principal Engineer Edition

ALL tunable constants for the TF-IDF Cosine + Jaccard Weighted Hybrid engine.

DESIGN PRINCIPLES:
  • Every constant is documented with the WHY, not just the what.
  • Weights are asserted to sum to 1.0 at IMPORT TIME (fail-fast).
    If someone accidentally changes COSINE_WEIGHT without adjusting JACCARD_WEIGHT,
    the error surfaces on startup, never silently at first similarity call.
  • The module carries NO logic. It is a named-constant dictionary. Any code
    importing from here can be refactored without touching business logic.

HISTORY:
  Day 52 — initial implementation of similarity engine constants.
  Day 60 — eval harness will validate threshold calibration against real corpus.
"""

# ─── Algorithm Weights ────────────────────────────────────────────────────────

COSINE_WEIGHT: float = 0.70
"""TF-IDF cosine contribution to the combined score.

Platform HLD specifies the 70/30 split as the algorithm specification.
WHY 70%: TF-IDF cosine captures proportional token-weight similarity,
handling cases like 'finish login feature' vs 'finish login page feature'
(3/4 token overlap) better than Jaccard's pure set-intersection view.
"""

JACCARD_WEIGHT: float = 0.30
"""Jaccard keyword-overlap contribution to the combined score.

WHY 30%: Jaccard anchors the score at exactly 0.0 when token sets have
zero intersection — eliminating cosine's known instability on short
two-document corpora with no shared tokens. It acts as a hard correctness
floor on the combined score for completely-disjoint texts.
"""

# ─── Fail-Fast Invariant ─────────────────────────────────────────────────────

assert abs((COSINE_WEIGHT + JACCARD_WEIGHT) - 1.0) < 1e-9, (
    f"INVARIANT VIOLATION: COSINE_WEIGHT ({COSINE_WEIGHT}) + "
    f"JACCARD_WEIGHT ({JACCARD_WEIGHT}) must sum to 1.0 "
    f"(got {COSINE_WEIGHT + JACCARD_WEIGHT}). "
    "Update both values together to maintain the weighting contract."
)

# ─── Cosine Computation Guard ─────────────────────────────────────────────────

MIN_TOKENS_FOR_COSINE: int = 2
"""Minimum token count in BOTH texts for TF-IDF cosine to be meaningful.

WHY 2: A single-token normalized text (e.g. 'deploy') makes TF-IDF degenerate.
In a two-document corpus with one unique token, IDF = log(1/1) = 0,
producing a zero-vector. cosine_similarity on a zero-vector raises
or returns NaN. Two tokens is the minimum for a valid IDF computation.

When either text has fewer than MIN_TOKENS_FOR_COSINE tokens, the engine
falls back to Jaccard-only (100% weight) and sets cosine_score=0.0.
The fallback_used field on SimilarityBreakdown documents this for callers.
"""

# ─── Prefix-Match Configuration ───────────────────────────────────────────────

PREFIX_MATCH_LENGTH: int = 4
"""Number of leading tokens compared in has_prefix_match().

WHY 4: With an 8-token max normalized text (upgraded from 5), the first 4
tokens represent 50% of the commitment's content in positional order.
Matching 4 leading tokens (verb + primary object + qualifier + modifier)
is a strong positional signal of identity without being overly strict.
Updated from 3 → 4 when the normalization cap was raised from 5 → 8 tokens.
"""

SCORE_BOOST_FOR_PREFIX_MATCH: float = 0.10
"""Score boost applied by the RESOLVER (not this engine) when has_prefix_match() is True.

THIS CONSTANT IS OWNED BY THE RESOLVER DOMAIN but lives here because:
  1. It is a similarity-domain tuning parameter (affects score interpretation)
  2. No resolver_config.py exists until Day 53
  3. All similarity tuning parameters should be co-located for eval review

The resolver imports and applies this; similarity.py never reads it.
"""

# ─── Score Clipping Bounds ───────────────────────────────────────────────────

SCORE_CLIP_MIN: float = 0.0
"""Lower bound for clipping raw similarity scores.

IEEE-754 double-precision arithmetic can produce slightly-negative values
(e.g. -1.3e-17) from cosine computation on near-orthogonal vectors.
Clipping prevents Pydantic Field(ge=0.0) validators from rejecting
valid-but-slightly-negative floating-point results.
"""

SCORE_CLIP_MAX: float = 1.0
"""Upper bound for clipping raw similarity scores.

Cosine similarity can produce 1.0000000002 for identical or near-identical
texts due to floating-point representation of 'perfect' alignment.
Clipping prevents Pydantic Field(le=1.0) validators from rejecting these.
"""

# ─── Match Threshold ──────────────────────────────────────────────────────────

MATCH_THRESHOLD: float = 0.65
"""The platform-documented threshold above which two commitments are considered
the same commitment for deduplication purposes.

LIVES HERE IN similarity_config.py (not a future resolver_config.py) because:
  - It is a similarity-domain constant (calibrated against similarity scores)
  - Day 53's resolver will import it from here
  - Exactly ONE file must define it — this is that file

CALIBRATION NOTE (Day 60):
  This value is the result of manual review of sample commitment pairs.
  Day 60's eval harness will run the full historical corpus through the
  engine and produce precision/recall curves for thresholds 0.50–0.85.
  The threshold may be adjusted based on empirical evidence.

POLICY NOTE:
  Whether to ACT on a match (and how) is the resolver's policy.
  This constant merely defines the mathematical boundary.
"""

# ─── DoS / Safety Guard ──────────────────────────────────────────────────────

MAX_INPUT_TOKENS_GUARD: int = 8
"""Maximum tokens allowed into TfidfVectorizer per text input.

This mirrors the 8-token cap in normalize_text() (commitment_parser.py).
_validate_and_tokenize() truncates to this value before passing to
the vectorizer, ensuring a pathologically long normalized_text
(e.g. if DB corruption bypassed the parser) never causes unbounded
vectorizer computation.

Updated from 5 → 8 when normalize_text's _NORMALIZE_MAX_TOKENS was
raised to fix false deduplication of distinct commitments.

NOT a new normalization step — the inputs should already be ≤8 tokens.
This is a DEFENSIVE GUARD only.
"""
