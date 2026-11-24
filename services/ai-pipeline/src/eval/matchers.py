"""
eval/matchers.py
─────────────────
Per-extractor match functions: what counts as a "correct" extraction.

All matchers take (expected criteria model, extracted item dict from the
/extract JSON response) and return True if the extracted item satisfies ALL
active criteria. Unset criteria are skipped, never failed.

Text criteria are case-insensitive substring checks after whitespace and
quote normalisation (so "Sara's PR" matches "Sara’s  PR").
"""

from __future__ import annotations

import re
from typing import Any, Callable, Optional

from src.eval.eval_schema import (
    EvalExpectedActionItem,
    EvalExpectedBlocker,
    EvalExpectedCommitment,
    EvalExpectedDecision,
    EvalExpectedRisk,
    EvalExpectedSummary,
)

_QUOTES = str.maketrans({"’": "'", "‘": "'", "“": '"', "”": '"'})


def _norm(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").translate(_QUOTES)).strip().lower()


def _contains(needle: Optional[str], haystack: Any) -> bool:
    if not needle:
        return True
    return _norm(needle) in _norm(haystack)


def _equals(expected: Any, actual: Any) -> bool:
    if expected is None:
        return True
    expected_value = getattr(expected, "value", expected)
    return _norm(expected_value) == _norm(actual)


def _confidence_at_least(minimum: Optional[float], item: dict[str, Any]) -> bool:
    if minimum is None:
        return True
    return float(item.get("confidence") or 0.0) >= minimum


def match_commitment(expected: EvalExpectedCommitment, extracted: dict[str, Any]) -> bool:
    return (
        _contains(expected.text_contains, extracted.get("text"))
        and _contains(expected.owner_name_contains, extracted.get("owner_name"))
        and _contains(expected.due_date_raw_contains, extracted.get("due_date_raw"))
        and _confidence_at_least(expected.confidence_min, extracted)
    )


def match_action_item(expected: EvalExpectedActionItem, extracted: dict[str, Any]) -> bool:
    return (
        _contains(expected.text_contains, extracted.get("text"))
        and _contains(expected.assignee_name_contains, extracted.get("assignee_name"))
        and (not expected.assignee_must_be_null or _norm(extracted.get("assignee_name")) in ("", "null", "none"))
        and _equals(expected.priority, extracted.get("priority"))
    )


def match_decision(expected: EvalExpectedDecision, extracted: dict[str, Any]) -> bool:
    return (
        _contains(expected.text_contains, extracted.get("text"))
        and _equals(expected.decision_type, extracted.get("decision_type"))
        and _confidence_at_least(expected.confidence_min, extracted)
        and (expected.reversible is None or bool(extracted.get("reversible", True)) == expected.reversible)
    )


def match_blocker(expected: EvalExpectedBlocker, extracted: dict[str, Any]) -> bool:
    return (
        _contains(expected.text_contains, extracted.get("text"))
        and _contains(expected.blocked_work_contains, extracted.get("blocked_work"))
        and _equals(expected.severity, extracted.get("severity"))
        and (
            expected.escalation_expected is None
            or bool(extracted.get("escalation_flag", False)) == expected.escalation_expected
        )
    )


def match_risk(expected: EvalExpectedRisk, extracted: dict[str, Any]) -> bool:
    return (
        _contains(expected.text_contains, extracted.get("text"))
        and _equals(expected.category, extracted.get("category"))
        and _contains(expected.trigger_condition_contains, extracted.get("trigger_condition"))
        and _equals(expected.probability, extracted.get("probability"))
    )


def summary_checks(expected: EvalExpectedSummary, summary: Any) -> dict[str, bool]:
    """Individual pass/fail per summary criterion (only active criteria)."""
    if isinstance(summary, str):
        summary = {"overview": summary}
    summary = summary or {}
    overview = summary.get("overview", "")
    topics_text = " ".join(
        f"{t.get('topic', '')} {' '.join(t.get('bullets', []))}"
        for t in summary.get("topics_discussed", []) or []
        if isinstance(t, dict)
    )
    searchable = f"{overview} {summary.get('meeting_purpose', '')} {topics_text}"

    checks: dict[str, bool] = {}
    if expected.key_phrase_in_overview:
        checks["key_phrase_in_overview"] = _contains(
            expected.key_phrase_in_overview, f"{overview} {summary.get('meeting_purpose', '')}"
        )
    for topic in expected.required_topics or []:
        checks[f"topic:{topic}"] = _contains(topic, searchable)
    if expected.min_key_takeaways is not None:
        checks["min_key_takeaways"] = len(summary.get("key_takeaways", []) or []) >= expected.min_key_takeaways
    return checks


def match_summary_section(expected: EvalExpectedSummary, extracted: Any) -> bool:
    return all(summary_checks(expected, extracted).values())


# extractor name → (EvalCase field, response field, matcher, describe expected)
MatcherSpec = tuple[str, str, Callable[[Any, dict[str, Any]], bool], Callable[[Any], str]]

EXTRACTOR_MATCHERS: dict[str, MatcherSpec] = {
    "commitments": (
        "expected_commitments", "commitments", match_commitment,
        lambda e: f"{e.owner_name_contains}: {e.text_contains or '*'}",
    ),
    "action_items": (
        "expected_action_items", "action_items", match_action_item,
        lambda e: f"{e.assignee_name_contains or '(unassigned)'}: {e.text_contains}",
    ),
    "decisions": ("expected_decisions", "decisions", match_decision, lambda e: e.text_contains),
    "blockers": ("expected_blockers", "blockers", match_blocker, lambda e: e.text_contains),
    "risks": ("expected_risks", "risks", match_risk, lambda e: e.text_contains),
}
