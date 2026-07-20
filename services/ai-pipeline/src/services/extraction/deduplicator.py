"""
services/extraction/deduplicator.py
─────────────────────────────────────
Cross-entity deduplication: Commitments vs. Action Items.

DESIGN UPGRADE (industry-level):
  BEFORE: Used raw difflib.SequenceMatcher on .text (un-normalized). This
    was brittle — capitalization, punctuation, and minor wording differences
    caused misses and false positives.

  AFTER: Uses similarity.py's similarity_score() on .normalized_text, which
    is the SINGLE SOURCE OF TRUTH for semantic equivalence across the pipeline.
    This is the same engine used by the commitment resolver — ensuring
    consistent deduplication semantics everywhere.

DEDUPLICATION RULES:
  Rule 1: If an Action Item maps to a Commitment (same assignee + high
    text similarity), the Action Item is removed. Commitments have higher
    accountability weight (first-person promise > assigned task).

  Rule 2: The assignee/owner match is CASE-INSENSITIVE and NAME-NORMALIZED.
    "Ahmed" == "ahmed" == "AHMED" — exact substring of "Ahmed Hassan" also
    matches to handle cases where the model uses a short form vs full name.

  Rule 3: Similarity threshold = MATCH_THRESHOLD from similarity_config.py
    (0.65). This is the platform-documented dedup boundary.
"""

from __future__ import annotations

from typing import List, Tuple

import structlog

from src.models.extraction_models import ParsedActionItem, ParsedCommitment
from src.services.similarity import similarity_score

log = structlog.get_logger(__name__)

# ─── Name-matching helper ─────────────────────────────────────────────────────

_DEDUP_SIMILARITY_THRESHOLD: float = 0.65
"""Minimum similarity score for two entity texts to be considered the same task.
Mirrors MATCH_THRESHOLD in similarity_config.py — kept explicit here for clarity."""


def _names_match(name_a: str, name_b: str) -> bool:
    """Case-insensitive name match with partial-name fallback.

    Handles the common case where the LLM uses "Ahmed" in one extractor
    and "Ahmed Hassan" in another. We consider them the same if either name
    is a substring of the other (both directions), after lowercasing.

    Args:
        name_a: First name (e.g. commitment owner_name).
        name_b: Second name (e.g. action item assignee_name).

    Returns:
        True if names refer to the same person.
    """
    a = name_a.lower().strip()
    b = name_b.lower().strip()
    return a == b or a in b or b in a


# ─── Public Interface ─────────────────────────────────────────────────────────


def deduplicate_commitments_and_action_items(
    commitments: List[ParsedCommitment],
    action_items: List[ParsedActionItem],
) -> Tuple[List[ParsedCommitment], List[ParsedActionItem]]:
    """Remove Action Items that are duplicates of Commitments.

    Commitments take precedence — they represent first-person promises with
    higher accountability signal. When the same task appears as both a
    Commitment (first-person) and an Action Item (potentially third-party
    assigned), the Action Item is removed to avoid double-counting.

    Uses the pipeline's canonical similarity engine (TF-IDF Cosine + Jaccard
    on normalized text) for text comparison, NOT raw string difflib.

    Algorithm:
      For each Action Item:
        For each Commitment:
          1. Check name match (assignee vs owner) using _names_match()
          2. If names match, compute similarity_score(ai.normalized_text, c.normalized_text)
          3. If similarity >= _DEDUP_SIMILARITY_THRESHOLD → mark AI as duplicate
        If not duplicate → keep in output

    Time complexity: O(N_ai × N_commitments) — acceptable for meeting-scale
    entity counts (typically 0-20 per entity type).

    Args:
        commitments: Parsed commitments (already deduped within their own type).
        action_items: Parsed action items (already deduped within their own type).

    Returns:
        (final_commitments, final_action_items) — commitments are unchanged;
        action_items has duplicates-of-commitments removed.
    """
    final_action_items: List[ParsedActionItem] = []
    removed_count = 0

    for ai in action_items:
        ai_normalized = ai.dedup_key.split("::", 1)[-1] if "::" in ai.dedup_key else ai.text.lower()
        is_duplicate = False

        for comm in commitments:
            # Step 1: Name match (fast, O(1))
            if not _names_match(ai.assignee_name, comm.owner_name):
                continue

            # Step 2: Similarity on normalized text (uses the canonical engine)
            sim_result = similarity_score(
                norm_a=comm.normalized_text,
                norm_b=ai_normalized,
            )

            if sim_result.is_above_threshold:
                log.info(
                    "deduplicator_removed_action_item",
                    reason="duplicate_of_commitment",
                    action_item_text=ai.text[:80],
                    commitment_text=comm.text[:80],
                    similarity_score=round(sim_result.score, 4),
                    threshold=_DEDUP_SIMILARITY_THRESHOLD,
                )
                is_duplicate = True
                removed_count += 1
                break

        if not is_duplicate:
            final_action_items.append(ai)

    if removed_count:
        log.info(
            "deduplicator_complete",
            input_commitments=len(commitments),
            input_action_items=len(action_items),
            removed_action_items=removed_count,
            output_action_items=len(final_action_items),
        )

    return list(commitments), final_action_items
