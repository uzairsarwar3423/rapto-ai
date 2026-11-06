"""Confidence gate decisions and primary/fallback merge."""

from __future__ import annotations

import pytest

from src.models.common import CostRecord, ModelTier
from src.models.extraction_models import (
    ChunkExtractionResult,
    ExtractedActionItem,
    ExtractedCommitment,
    ExtractedDecision,
    ExtractedRisk,
)
from src.services.extraction.action_item_parser import parse_action_item
from src.services.extraction.commitment_parser import parse_commitment
from src.services.extraction.confidence_gate import ALL_EXTRACTORS, ConfidenceGate
from src.services.extraction.decision_parser import parse_decision
from src.services.extraction.risk_parser import parse_risk

gate = ConfidenceGate(threshold=0.60, item_threshold=0.55, min_items=2)


def _decision(text: str, conf: float):
    return parse_decision(ExtractedDecision(text=text, confidence=conf))


def _risk(text: str, conf: float):
    return parse_risk(ExtractedRisk(text=text, confidence=conf))


def _commitment(text: str, owner: str, conf: float):
    return parse_commitment(ExtractedCommitment(text=text, owner_name=owner, confidence=conf))


def _action(text: str, who: str, conf: float):
    return parse_action_item(ExtractedActionItem(text=text, assignee_name=who, priority="MEDIUM", confidence=conf))


def _cost(tokens: int, usd: float) -> CostRecord:
    return CostRecord(input_tokens=tokens, output_tokens=tokens, model_tier=ModelTier.MINI,
                      model_name="m", estimated_cost_usd=usd)


def _chunk(**fields) -> ChunkExtractionResult:
    base = dict(chunk_id="chunk_0", chunk_index=0, succeeded=True, is_first_chunk=True,
                parsed_commitments=[], parsed_action_items=[], parsed_decisions=[],
                parsed_blockers=[], parsed_risks=[], cost=_cost(10, 0.01), providers_used=["openai"])
    base.update(fields)
    return ChunkExtractionResult(**base)


# ── evaluate() ───────────────────────────────────────────────────────────────


def test_empty_chunk_does_not_trigger():
    decision = gate.evaluate(_chunk())
    assert not decision.triggered and decision.item_count == 0


def test_high_confidence_chunk_does_not_trigger():
    chunk = _chunk(parsed_decisions=[_decision("ship friday", 0.95)],
                   parsed_risks=[_risk("deadline slip", 0.85)])
    assert not gate.should_retry_with_fallback(chunk)


def test_low_mean_triggers_all_extractors():
    chunk = _chunk(parsed_decisions=[_decision("maybe ship", 0.58)],
                   parsed_risks=[_risk("could slip", 0.56)])
    decision = gate.evaluate(chunk)
    assert decision.triggered
    assert decision.extractors == ALL_EXTRACTORS
    assert decision.mean_confidence == 0.57


def test_single_low_item_below_min_items_only_triggers_its_extractor():
    chunk = _chunk(parsed_risks=[_risk("vague worry", 0.40)])
    decision = gate.evaluate(chunk)
    assert decision.extractors == ("risks",)
    assert decision.reasons["risks"].startswith("all_items_below")


def test_all_low_extractor_triggers_even_when_mean_is_fine():
    chunk = _chunk(
        parsed_decisions=[_decision("ship friday", 0.95), _decision("use redis", 0.95)],
        parsed_risks=[_risk("unclear", 0.50)],
    )
    assert gate.evaluate(chunk).extractors == ("risks",)


def test_failed_extractor_triggers_retry():
    chunk = _chunk(parsed_decisions=[_decision("ship", 0.95)], failed_extractors=["blockers"])
    decision = gate.evaluate(chunk)
    assert decision.extractors == ("blockers",)
    assert decision.reasons["blockers"] == "primary_extractor_failed"


def test_failed_chunk_never_triggers():
    assert not gate.evaluate(_chunk(succeeded=False)).triggered


# ── merge_primary_and_fallback() ─────────────────────────────────────────────


def test_merge_prefers_higher_mean_and_adds_unique_confident_loser_items():
    primary = _chunk(parsed_risks=[_risk("deadline might slip", 0.50), _risk("vendor lock in risk", 0.62)])
    fallback = _chunk(parsed_risks=[_risk("deadline might slip", 0.85)],
                      cost=_cost(5, 0.02), providers_used=["anthropic"])
    merged = gate.merge_primary_and_fallback(primary, fallback, ["risks"])

    texts = sorted((r.text, r.confidence) for r in merged.parsed_risks)
    # fallback wins (0.85 > 0.56); primary's unique 0.62 item survives (≥ 0.60), duplicate dropped
    assert texts == [("deadline might slip", 0.85), ("vendor lock in risk", 0.62)]
    assert merged.fallback_triggered and merged.fallback_extractors == ["risks"]
    assert merged.providers_used == ["anthropic", "openai"]
    assert merged.cost.estimated_cost_usd == pytest.approx(0.03) and merged.cost.input_tokens == 15


def test_merge_drops_low_confidence_loser_items():
    primary = _chunk(parsed_decisions=[_decision("adopt kafka", 0.40)])
    fallback = _chunk(parsed_decisions=[_decision("ship on friday", 0.90)], providers_used=["anthropic"])
    merged = gate.merge_primary_and_fallback(primary, fallback, ["decisions"])
    assert [d.text for d in merged.parsed_decisions] == ["ship on friday"]


def test_merge_ties_keep_primary():
    primary = _chunk(parsed_decisions=[_decision("ship friday", 0.70)])
    fallback = _chunk(parsed_decisions=[_decision("totally different call", 0.70)], providers_used=["anthropic"])
    merged = gate.merge_primary_and_fallback(primary, fallback, ["decisions"])
    assert merged.parsed_decisions[0].text == "ship friday"


def test_merge_dedups_commitments_by_dedup_key():
    c = _commitment("finish the login feature", "Alice", 0.5)
    primary = _chunk(parsed_commitments=[c])
    fallback = _chunk(parsed_commitments=[_commitment("finish the login feature", "Alice", 0.9)],
                      providers_used=["anthropic"])
    merged = gate.merge_primary_and_fallback(primary, fallback, ["commitments"])
    assert len(merged.parsed_commitments) == 1 and merged.parsed_commitments[0].confidence == 0.9


def test_merge_only_touches_rerun_extractors():
    primary = _chunk(parsed_action_items=[_action("review the PR", "Sara", 0.3)],
                     parsed_risks=[_risk("slip", 0.4)])
    fallback = _chunk(parsed_risks=[_risk("slip risk", 0.9)], providers_used=["anthropic"])
    merged = gate.merge_primary_and_fallback(primary, fallback, ["risks"])
    assert merged.parsed_action_items == primary.parsed_action_items


def test_merge_recovers_failed_primary_extractor():
    primary = _chunk(failed_extractors=["blockers"])
    from src.models.extraction_models import ExtractedBlocker
    from src.services.extraction.blocker_parser import parse_blocker
    fallback = _chunk(parsed_blockers=[parse_blocker(ExtractedBlocker(text="no staging creds", confidence=0.4))],
                      providers_used=["anthropic"])
    merged = gate.merge_primary_and_fallback(primary, fallback, ["blockers"])
    assert len(merged.parsed_blockers) == 1  # failed primary → fallback taken wholesale
    assert merged.failed_extractors == []


def test_merge_keeps_primary_when_fallback_extractor_failed():
    primary = _chunk(parsed_risks=[_risk("slip", 0.4)], failed_extractors=[])
    fallback = _chunk(failed_extractors=["risks"], providers_used=[])
    merged = gate.merge_primary_and_fallback(primary, fallback, ["risks"])
    assert [r.text for r in merged.parsed_risks] == ["slip"]
