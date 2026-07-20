"""
services/extraction/action_item_parser.py
──────────────────────────────────────────
Parses raw LLM action item output into enriched ParsedActionItem objects.

DEDUP KEY DESIGN:
  "<assignee_name_lower>::<normalized_text>"
  Using normalized text (same pipeline as commitment_parser) ensures
  cross-chunk dedup is semantically consistent, not character-level brittle.
"""

from __future__ import annotations

import re
from typing import Dict, List

import structlog

from src.models.extraction_models import ExtractedActionItem, ParsedActionItem
from src.services.extraction.commitment_parser import normalize_text

log = structlog.get_logger(__name__)


def parse_action_item(raw: ExtractedActionItem) -> ParsedActionItem:
    """Parse a raw LLM-extracted action item into an enriched ParsedActionItem.

    Enrichment:
      1. Strip whitespace from assignee_name
      2. Build dedup_key using normalized text (not raw 80-char prefix)
      3. Normalize assigner_name if present

    Args:
        raw: The LLM-extracted action item (schema-validated by Pydantic).

    Returns:
        ParsedActionItem with dedup_key set.
    """
    assignee_name = raw.assignee_name.strip()
    # Normalize assigner name casing
    assigner_name = raw.assigner_name.strip().title() if raw.assigner_name else None

    # Use normalized text for dedup_key — consistent with commitment_parser
    normalized = normalize_text(raw.text)
    dedup_key = f"{assignee_name.lower()}::{normalized}"

    dump = raw.model_dump()
    dump["assigner_name"] = assigner_name

    return ParsedActionItem(
        **dump,
        dedup_key=dedup_key,
    )


def dedup_action_items(items: List[ParsedActionItem]) -> List[ParsedActionItem]:
    """Deduplicate action items within a single extraction batch (same chunk).

    Uses dedup_key (assignee + normalized text). On tie, prefers:
      1. Higher confidence
      2. Presence of due_date_raw
      3. Presence of assigner_name (indicates explicit delegation)

    Args:
        items: List of parsed action items from a single chunk.

    Returns:
        Deduplicated list preserving the highest-quality item per key.
    """
    deduped: Dict[str, ParsedActionItem] = {}
    for item in items:
        if item.dedup_key not in deduped:
            deduped[item.dedup_key] = item
        else:
            existing = deduped[item.dedup_key]
            # Prefer higher confidence
            if item.confidence > existing.confidence:
                deduped[item.dedup_key] = item
            elif item.confidence == existing.confidence:
                # Prefer item with due_date_raw
                if item.due_date_raw is not None and existing.due_date_raw is None:
                    deduped[item.dedup_key] = item
                # Prefer item with explicit assigner (more context-rich)
                elif item.assigner_name is not None and existing.assigner_name is None:
                    deduped[item.dedup_key] = item
    return list(deduped.values())
