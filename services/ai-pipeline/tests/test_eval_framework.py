"""Eval framework: metrics, matchers, fixtures, scoring, CI gate, builders (no network)."""

from __future__ import annotations

import json

import pytest

from src.eval import ci_gate
from src.eval.eval_io import (
    ExtractionRun,
    Fixture,
    build_extract_payload,
    load_fixtures,
)
from src.eval.eval_schema import (
    EvalCase,
    EvalExpectedBlocker,
    EvalExpectedCommitment,
    EvalExpectedDecision,
    EvalExpectedRisk,
    EvalExpectedSummary,
)
from src.eval.fixtures_builder import draft_expectations, pseudonymise, turns_from_document
from src.eval.matchers import (
    match_blocker,
    match_commitment,
    match_decision,
    match_risk,
    summary_checks,
)
from src.eval.metrics import (
    aggregate_metrics,
    calibration_error,
    compute_extraction_metrics,
    f1,
    precision,
    recall,
)
from src.eval.run_all_evals import build_report, score_fixture
from src.models.extraction_models import ExtractRequest

# ── metrics ──────────────────────────────────────────────────────────────────


def test_basic_metrics_and_empty_conventions():
    assert precision(3, 1) == 0.75 and recall(3, 1) == 0.75
    assert f1(0.75, 0.75) == pytest.approx(0.75)
    assert precision(0, 0) == 1.0 and recall(0, 0) == 1.0 and f1(0.0, 0.0) == 0.0


def test_calibration_error():
    assert calibration_error([], []) == 0.0
    assert calibration_error([1.0, 1.0], [True, True]) == pytest.approx(0.0)
    assert calibration_error([0.9, 0.9], [False, False]) == pytest.approx(0.9)
    with pytest.raises(ValueError):
        calibration_error([0.5], [])


def test_matching_is_one_to_one():
    expected = [EvalExpectedCommitment(owner_name_contains="Alice", text_contains="login")]
    extracted = [
        {"text": "finish login", "owner_name": "Alice", "confidence": 0.9},
        {"text": "finish the login page", "owner_name": "Alice", "confidence": 0.8},
    ]
    m = compute_extraction_metrics(expected, extracted, match_commitment)
    assert (m.tp, m.fp, m.fn) == (1, 1, 0)  # duplicate counts as FP, not a second TP
    assert m.precision == 0.5 and m.recall == 1.0


def test_aggregate_is_micro_average():
    a = compute_extraction_metrics([EvalExpectedDecision(text_contains="x")], [{"text": "x", "confidence": 1}], match_decision)
    b = compute_extraction_metrics([EvalExpectedDecision(text_contains="y")], [], match_decision)
    agg = aggregate_metrics([a, b])
    assert (agg.tp, agg.fp, agg.fn) == (1, 0, 1) and agg.recall == 0.5


# ── matchers ─────────────────────────────────────────────────────────────────


def test_matchers_normalise_text_and_check_optional_fields():
    assert match_commitment(
        EvalExpectedCommitment(owner_name_contains="sara", text_contains="Sara's PR", confidence_min=0.5),
        {"text": "review  Sara’s PR", "owner_name": "Sara Khan", "confidence": 0.6},
    )
    assert not match_commitment(
        EvalExpectedCommitment(owner_name_contains="Sara", confidence_min=0.8),
        {"text": "x", "owner_name": "Sara", "confidence": 0.6},
    )
    assert match_decision(EvalExpectedDecision(text_contains="pair", reversible=True), {"text": "Try pair programming"})
    assert not match_decision(EvalExpectedDecision(text_contains="pair", reversible=True),
                              {"text": "pair", "reversible": False})
    assert match_blocker(EvalExpectedBlocker(text_contains="staging", escalation_expected=True),
                         {"text": "No staging access", "escalation_flag": True})
    assert not match_blocker(EvalExpectedBlocker(text_contains="staging", escalation_expected=True),
                             {"text": "No staging access"})
    assert match_risk(EvalExpectedRisk(text_contains="slip", category="TIMELINE", probability="HIGH"),
                      {"text": "Deadline slip", "category": "TIMELINE", "probability": "HIGH"})


def test_summary_checks_search_topics_and_overview():
    checks = summary_checks(
        EvalExpectedSummary(key_phrase_in_overview="release", required_topics=["Paddle"], min_key_takeaways=1),
        {"overview": "We planned the release.", "topics_discussed": [{"topic": "Billing", "bullets": ["Chose Paddle"]}],
         "key_takeaways": []},
    )
    assert checks == {"key_phrase_in_overview": True, "topic:Paddle": True, "min_key_takeaways": False}
    assert summary_checks(EvalExpectedSummary(required_topics=["login"]), "Login was discussed")["topic:login"]


# ── golden dataset ───────────────────────────────────────────────────────────


def test_all_golden_fixtures_load_and_build_valid_requests():
    fixtures = load_fixtures()
    ids = {f.fixture_id for f in fixtures}
    assert {"standup_01", "standup_02", "planning_01", "retrospective_01",
            "sprint_review_01", "ambiguous_cases"} <= ids
    for fixture in fixtures:
        request = ExtractRequest.model_validate(build_extract_payload(fixture))  # what /extract accepts
        assert request.cleaned_transcript and request.participants
        speakers = {t.speaker_name for t in request.cleaned_transcript}
        assert speakers <= {p.name for p in request.participants}


def test_fixture_counts_match_plan():
    by_id = {f.fixture_id: f.case for f in load_fixtures()}
    p = by_id["planning_01"]
    assert (len(p.expected_commitments), len(p.expected_action_items), len(p.expected_decisions),
            len(p.expected_blockers), len(p.expected_risks)) == (5, 8, 3, 1, 2)
    r = by_id["retrospective_01"]
    assert (len(r.expected_commitments), len(r.expected_action_items), len(r.expected_decisions),
            len(r.expected_blockers), len(r.expected_risks)) == (2, 5, 4, 0, 1)
    assert by_id["ambiguous_cases"].expected_zero_commitments


def test_content_parser_handles_continuations_and_unknown_speakers():
    fixture = Fixture("x", {"participants": ["Alice"], "content": "Alice: hello\nstill talking\nAll: Agreed."},
                      EvalCase(meeting_id="x", meeting_type="standup"))
    payload = build_extract_payload(fixture)
    assert [t["cleaned_text"] for t in payload["cleaned_transcript"]] == ["hello still talking", "Agreed."]
    assert {p["name"] for p in payload["participants"]} == {"Alice", "All"}
    assert payload["meeting_type"] == "standup"


def test_drafts_are_skipped(tmp_path):
    (tmp_path / "d_cleaned.json").write_text(json.dumps({"content": "A: hi"}))
    (tmp_path / "d_expected.json").write_text(json.dumps({"meeting_id": "d", "draft": True}))
    assert load_fixtures(tmp_path) == []
    assert len(load_fixtures(tmp_path, include_drafts=True)) == 1


# ── scoring / report ─────────────────────────────────────────────────────────


def _fixture(case: dict) -> Fixture:
    return Fixture("f1", {"content": "A: hi"}, EvalCase.model_validate({"meeting_id": "f1", **case}))


def test_score_fixture_respects_labelled_extractors_and_anti_patterns():
    fixture = _fixture({"expected_zero_commitments": True, "labelled_extractors": ["commitments"]})
    scored = score_fixture(fixture, {"commitments": [], "risks": [{"text": "noise"}]},
                           ("commitments", "risks"))
    assert set(scored["extractors"]) == {"commitments"}  # risks unlabelled → not scored
    assert scored["anti_pattern"] == {"commitments_extracted": 0, "pass": True}


def test_build_report_targets_and_errors():
    good = _fixture({"expected_decisions": [{"text_contains": "ship"}], "labelled_extractors": ["decisions"]})
    runs = {"f1": ExtractionRun("f1", {"decisions": [{"text": "Ship Friday", "confidence": 0.9}],
                                       "prompt_version": "v"}, 200, 1.0)}
    report = build_report([good], runs, ("decisions",), mode="http", service_url="u")
    assert report["extractors"]["decisions"]["f1"] == 1.0 and report["overall_pass"]
    failed = build_report([good], {"f1": ExtractionRun("f1", None, 500, 1.0, "HTTP 500")},
                          ("decisions",), mode="http", service_url="u")
    assert not failed["overall_pass"] and failed["errors"]


# ── CI gate ──────────────────────────────────────────────────────────────────


def _run(f1_value: float, **extra) -> dict:
    return {"extractors": {"decisions": {"f1": f1_value, "pass": True, "checks": {}}},
            "fixtures_evaluated": ["a"], "anti_pattern_pass": True, "errors": [], **extra}


def test_ci_gate_regression_tolerance():
    assert ci_gate.compare(_run(0.88), _run(0.90))[0]          # -2 points: ok
    passed, failures, _ = ci_gate.compare(_run(0.85), _run(0.90))
    assert not passed and "REGRESSION" in failures[0]           # -5 points: blocked


def test_ci_gate_bootstrap_and_hard_failures():
    passed, _, warnings = ci_gate.compare(_run(0.5), None)
    assert passed and "baseline" in warnings[0]
    assert not ci_gate.compare(_run(0.9, anti_pattern_pass=False), _run(0.9))[0]
    assert not ci_gate.compare(_run(0.9, errors=["x"]), _run(0.9))[0]
    failing_target = {"extractors": {"decisions": {"f1": 0.9, "pass": False, "checks": {"recall": False}}},
                      "anti_pattern_pass": True, "errors": []}
    assert ci_gate.compare(failing_target, None)[0]
    assert not ci_gate.compare(failing_target, None, enforce_targets=True)[0]


def test_ci_gate_cli_promotes_baseline(tmp_path):
    latest, baseline = tmp_path / "latest.json", tmp_path / "baseline.json"
    latest.write_text(json.dumps(_run(0.9)))
    assert ci_gate.main(["--latest", str(latest), "--baseline", str(baseline)]) == 0
    assert json.loads(baseline.read_text())["extractors"]["decisions"]["f1"] == 0.9
    latest.write_text(json.dumps(_run(0.5)))
    assert ci_gate.main(["--latest", str(latest), "--baseline", str(baseline)]) == 1
    assert json.loads(baseline.read_text())["extractors"]["decisions"]["f1"] == 0.9  # not promoted


# ── fixtures builder ─────────────────────────────────────────────────────────


def test_pseudonymise_scrubs_names_in_speakers_and_text():
    turns = turns_from_document({"normalized_transcript": [
        {"speaker_tag": "Sara Khan", "text": "Ahmed, review my PR"},
        {"speaker_tag": "Ahmed Hassan", "text": "Sure Sara, and Sara Khan owns QA"},
    ]})
    scrubbed, mapping = pseudonymise(turns)
    blob = json.dumps(scrubbed)
    assert "Sara" not in blob and "Ahmed" not in blob
    assert scrubbed[0]["speaker_name"] == "Participant A"
    assert scrubbed[1]["cleaned_text"] == "Sure Participant A, and Participant A owns QA"
    assert len(mapping) == 2


def test_draft_expectations_from_result():
    draft = draft_expectations({"commitments": [{"owner_name": "A", "text": "one two three four five six"}]})
    assert draft["expected_commitments"] == [{"owner_name_contains": "A", "text_contains": "one two three four five"}]
    assert draft_expectations(None)["expected_commitment_count"] == 0


# ── LLM-judge sample builders (pure parts) ───────────────────────────────────


def test_deepeval_and_ragas_sample_builders():
    from src.eval.deepeval_harness import build_test_cases
    from src.eval.ragas_harness import build_samples, summary_to_text

    fixture = _fixture({"expected_decisions": [{"text_contains": "ship"}]})
    cases = build_test_cases(fixture, {"decisions": [{"text": "Ship", "made_by": "A", "confidence": 0.9}],
                                       "risks": []}, ("decisions", "risks"))
    assert [name for name, _ in cases] == ["decisions"]  # empty extractors skipped
    assert cases[0][1]["retrieval_context"] == ["A: hi"]

    assert "Decision: ship" in summary_to_text({"overview": "o", "decisions": ["ship"]})
    samples = build_samples([fixture], {"f1": ExtractionRun("f1", {"summary": {"overview": "Shipped."}}, 200, 1)})
    assert samples[0]["synthesized_reference"] is True
    assert "Decided: ship." in samples[0]["sample"]["reference"]
