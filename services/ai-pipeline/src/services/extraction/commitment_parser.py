"""
services/extraction/commitment_parser.py
────────────────────────────────────────
Parses raw LLM commitment output into fully-enriched ParsedCommitment objects.

NORMALIZE_TEXT DESIGN — 8-token cap (upgraded from 5):
  The normalization pipeline produces a canonical form used as the dedup_key
  seed and as the similarity engine's input. The token cap was raised to 8
  because the original 5-token cap caused false deduplication: two distinct
  commitments like "finish authentication module integration and deploy to
  production" and "finish authentication and write tests" both collapsed to
  "finish authent integrat deploy" — an identical 5-token form despite being
  different tasks.

  8 tokens retains enough semantic uniqueness while keeping the similarity
  engine's O(N×M) TfidfVectorizer calls fast (empirically: <1ms per pair
  up to 10 tokens; vectorizer cost scales with vocabulary size, not token count).

SINGLE SOURCE OF TRUTH:
  normalize_text() is imported by similarity.py — do NOT duplicate it there.
  Any bug fix here propagates automatically to all similarity computations.
"""

from __future__ import annotations

import re
from typing import Optional, Tuple

import structlog

from src.models.extraction_models import (
    ConfidenceCalibrationFlag,
    ExtractedCommitment,
    ParsedCommitment,
)
from src.models.date_models import DateParseResult

log = structlog.get_logger(__name__)

# ─── Stopwords ────────────────────────────────────────────────────────────────
# Carefully curated — only tokens that carry zero discriminative signal.
# "not", "no", "without" are intentionally EXCLUDED: they flip meaning.
STOPWORDS: frozenset[str] = frozenset({
    "i", "will", "have", "the", "a", "an", "by", "to", "it", "my", "is",
    "am", "are", "be", "was", "were", "been", "do", "did", "does", "for",
    "with", "this", "that", "all", "in", "on", "at", "up", "we", "our",
    "ill", "im", "let", "me", "make", "sure",
})

# ─── Max normalized token cap ─────────────────────────────────────────────────
# 8 tokens: enough semantic specificity; avoids false dedup from 5-token cap.
# Update MAX_INPUT_TOKENS_GUARD in similarity_config.py if you change this.
_NORMALIZE_MAX_TOKENS: int = 8


def normalize_text(text: str) -> str:
    """Produce a canonical normalized form for similarity comparison and dedup keying.

    Pipeline:
      1. Lowercase
      2. Strip punctuation (preserve word chars + spaces)
      3. Tokenize on whitespace
      4. Remove stopwords (zero-signal function words)
      5. Suffix stemming (simple rule-based: -ing, -ed, -s)
      6. Take first _NORMALIZE_MAX_TOKENS tokens (8)
      7. Join with spaces

    Args:
        text: Raw commitment text as extracted by the LLM.

    Returns:
        Normalized string suitable for similarity_score() input.
        Empty string if input is empty or all tokens are stopwords.
    """
    # 1. Lowercase
    t = text.lower()
    # 2. Remove punctuation — preserve alphanumeric and spaces
    t = re.sub(r"[^\w\s]", "", t)
    # 3. Tokenize
    tokens = t.split()
    # 4. Remove stopwords
    tokens = [tok for tok in tokens if tok not in STOPWORDS]
    # 5. Simple suffix stemming — applies only to longer tokens to avoid over-stemming
    stemmed: list[str] = []
    for tok in tokens:
        if len(tok) > 5 and tok.endswith("ing"):
            tok = tok[:-3]
        elif len(tok) > 4 and tok.endswith("ed"):
            tok = tok[:-2]
        elif len(tok) > 3 and tok.endswith("s") and not tok.endswith("ss"):
            tok = tok[:-1]
        stemmed.append(tok)
    # 6. Cap at _NORMALIZE_MAX_TOKENS (8)
    stemmed = stemmed[:_NORMALIZE_MAX_TOKENS]
    # 7. Join
    return " ".join(stemmed)


def check_confidence_calibration(
    commitment: ExtractedCommitment,
) -> ConfidenceCalibrationFlag:
    """Heuristic post-hoc confidence audit for LLM-stated confidence values.

    Flags suspicious confidence values that are inconsistent with the
    commitment's linguistic content. Used as a soft signal — the flag is
    stored on ParsedCommitment for downstream monitoring, not used to
    automatically reject commitments.

    Three checks (ordered by importance):
      1. High confidence (>0.60) with no first-person pronoun → suspicious.
         Commitments require first-person ownership. If the text has no "I",
         the LLM may have extracted a third-party statement.
      2. High confidence (>0.70) with hedge words → suspicious.
         "I'll try to look into X" should not have confidence > 0.70.
      3. High confidence (>0.80) on very short text → suspicious.
         A 3-word commitment is rarely specific enough for 0.80+ confidence.

    Args:
        commitment: The raw extracted commitment to audit.

    Returns:
        ConfidenceCalibrationFlag with is_suspicious=True/False and diagnostics.
    """
    text_lower = commitment.text.lower()
    conf = commitment.confidence

    first_person_pronouns = ["i", "i'll", "i'm", "i've", "i'd"]
    has_first_person = any(
        re.search(rf"\b{re.escape(p)}\b", text_lower)
        for p in first_person_pronouns
    )

    hedge_words = ["try", "maybe", "hopefully", "perhaps", "might", "should be able"]
    has_hedge = any(word in text_lower for word in hedge_words)

    word_count = len(text_lower.split())

    if conf > 0.60 and not has_first_person:
        log.debug(
            "commitment_confidence_suspicious",
            reason="high_conf_no_first_person",
            text_preview=commitment.text[:60],
            stated_confidence=conf,
        )
        return ConfidenceCalibrationFlag(
            is_suspicious=True,
            reason="High confidence but no first-person pronoun",
            model_stated=conf,
            heuristic_estimate_range=(0.30, 0.60),
        )

    if conf > 0.70 and has_hedge:
        return ConfidenceCalibrationFlag(
            is_suspicious=True,
            reason="High confidence but contains hedge words",
            model_stated=conf,
            heuristic_estimate_range=(0.30, 0.60),
        )

    if conf > 0.80 and word_count < 8:
        return ConfidenceCalibrationFlag(
            is_suspicious=True,
            reason="High confidence but text is very short",
            model_stated=conf,
            heuristic_estimate_range=(0.30, 0.70),
        )

    return ConfidenceCalibrationFlag(
        is_suspicious=False,
        reason=None,
        model_stated=conf,
        heuristic_estimate_range=(conf, conf),
    )


def build_dedup_key(commitment: ExtractedCommitment, normalized_text: str) -> str:
    """Build a deterministic deduplication key for cross-chunk dedup.

    Format: "<owner_name_lower>::<normalized_text>"

    The owner_name component ensures that the same task committed to by
    different people produces different dedup keys. Normalized text is
    8-token max, so keys are bounded in length.

    Args:
        commitment: The raw extracted commitment.
        normalized_text: Pre-computed normalized text (avoid re-normalizing).

    Returns:
        Deterministic string key suitable for use as a dict key.
    """
    return f"{commitment.owner_name.lower().strip()}::{normalized_text}"


def parse_commitment(raw: ExtractedCommitment) -> ParsedCommitment:
    """Parse a raw LLM-extracted commitment into a fully-enriched ParsedCommitment.

    Enrichment steps:
      1. Normalize text for similarity/dedup
      2. Build dedup_key
      3. Run confidence calibration audit

    Args:
        raw: The LLM-extracted commitment (schema-validated by Pydantic).

    Returns:
        ParsedCommitment with normalized_text, dedup_key, and calibration_flag.
    """
    normalized_text = normalize_text(raw.text)
    dedup_key = build_dedup_key(raw, normalized_text)
    calibration_flag = check_confidence_calibration(raw)

    return ParsedCommitment(
        **raw.model_dump(),
        normalized_text=normalized_text,
        dedup_key=dedup_key,
        calibration_flag=calibration_flag,
    )
