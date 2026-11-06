"""
eval/run_all_evals.py
──────────────────────
Master eval runner — all extractors × all golden fixtures, PASS/FAIL per target.

ACCURACY TARGETS (micro-averaged across fixtures):
  Commitments:   Precision ≥ 91%   Recall ≥ 87%   F1 ≥ 89%
  Action Items:  Precision ≥ 88%   Recall ≥ 84%   F1 ≥ 86%
  Decisions:     Precision ≥ 90%   Recall ≥ 85%   F1 ≥ 87%
  Blockers:      Precision ≥ 88%   Recall ≥ 83%   F1 ≥ 85%
  Risks:         Precision ≥ 85%   Recall ≥ 80%   F1 ≥ 82%
  Summary CR:    ≥ 82% (ragas context recall, --with-ragas)
  Anti-pattern fixtures (expected_zero_commitments): 0 commitments — zero tolerance.

USAGE (from services/ai-pipeline):
  # Against a running service (black box)
  python -m src.eval.run_all_evals --service-url http://localhost:8001

  # In-process (no running service; needs the service's env vars)
  python -m src.eval.run_all_evals --in-process

  # Subset
  python -m src.eval.run_all_evals --extractor commitments --fixture standup_02

  # LLM-as-judge scoring (slower, costs money; needs requirements-eval.txt)
  python -m src.eval.run_all_evals --with-deepeval --with-ragas

  # Fast CI mode (default): deterministic matchers only
  python -m src.eval.run_all_evals --no-deepeval

OUTPUT:
  stdout                               per-extractor table + verdict
  src/eval/results/all_evals_<ts>.json permanent record (incl. raw responses)
  src/eval/results/latest.json         overwritten each run; read by ci_gate.py

EXIT CODE: 0 when every evaluated target passes (or --no-enforce-targets), else 1.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any, Optional

from src.eval.eval_io import (
    RESULTS_DIR,
    ExtractionRun,
    Fixture,
    load_fixtures,
    run_all_in_process,
    run_http,
)
from src.eval.matchers import EXTRACTOR_MATCHERS, summary_checks
from src.eval.metrics import ExtractionMetrics, aggregate_metrics, compute_extraction_metrics

RESULTS_SCHEMA_VERSION = 2

TARGETS: dict[str, dict[str, float]] = {
    "commitments": {"precision": 0.91, "recall": 0.87, "f1": 0.89},
    "action_items": {"precision": 0.88, "recall": 0.84, "f1": 0.86},
    "decisions": {"precision": 0.90, "recall": 0.85, "f1": 0.87},
    "blockers": {"precision": 0.88, "recall": 0.83, "f1": 0.85},
    "risks": {"precision": 0.85, "recall": 0.80, "f1": 0.82},
}
SUMMARY_CONTEXT_RECALL_TARGET = 0.82
ALL_EXTRACTORS = tuple(TARGETS)


# ─── Scoring (pure) ───────────────────────────────────────────────────────────


def score_fixture(fixture: Fixture, result: dict[str, Any], extractors: tuple[str, ...]) -> dict[str, Any]:
    """Score one extraction result against its fixture. Pure — no I/O."""
    case = fixture.case
    labelled = set(case.labelled_extractors) if case.labelled_extractors is not None else None
    per_extractor: dict[str, ExtractionMetrics] = {}

    for name in extractors:
        if labelled is not None and name not in labelled:
            continue
        case_field, response_field, matcher, describe = EXTRACTOR_MATCHERS[name]
        per_extractor[name] = compute_extraction_metrics(
            getattr(case, case_field),
            result.get(response_field) or [],
            matcher,
            describe,
        )

    scored: dict[str, Any] = {
        "fixture_id": fixture.fixture_id,
        "meeting_type": case.meeting_type,
        "extractors": per_extractor,
    }
    if case.expected_zero_commitments:
        count = len(result.get("commitments") or [])
        scored["anti_pattern"] = {"commitments_extracted": count, "pass": count == 0}
    if case.expected_summary is not None:
        checks = summary_checks(case.expected_summary, result.get("summary"))
        scored["summary_checks"] = checks
        scored["summary_keyword_score"] = (
            round(sum(checks.values()) / len(checks), 4) if checks else None
        )
    return scored


def evaluate_targets(aggregate: dict[str, ExtractionMetrics]) -> dict[str, dict[str, Any]]:
    verdicts: dict[str, dict[str, Any]] = {}
    for name, metrics in aggregate.items():
        target = TARGETS[name]
        checks = {k: getattr(metrics, k) >= v for k, v in target.items()}
        verdicts[name] = {"targets": target, "checks": checks, "pass": all(checks.values())}
    return verdicts


def build_report(
    fixtures: list[Fixture],
    runs: dict[str, ExtractionRun],
    extractors: tuple[str, ...],
    *,
    mode: str,
    service_url: Optional[str],
) -> dict[str, Any]:
    """Assemble the full results document. Pure apart from reading the clock/git."""
    per_fixture: list[dict[str, Any]] = []
    by_extractor: dict[str, list[ExtractionMetrics]] = {n: [] for n in extractors}
    prompt_version = "unknown"
    prompt_versions: dict[str, str] = {}
    errors: list[str] = []
    fallback_chunks = 0

    for fixture in fixtures:
        run = runs[fixture.fixture_id]
        entry: dict[str, Any] = {
            "fixture_id": fixture.fixture_id,
            "meeting_type": fixture.case.meeting_type,
            "latency_ms": round(run.latency_ms, 1),
            "partial": run.partial,
            "http_status": run.http_status,
        }
        if run.result is None:
            entry["error"] = run.error or "no result"
            errors.append(f"{fixture.fixture_id}: {entry['error']}")
            per_fixture.append(entry)
            continue

        prompt_version = run.result.get("prompt_version", prompt_version)
        prompt_versions = run.result.get("prompt_versions") or prompt_versions
        fallback_chunks += int(run.result.get("fallback_chunks") or 0)
        scored = score_fixture(fixture, run.result, extractors)
        for name, metrics in scored["extractors"].items():
            by_extractor[name].append(metrics)
        entry.update(
            extractors={n: m.to_dict() for n, m in scored["extractors"].items()},
            **{k: v for k, v in scored.items() if k not in {"fixture_id", "meeting_type", "extractors"}},
            providers_used=run.result.get("providers_used", []),
            fallback_chunks=run.result.get("fallback_chunks", 0),
        )
        per_fixture.append(entry)

    aggregate = {n: aggregate_metrics(ms) for n, ms in by_extractor.items() if ms}
    verdicts = evaluate_targets(aggregate)
    anti_patterns = [f["anti_pattern"] for f in per_fixture if "anti_pattern" in f]
    keyword_scores = [f["summary_keyword_score"] for f in per_fixture
                      if f.get("summary_keyword_score") is not None]

    extractors_doc = {
        name: {**aggregate[name].to_dict(), **verdicts[name]} for name in aggregate
    }
    overall = (
        bool(extractors_doc)
        and all(v["pass"] for v in verdicts.values())
        and all(a["pass"] for a in anti_patterns)
        and not errors
    )
    return {
        "schema_version": RESULTS_SCHEMA_VERSION,
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "git_sha": _git_sha(),
        "mode": mode,
        "service_url": service_url,
        "prompt_version": prompt_version,
        "prompt_versions": prompt_versions,
        "fixtures_evaluated": [f.fixture_id for f in fixtures],
        "extractors": extractors_doc,
        "summary": {
            "keyword_score_mean": (
                round(sum(keyword_scores) / len(keyword_scores), 4) if keyword_scores else None
            ),
        },
        "anti_pattern_pass": all(a["pass"] for a in anti_patterns),
        "fallback_chunks": fallback_chunks,
        "errors": errors,
        "per_fixture": per_fixture,
        "responses": {fid: run.result for fid, run in runs.items() if run.result is not None},
        "overall_pass": overall,
    }


def _git_sha() -> Optional[str]:
    try:
        return subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, timeout=5,
        ).stdout.strip() or None
    except Exception:  # noqa: BLE001
        return None


# ─── Output ───────────────────────────────────────────────────────────────────


class _C:
    on = sys.stdout.isatty() and os.getenv("NO_COLOR") is None

    @classmethod
    def wrap(cls, text: str, code: str) -> str:
        return f"\033[{code}m{text}\033[0m" if cls.on else text

    @classmethod
    def ok(cls, passed: bool) -> str:
        return cls.wrap("PASS", "32") if passed else cls.wrap("FAIL", "31")


def print_report(report: dict[str, Any]) -> None:
    print("=" * 86)
    print(f"AI Pipeline Eval — prompt {report['prompt_version']} — mode {report['mode']}")
    print("=" * 86)
    header = f"{'Extractor':<14}{'Precision':>12}{'Recall':>12}{'F1':>12}{'ECE':>8}{'TP/FP/FN':>13}  Verdict"
    print(header)
    print("-" * len(header))
    for name, doc in report["extractors"].items():
        t, c = doc["targets"], doc["checks"]

        def cell(metric: str) -> str:
            text = f"{doc[metric]:.1%}"
            return _C.wrap(f"{text:>12}", "32" if c[metric] else "31")

        counts = f"{doc['tp']}/{doc['fp']}/{doc['fn']}"
        print(
            f"{name:<14}{cell('precision')}{cell('recall')}{cell('f1')}"
            f"{doc['calibration_error']:>8.3f}{counts:>13}"
            f"  {_C.ok(doc['pass'])}  (≥{t['precision']:.0%}/{t['recall']:.0%}/{t['f1']:.0%})"
        )
    for fixture in report["per_fixture"]:
        if "error" in fixture:
            print(_C.wrap(f"  [ERROR] {fixture['fixture_id']}: {fixture['error']}", "31"))
        if "anti_pattern" in fixture:
            ap = fixture["anti_pattern"]
            print(f"  Anti-pattern {fixture['fixture_id']}: {ap['commitments_extracted']} commitments "
                  f"{_C.ok(ap['pass'])}")
        for name, metrics in (fixture.get("extractors") or {}).items():
            for missed in metrics.get("missed", []):
                print(f"  [FN] {fixture['fixture_id']}/{name}: {missed}")
            for spurious in metrics.get("spurious", []):
                print(f"  [FP] {fixture['fixture_id']}/{name}: {spurious}")
    if report["summary"]["keyword_score_mean"] is not None:
        print(f"  Summary keyword checks: {report['summary']['keyword_score_mean']:.1%}")
    for key in ("deepeval", "ragas"):
        if key in report:
            print(f"  {key}: {json.dumps(report[key].get('aggregate', report[key]))[:300]}")
    print(f"  Fallback chunks: {report['fallback_chunks']}")
    print("-" * len(header))
    print(f"OVERALL: {_C.ok(report['overall_pass'])}")


def write_report(report: dict[str, Any]) -> str:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    stamp = report["timestamp"].replace(":", "-")
    path = RESULTS_DIR / f"all_evals_{stamp}.json"
    path.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    shutil.copyfile(path, RESULTS_DIR / "latest.json")
    return str(path)


# ─── Execution ────────────────────────────────────────────────────────────────


def execute(fixtures: list[Fixture], args: argparse.Namespace) -> dict[str, ExtractionRun]:
    if args.in_process:
        return run_all_in_process(fixtures, args.concurrency)

    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        runs = list(pool.map(lambda f: run_http(f, args.service_url, args.api_key), fixtures))
    return {r.fixture_id: r for r in runs}


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--service-url", default=os.getenv("AI_PIPELINE_URL", "http://localhost:8001"))
    parser.add_argument("--api-key", default=os.getenv("API_SHARED_SECRET", "dev-secret"))
    parser.add_argument("--in-process", action="store_true", help="Call the pipeline in-process instead of over HTTP")
    parser.add_argument("--extractor", action="append", choices=ALL_EXTRACTORS,
                        help="Limit to an extractor (repeatable). Default: all")
    parser.add_argument("--fixture", action="append", help="Limit to a fixture id (repeatable)")
    parser.add_argument("--concurrency", type=int, default=2)
    judge = parser.add_mutually_exclusive_group()
    judge.add_argument("--with-deepeval", dest="deepeval", action="store_true")
    judge.add_argument("--no-deepeval", dest="deepeval", action="store_false")
    parser.add_argument("--with-ragas", action="store_true", help="Score summaries with ragas")
    parser.add_argument("--no-enforce-targets", action="store_true",
                        help="Exit 0 even if targets fail (still recorded in latest.json)")
    parser.set_defaults(deepeval=False)
    return parser.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> int:
    args = parse_args(argv)
    extractors = tuple(args.extractor or ALL_EXTRACTORS)
    fixtures = load_fixtures(only=args.fixture)
    if not fixtures:
        print("ERROR: no fixtures found (need <id>_cleaned.json + <id>_expected.json pairs)")
        return 2

    print(f"Running {len(fixtures)} fixture(s): {', '.join(f.fixture_id for f in fixtures)}")
    runs = execute(fixtures, args)
    report = build_report(
        fixtures, runs, extractors,
        mode="in-process" if args.in_process else "http",
        service_url=None if args.in_process else args.service_url,
    )

    if args.deepeval:
        from src.eval.deepeval_harness import evaluate_runs as deepeval_runs

        report["deepeval"] = deepeval_runs(fixtures, runs, extractors)
        report["overall_pass"] = report["overall_pass"] and report["deepeval"].get("pass", True)
    if args.with_ragas:
        from src.eval.ragas_harness import evaluate_runs as ragas_runs

        report["ragas"] = ragas_runs(fixtures, runs)
        cr = report["ragas"].get("aggregate", {}).get("context_recall")
        if cr is not None:
            report["summary"]["context_recall"] = cr
            report["summary"]["context_recall_pass"] = cr >= SUMMARY_CONTEXT_RECALL_TARGET
            report["overall_pass"] = report["overall_pass"] and cr >= SUMMARY_CONTEXT_RECALL_TARGET

    print_report(report)
    print(f"\nResults written to: {write_report(report)}")
    if report["overall_pass"] or args.no_enforce_targets:
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
