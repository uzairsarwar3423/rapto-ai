"""v3.1 schema enrichments: defaults, normalisation, backward compatibility."""

from __future__ import annotations

from src.models.extraction_models import (
    BlockersResponse,
    DecisionType,
    DecisionsResponse,
    ExtractedBlocker,
    ExtractedDecision,
    ExtractedRisk,
    RiskCategory,
    RiskProbability,
    RisksResponse,
    SeverityLevel,
)
from src.services.extraction.blocker_parser import parse_blocker
from src.services.extraction.decision_parser import parse_decision
from src.services.extraction.risk_parser import parse_risk


def test_v30_shaped_output_still_validates_with_defaults():
    """A model still emitting the v3.0 shape must not fail validation."""
    d = ExtractedDecision(text="Ship Friday", confidence=0.9)
    assert d.reversible is True and d.dissent is None
    b = ExtractedBlocker(text="Blocked on API keys", confidence=0.9)
    assert b.escalation_flag is False and b.estimated_unblock_date is None
    r = ExtractedRisk(text="Might slip", confidence=0.8)
    assert r.probability == RiskProbability.MEDIUM and r.mitigation_mentioned is None


def test_free_text_fields_are_trimmed_truncated_and_blank_to_none():
    d = ExtractedDecision(text="x", confidence=0.9, dissent="  " )
    assert d.dissent is None
    d = ExtractedDecision(text="x", confidence=0.9, dissent="A" * 800)
    assert len(d.dissent) == 500 and d.dissent.endswith("…")
    b = ExtractedBlocker(text="x", confidence=0.9, estimated_unblock_date=" after Friday ")
    assert b.estimated_unblock_date == "after Friday"


def test_enum_fields_tolerate_case_and_unknown_values():
    r = ExtractedRisk(text="x", confidence=0.5, probability="high", category="security")
    assert r.probability == RiskProbability.HIGH and r.category == RiskCategory.SECURITY
    r = ExtractedRisk(text="x", confidence=0.5, probability="very likely", category="legal")
    assert r.probability == RiskProbability.MEDIUM and r.category == RiskCategory.TECHNICAL
    r = ExtractedRisk(text="x", confidence=0.5, probability=None)
    assert r.probability == RiskProbability.MEDIUM
    b = ExtractedBlocker(text="x", confidence=0.5, severity="blocker")
    assert b.severity == SeverityLevel.MEDIUM
    d = ExtractedDecision(text="x", confidence=0.5, decision_type="process")
    assert d.decision_type == DecisionType.PROCESS


def test_parsers_carry_new_fields_through():
    d = parse_decision(ExtractedDecision(text="Sign contract", confidence=0.9, reversible=False, dissent="Ali disagreed"))
    assert d.reversible is False and d.dissent == "Ali disagreed"
    b = parse_blocker(ExtractedBlocker(text="No creds", confidence=0.9, escalation_flag=True, estimated_unblock_date="Thursday"))
    assert b.escalation_flag is True and b.estimated_unblock_date == "Thursday"
    r = parse_risk(ExtractedRisk(text="Slip", confidence=0.9, probability="LOW", mitigation_mentioned="feature flag"))
    assert r.probability == RiskProbability.LOW and r.mitigation_mentioned == "feature flag"


def test_envelope_json_round_trip_matches_prompt_schema():
    """The OUTPUT SCHEMA blocks in the prompts describe these envelopes."""
    assert DecisionsResponse.model_validate_json(
        '{"decisions":[{"text":"a","confidence":0.9,"reversible":false,"dissent":null}]}'
    ).decisions[0].reversible is False
    assert BlockersResponse.model_validate_json(
        '{"blockers":[{"text":"a","confidence":0.9,"escalation_flag":true}]}'
    ).blockers[0].escalation_flag is True
    assert RisksResponse.model_validate_json(
        '{"risks":[{"text":"a","confidence":0.9,"probability":"HIGH"}]}'
    ).risks[0].probability == RiskProbability.HIGH
