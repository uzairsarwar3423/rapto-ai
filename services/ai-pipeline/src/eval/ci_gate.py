"""
eval/ci_gate.py
────────────────
CI/CD gate — blocks prompt/model changes that regress extraction quality.

ALGORITHM:
  1. Load results/latest.json   (the run that just completed)
  2. Load results/baseline.json (last known-good run, committed to git)
  3. For each extractor present in BOTH:
       FAIL if current_f1 < baseline_f1 - max_regression   (default 0.03 = 3 F1 points)
  4. FAIL if the anti-pattern gate failed or the run had fixture errors
  5. Optionally (--enforce-targets) FAIL if any absolute target failed
  6. On PASS (and --promote, the default): copy latest.json → baseline.json

  Missing baseline → bootstrap: the current run becomes the baseline (PASS).
  Fixture-set mismatch → compare only shared extractors and WARN, because an
  added fixture legitimately changes the micro-averaged F1.

USAGE (always AFTER run_all_evals):
  python -m src.eval.run_all_evals --no-deepeval --no-enforce-targets && python -m src.eval.ci_gate

EXIT CODES: 0 = pass (safe to merge/deploy), 1 = regression / gate failure, 2 = usage error.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path
from typing import Any, Optional

from src.eval.eval_io import RESULTS_DIR

DEFAULT_MAX_REGRESSION = 0.03


def compare(
    current: dict[str, Any],
    baseline: Optional[dict[str, Any]],
    max_regression: float = DEFAULT_MAX_REGRESSION,
    enforce_targets: bool = False,
) -> tuple[bool, list[str], list[str]]:
    """Pure comparison. Returns (passed, failures, warnings)."""
    failures: list[str] = []
    warnings: list[str] = []
    current_extractors: dict[str, Any] = current.get("extractors") or {}

    if not current_extractors:
        failures.append("current run has no extractor metrics (did run_all_evals fail?)")
    if current.get("errors"):
        failures.append(f"fixture errors in current run: {current['errors']}")
    if not current.get("anti_pattern_pass", True):
        failures.append("anti-pattern fixture extracted commitments (zero tolerance)")
    if enforce_targets:
        for name, doc in current_extractors.items():
            if not doc.get("pass", False):
                failed = [k for k, ok in (doc.get("checks") or {}).items() if not ok]
                failures.append(f"{name}: absolute target(s) not met: {', '.join(failed)}")

    if baseline is None:
        warnings.append("no baseline.json — this run will become the baseline")
        return not failures, failures, warnings

    if sorted(current.get("fixtures_evaluated", [])) != sorted(baseline.get("fixtures_evaluated", [])):
        warnings.append(
            "fixture set differs from baseline "
            f"(baseline={baseline.get('fixtures_evaluated')}, current={current.get('fixtures_evaluated')}); "
            "F1 deltas may reflect dataset changes"
        )

    baseline_extractors: dict[str, Any] = baseline.get("extractors") or {}
    for name, base_doc in baseline_extractors.items():
        doc = current_extractors.get(name)
        if doc is None:
            warnings.append(f"{name}: in baseline but not evaluated in current run")
            continue
        base_f1, cur_f1 = float(base_doc["f1"]), float(doc["f1"])
        delta = cur_f1 - base_f1
        line = f"{name}: F1 {base_f1:.3f} → {cur_f1:.3f} ({delta:+.3f})"
        if cur_f1 < base_f1 - max_regression:
            failures.append(f"REGRESSION {line} exceeds allowed -{max_regression:.3f}")
        elif delta < 0:
            warnings.append(line)  # within tolerance, but worth seeing
    return not failures, failures, warnings


def _load(path: Path) -> Optional[dict[str, Any]]:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Eval regression gate")
    parser.add_argument("--latest", type=Path, default=RESULTS_DIR / "latest.json")
    parser.add_argument("--baseline", type=Path, default=RESULTS_DIR / "baseline.json")
    parser.add_argument("--max-regression", type=float, default=DEFAULT_MAX_REGRESSION,
                        help="Allowed absolute F1 drop per extractor (default 0.03)")
    parser.add_argument("--enforce-targets", action="store_true",
                        help="Also fail when absolute accuracy targets are not met")
    parser.add_argument("--no-promote", dest="promote", action="store_false",
                        help="Do not overwrite baseline.json on pass")
    args = parser.parse_args(argv)

    current = _load(args.latest)
    if current is None:
        print(f"ERROR: {args.latest} not found — run `python -m src.eval.run_all_evals` first")
        return 2
    baseline = _load(args.baseline)

    passed, failures, warnings = compare(current, baseline, args.max_regression, args.enforce_targets)

    print(f"CI gate — prompt {current.get('prompt_version')} vs baseline "
          f"{(baseline or {}).get('prompt_version', '<none>')}")
    for warning in warnings:
        print(f"  [WARN] {warning}")
    for failure in failures:
        print(f"  [FAIL] {failure}")

    if not passed:
        print("CI GATE: FAIL — fix the prompt/model change before merging.")
        return 1
    if args.promote:
        args.baseline.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(args.latest, args.baseline)
        print(f"  baseline promoted → {args.baseline}")
    print("CI GATE: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
