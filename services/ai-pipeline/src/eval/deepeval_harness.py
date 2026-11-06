"""
eval/deepeval_harness.py
─────────────────────────
LLM-as-judge grounding scores for the 5 structured extractors (deepeval).

METRICS (per fixture × extractor, then averaged per extractor):
  FaithfulnessMetric     — are extracted items grounded in the transcript?   pass ≥ 0.85
  HallucinationMetric    — fraction of fabricated content (lower is better)   pass ≤ 0.10
  AnswerRelevancyMetric  — is the output on-task for that extractor?          pass ≥ 0.80

HOW IT WORKS:
  One deepeval LLMTestCase per (fixture, extractor) with at least one item:
    input             = the extractor's task, in one sentence
    actual_output     = the extracted items as JSON (text + people + key fields)
    expected_output   = the golden expectations for that extractor
    retrieval_context = context = [transcript]
  One test case per extractor (not per item) keeps judge cost at roughly
  5 × fixtures × 3 metrics calls per run.

COST / DEPENDENCIES:
  Needs `pip install -r requirements-eval.txt` and an OPENAI_API_KEY for the
  judge model (default gpt-4.1, override with --judge-model or
  DEEPEVAL_JUDGE_MODEL). Roughly $0.10 per full run on the bundled fixtures.
  Not part of the fast CI gate — run before releases.

USAGE:
  python -m src.eval.deepeval_harness --all
  python -m src.eval.deepeval_harness --fixture standup_01 --extractor commitments
  python -m src.eval.deepeval_harness --all --from-results src/eval/results/latest.json
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any, Optional

from src.eval.eval_io import ExtractionRun, Fixture, load_fixtures, run_all_in_process, run_http

THRESHOLDS = {"faithfulness": 0.85, "hallucination": 0.10, "answer_relevancy": 0.80}
DEFAULT_JUDGE_MODEL = os.getenv("DEEPEVAL_JUDGE_MODEL", "gpt-4.1")

TASKS = {
    "commitments": "List every first-person commitment (owner, deliverable, due phrase) made in this meeting.",
    "action_items": "List every task assigned to a named person in this meeting.",
    "decisions": "List every concluded decision made in this meeting.",
    "blockers": "List every active blocker preventing specific work right now.",
    "risks": "List every potential future risk raised in this meeting.",
}
_KEY_FIELDS = {
    "commitments": ("text", "owner_name", "due_date_raw"),
    "action_items": ("text", "assignee_name", "assigner_name", "priority"),
    "decisions": ("text", "made_by", "decision_type", "dissent"),
    "blockers": ("text", "blocked_work", "affected_name", "blocking_party", "severity"),
    "risks": ("text", "category", "raised_by", "trigger_condition", "mitigation_mentioned"),
}
_EXPECTED_FIELD = {
    "commitments": "expected_commitments",
    "action_items": "expected_action_items",
    "decisions": "expected_decisions",
    "blockers": "expected_blockers",
    "risks": "expected_risks",
}


def _require_deepeval() -> Any:
    try:
        import deepeval  # noqa: F401
        from deepeval import metrics
        from deepeval.test_case import LLMTestCase
    except ImportError as exc:  # pragma: no cover — environment guard
        raise SystemExit(
            "deepeval is not installed. Run: pip install -r requirements-eval.txt"
        ) from exc
    # Never ship eval data to the hosted Confident AI dashboard implicitly.
    os.environ.setdefault("DEEPEVAL_TELEMETRY_OPT_OUT", "YES")
    return metrics, LLMTestCase


def build_test_cases(
    fixture: Fixture,
    result: dict[str, Any],
    extractors: tuple[str, ...],
) -> list[tuple[str, dict[str, Any]]]:
    """(extractor, LLMTestCase kwargs) pairs — pure, no deepeval import needed."""
    transcript = fixture.transcript_text
    cases: list[tuple[str, dict[str, Any]]] = []
    for name in extractors:
        items = result.get(name) or []
        if not items:
            continue  # nothing extracted → nothing to ground
        compact = [{k: item.get(k) for k in _KEY_FIELDS[name] if item.get(k) is not None} for item in items]
        expected = [e.model_dump(exclude_none=True) for e in getattr(fixture.case, _EXPECTED_FIELD[name])]
        cases.append((name, {
            "input": TASKS[name],
            "actual_output": json.dumps(compact, ensure_ascii=False),
            "expected_output": json.dumps(expected, ensure_ascii=False),
            "retrieval_context": [transcript],
            "context": [transcript],
        }))
    return cases


async def _score_case(metric_classes: Any, test_case: Any, judge_model: str) -> dict[str, Any]:
    metrics = {
        "faithfulness": metric_classes.FaithfulnessMetric(
            threshold=THRESHOLDS["faithfulness"], model=judge_model, include_reason=True),
        "hallucination": metric_classes.HallucinationMetric(
            threshold=THRESHOLDS["hallucination"], model=judge_model, include_reason=True),
        "answer_relevancy": metric_classes.AnswerRelevancyMetric(
            threshold=THRESHOLDS["answer_relevancy"], model=judge_model, include_reason=True),
    }
    scores: dict[str, Any] = {}
    for key, metric in metrics.items():
        try:
            await metric.a_measure(test_case)
            scores[key] = {"score": round(float(metric.score), 4), "reason": (metric.reason or "")[:300]}
        except Exception as exc:  # noqa: BLE001 — one failed judge call must not kill the run
            scores[key] = {"score": None, "error": f"{type(exc).__name__}: {str(exc)[:200]}"}
    return scores


def _passes(metric: str, score: Optional[float]) -> Optional[bool]:
    if score is None:
        return None
    if metric == "hallucination":
        return score <= THRESHOLDS[metric]
    return score >= THRESHOLDS[metric]


def evaluate_runs(
    fixtures: list[Fixture],
    runs: dict[str, ExtractionRun],
    extractors: tuple[str, ...],
    judge_model: str = DEFAULT_JUDGE_MODEL,
) -> dict[str, Any]:
    metric_classes, LLMTestCase = _require_deepeval()

    async def _all() -> list[dict[str, Any]]:
        rows = []
        for fixture in fixtures:
            run = runs.get(fixture.fixture_id)
            if run is None or run.result is None:
                continue
            for name, kwargs in build_test_cases(fixture, run.result, extractors):
                scores = await _score_case(metric_classes, LLMTestCase(**kwargs), judge_model)
                rows.append({"fixture_id": fixture.fixture_id, "extractor": name, "scores": scores})
        return rows

    rows = asyncio.run(_all())
    aggregate: dict[str, dict[str, Any]] = {}
    for name in extractors:
        entry: dict[str, Any] = {}
        for metric in THRESHOLDS:
            values = [r["scores"][metric]["score"] for r in rows
                      if r["extractor"] == name and r["scores"][metric]["score"] is not None]
            mean = round(sum(values) / len(values), 4) if values else None
            entry[metric] = {"mean": mean, "pass": _passes(metric, mean), "n": len(values)}
        aggregate[name] = entry
    verdicts = [m["pass"] for e in aggregate.values() for m in e.values() if m["pass"] is not None]
    return {
        "judge_model": judge_model,
        "thresholds": THRESHOLDS,
        "aggregate": aggregate,
        "cases": rows,
        "pass": all(verdicts) if verdicts else True,
    }


def _runs_from_results(path: Path) -> dict[str, ExtractionRun]:
    doc = json.loads(path.read_text(encoding="utf-8"))
    return {fid: ExtractionRun(fid, result, 200, 0.0) for fid, result in (doc.get("responses") or {}).items()}


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    scope = parser.add_mutually_exclusive_group(required=True)
    scope.add_argument("--all", action="store_true")
    scope.add_argument("--fixture", action="append")
    parser.add_argument("--extractor", action="append", choices=tuple(TASKS))
    parser.add_argument("--judge-model", default=DEFAULT_JUDGE_MODEL)
    parser.add_argument("--from-results", type=Path, help="Re-score saved responses (no extraction calls)")
    parser.add_argument("--service-url", default=os.getenv("AI_PIPELINE_URL", "http://localhost:8001"))
    parser.add_argument("--api-key", default=os.getenv("API_SHARED_SECRET", "dev-secret"))
    parser.add_argument("--in-process", action="store_true")
    args = parser.parse_args(argv)

    fixtures = load_fixtures(only=None if args.all else args.fixture)
    extractors = tuple(args.extractor or TASKS)
    if args.from_results:
        runs = _runs_from_results(args.from_results)
    elif args.in_process:
        runs = run_all_in_process(fixtures)
    else:
        runs = {f.fixture_id: run_http(f, args.service_url, args.api_key) for f in fixtures}

    report = evaluate_runs(fixtures, runs, extractors, args.judge_model)
    print(json.dumps(report["aggregate"], indent=2))
    print("DEEPEVAL:", "PASS" if report["pass"] else "FAIL")
    return 0 if report["pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
