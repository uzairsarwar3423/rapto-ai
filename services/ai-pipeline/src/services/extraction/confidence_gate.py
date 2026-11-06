"""
services/extraction/confidence_gate.py
────────────────────────────────────────
Confidence gate for the extraction pipeline: decides when a chunk is
re-extracted with the fallback model (a stronger OpenAI model by default,
or Claude), and merges the two results.

WHEN FALLBACK IS TRIGGERED (any of):
  1. LOW AGGREGATE   — mean confidence across all items the 5 structured
                       extractors produced for the chunk < threshold (0.60),
                       once at least `min_items` items exist (a single item's
                       score is too noisy to act on). → re-run all 5 extractors.
  2. LOW EXTRACTOR   — an extractor returned items and ALL of them are below
                       the item threshold (0.55). → re-run that extractor.
  3. FAILED EXTRACTOR — an extractor raised on the primary model (timeout,
                       refusal, schema failure). → re-run that extractor.
  A chunk with zero items is NOT low-confidence — "nothing to extract" is a
  valid answer, and re-running it would only add cost.

MERGE STRATEGY (per re-run extractor):
  - Winner = the side (primary / fallback) with the higher mean confidence;
    ties go to the primary.
  - Loser items are appended only if (a) their confidence ≥ threshold and
    (b) they are not near-duplicates of a winning item (similarity ≥ 0.70 on
    normalized text, or identical dedup_key). This recovers items one model
    found and the other missed without importing low-confidence noise.
  - The summary is never re-run; the primary summary is kept.

COST NOTE:
  Only re-run extractors are called on the fallback model, so a chunk with one
  weak extractor costs one extra fallback call, not five.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Optional, Sequence

import structlog

from src.config.extraction_config import (
    CONFIDENCE_GATE_MIN_ITEMS,
    CONFIDENCE_GATE_THRESHOLD,
    FALLBACK_MERGE_DEDUP_THRESHOLD,
    LOW_ITEM_CONFIDENCE_THRESHOLD,
)
from src.config.settings import Settings
from src.models.common import CostRecord
from src.models.extraction_models import ChunkExtractionResult
from src.services.extraction.commitment_parser import normalize_text
from src.services.similarity import similarity_score

log = structlog.get_logger(__name__)

# extractor name → ChunkExtractionResult field
EXTRACTOR_FIELDS: dict[str, str] = {
    "commitments": "parsed_commitments",
    "action_items": "parsed_action_items",
    "decisions": "parsed_decisions",
    "blockers": "parsed_blockers",
    "risks": "parsed_risks",
}
ALL_EXTRACTORS: tuple[str, ...] = tuple(EXTRACTOR_FIELDS)


def _item_text(item: Any) -> str:
    for attr in ("normalized_text", "text_normalized", "text"):
        value = getattr(item, attr, None)
        if value:
            return str(value)
    return ""


def _mean(values: Sequence[float]) -> Optional[float]:
    return sum(values) / len(values) if values else None


@dataclass(frozen=True)
class GateDecision:
    triggered: bool
    extractors: tuple[str, ...] = ()
    reasons: dict[str, str] = field(default_factory=dict)  # extractor → reason
    mean_confidence: Optional[float] = None
    item_count: int = 0


class ConfidenceGate:
    def __init__(
        self,
        threshold: float = CONFIDENCE_GATE_THRESHOLD,
        item_threshold: float = LOW_ITEM_CONFIDENCE_THRESHOLD,
        min_items: int = CONFIDENCE_GATE_MIN_ITEMS,
        dedup_threshold: float = FALLBACK_MERGE_DEDUP_THRESHOLD,
    ) -> None:
        self.threshold = threshold
        self.item_threshold = item_threshold
        self.min_items = min_items
        self.dedup_threshold = dedup_threshold

    @classmethod
    def from_settings(cls, settings: Settings) -> ConfidenceGate:
        return cls(
            threshold=settings.confidence_gate_threshold,
            item_threshold=settings.confidence_gate_item_threshold,
            min_items=settings.confidence_gate_min_items,
        )

    # ── Decision ──────────────────────────────────────────────────────────────

    def evaluate(self, chunk: ChunkExtractionResult) -> GateDecision:
        if not chunk.succeeded:
            return GateDecision(triggered=False)

        reasons: dict[str, str] = {}
        all_scores: list[float] = []
        for name, attr in EXTRACTOR_FIELDS.items():
            scores = [float(i.confidence) for i in (getattr(chunk, attr) or [])]
            all_scores.extend(scores)
            if name in chunk.failed_extractors:
                reasons[name] = "primary_extractor_failed"
            elif scores and max(scores) < self.item_threshold:
                reasons[name] = f"all_items_below_{self.item_threshold:.2f}"

        mean = _mean(all_scores)
        if mean is not None and len(all_scores) >= self.min_items and mean < self.threshold:
            for name in ALL_EXTRACTORS:
                reasons.setdefault(name, f"chunk_mean_below_{self.threshold:.2f}")

        ordered = tuple(n for n in ALL_EXTRACTORS if n in reasons)
        return GateDecision(
            triggered=bool(ordered),
            extractors=ordered,
            reasons=reasons,
            mean_confidence=round(mean, 4) if mean is not None else None,
            item_count=len(all_scores),
        )

    def should_retry_with_fallback(self, chunk: ChunkExtractionResult) -> bool:
        return self.evaluate(chunk).triggered

    # ── Merge ─────────────────────────────────────────────────────────────────

    def merge_primary_and_fallback(
        self,
        primary: ChunkExtractionResult,
        fallback: ChunkExtractionResult,
        extractors: Optional[Sequence[str]] = None,
    ) -> ChunkExtractionResult:
        """Merge a fallback re-extraction into the primary chunk result.

        `extractors` limits the merge to the extractors that were re-run; the
        rest keep their primary results untouched.
        """
        extractors = tuple(extractors or ALL_EXTRACTORS)
        update: dict[str, Any] = {}
        still_failed = set(primary.failed_extractors)

        for name in extractors:
            attr = EXTRACTOR_FIELDS[name]
            fallback_failed = name in fallback.failed_extractors or not fallback.succeeded
            if fallback_failed:
                continue  # keep primary (possibly empty) — nothing better available
            still_failed.discard(name)
            update[attr] = self._merge_items(
                list(getattr(primary, attr) or []),
                list(getattr(fallback, attr) or []),
                primary_failed=name in primary.failed_extractors,
            )

        update.update(
            failed_extractors=sorted(still_failed),
            cost=_sum_costs(primary.cost, fallback.cost),
            fallback_triggered=True,
            fallback_extractors=list(extractors),
            providers_used=sorted({*primary.providers_used, *fallback.providers_used}),
        )
        return primary.model_copy(update=update)

    def _merge_items(self, primary: list[Any], fallback: list[Any], primary_failed: bool) -> list[Any]:
        if primary_failed or not primary:
            return fallback
        if not fallback:
            return primary

        p_mean = _mean([i.confidence for i in primary]) or 0.0
        f_mean = _mean([i.confidence for i in fallback]) or 0.0
        winner, loser = (fallback, primary) if f_mean > p_mean else (primary, fallback)

        merged = list(winner)
        norm_cache: dict[int, str] = {}

        def norm(item: Any) -> str:
            key = id(item)
            if key not in norm_cache:
                norm_cache[key] = normalize_text(_item_text(item))
            return norm_cache[key]

        for candidate in loser:
            if candidate.confidence < self.threshold:
                continue
            if any(self._is_duplicate(candidate, kept, norm) for kept in merged):
                continue
            merged.append(candidate)
        return merged

    def _is_duplicate(self, a: Any, b: Any, norm: Callable[[Any], str]) -> bool:
        key_a, key_b = getattr(a, "dedup_key", None), getattr(b, "dedup_key", None)
        if key_a and key_a == key_b:
            return True
        text_a, text_b = norm(a), norm(b)
        if not text_a or not text_b:
            return False
        if text_a == text_b:
            return True
        return similarity_score(text_a, text_b).score >= self.dedup_threshold


def _sum_costs(a: Optional[CostRecord], b: Optional[CostRecord]) -> Optional[CostRecord]:
    if a is None or b is None:
        return a or b
    return CostRecord(
        input_tokens=a.input_tokens + b.input_tokens,
        output_tokens=a.output_tokens + b.output_tokens,
        model_tier=a.model_tier,
        model_name=a.model_name,
        estimated_cost_usd=a.estimated_cost_usd + b.estimated_cost_usd,
    )
