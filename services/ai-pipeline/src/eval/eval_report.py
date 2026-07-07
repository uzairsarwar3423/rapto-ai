"""
eval/eval_report.py
────────────────────────────────────────────────────────────────────────────────
Vocaply AI Pipeline — Phase 4 Aggregate Evaluation Report Generator
Day 55 | Principal AI/RAG Engineer Edition

PURPOSE:
  Reads all JSON files from eval/results/ and produces a Markdown-formatted
  comparison table showing Phase 4's accuracy baseline across all eval runs.

  This report is the permanent, shareable artifact that documents Phase 4's
  measured accuracy baseline and enables comparison between:
    - Day 55: initial baseline
    - Day 60: formal sign-off (after any prompt tuning)
    - Any subsequent run after prompt/model changes

USAGE:
  python -m eval.eval_report
  # Produces Phase4_Report_{timestamp}.md in eval/results/
  # Also prints the table to stdout
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

RESULTS_DIR: Path = Path(__file__).parent / "results"


def _load_all_results() -> List[Dict[str, Any]]:
    """Load all JSON result files from eval/results/, sorted by timestamp."""
    result_files = sorted(RESULTS_DIR.glob("*.json"))
    results = []
    for path in result_files:
        if path.name == ".gitkeep":
            continue
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
                data["_source_file"] = path.name
                results.append(data)
        except Exception as exc:
            print(f"[WARN] Could not load {path.name}: {exc}")
    return results


def _label_run(result: Dict[str, Any]) -> str:
    """Generate a human-readable label for a result run."""
    ts = result.get("timestamp", "Unknown")
    source = result.get("_source_file", "")
    if "extraction" in source:
        return f"Extraction ({ts[:10]})"
    elif "resolution" in source:
        return f"Resolution ({ts[:10]})"
    return f"Run ({ts[:10]})"


def _format_pct(value: Optional[float]) -> str:
    if value is None:
        return "N/A"
    return f"{value * 100:.1f}%"


def _pass_icon(passed: Optional[bool]) -> str:
    if passed is None:
        return "—"
    return "✓" if passed else "✗"


def _render_extraction_table(extraction_results: List[Dict[str, Any]]) -> str:
    """Render the extraction accuracy comparison table."""
    if not extraction_results:
        return "_No extraction eval results found._\n"

    lines = []
    lines.append("### Extraction Accuracy")
    lines.append("")
    lines.append("| Run Date | Precision | Recall | F1 | Anti-Pattern | Pass |")
    lines.append("|----------|-----------|--------|-----|--------------|------|")

    for result in extraction_results:
        ts = result.get("timestamp", "unknown")[:10]
        agg = result.get("aggregate", {}) or {}
        ap = result.get("anti_pattern_result") or {}

        precision = _format_pct(agg.get("precision"))
        recall = _format_pct(agg.get("recall"))
        f1 = _format_pct(agg.get("f1"))
        overall = result.get("overall_pass")

        ap_count = ap.get("extracted_count", "?")
        ap_pass_val = ap.get("anti_pattern_pass")
        ap_label = f"PASS ({ap_count})" if ap_pass_val else f"FAIL ({ap_count})"

        lines.append(
            f"| {ts} | {precision} | {recall} | {f1} | {ap_label} | {_pass_icon(overall)} |"
        )

    lines.append("")
    return "\n".join(lines)


def _render_resolution_table(resolution_results: List[Dict[str, Any]]) -> str:
    """Render the resolution accuracy comparison table."""
    if not resolution_results:
        return "_No resolution eval results found._\n"

    lines = []
    lines.append("### Resolution Accuracy")
    lines.append("")
    lines.append("| Run Date | Match Acc | Detection Acc | FPR | Pass |")
    lines.append("|----------|-----------|---------------|-----|------|")

    for result in resolution_results:
        ts = result.get("timestamp", "unknown")[:10]
        match_agg = result.get("aggregate_matching") or {}
        detect_agg = result.get("aggregate_detection") or {}
        overall = result.get("overall_pass")

        match_acc = _format_pct(match_agg.get("match_accuracy"))
        detect_acc = _format_pct(detect_agg.get("detection_accuracy"))
        fpr = _format_pct(detect_agg.get("false_positive_rate"))

        lines.append(
            f"| {ts} | {match_acc} | {detect_acc} | {fpr} | {_pass_icon(overall)} |"
        )

    lines.append("")
    return "\n".join(lines)


def _render_per_fixture_extraction(extraction_results: List[Dict[str, Any]]) -> str:
    """Render per-fixture breakdown for the most recent extraction eval."""
    if not extraction_results:
        return ""

    latest = extraction_results[-1]
    per_fixture = latest.get("per_fixture", []) or []
    if not per_fixture:
        return ""

    lines = []
    lines.append("### Per-Fixture Extraction Detail (Most Recent Run)")
    lines.append("")
    lines.append("| Fixture | Precision | Recall | F1 | TP | FP | FN | Latency |")
    lines.append("|---------|-----------|--------|-----|----|----|-----|---------|")

    for f in per_fixture:
        if f.get("is_anti_pattern"):
            lines.append(
                f"| {f['fixture_id']} (anti-pattern) | — | — | — | — | — | — "
                f"| {f.get('latency_ms', '?')}ms |"
            )
            continue
        lines.append(
            f"| {f.get('fixture_id', '?')} "
            f"| {_format_pct(f.get('precision'))} "
            f"| {_format_pct(f.get('recall'))} "
            f"| {_format_pct(f.get('f1'))} "
            f"| {f.get('tp', '?')} "
            f"| {f.get('fp', '?')} "
            f"| {f.get('fn', '?')} "
            f"| {f.get('latency_ms', '?')}ms |"
        )

    lines.append("")
    return "\n".join(lines)


def _render_targets_section() -> str:
    """Render the Phase 4 accuracy target reference."""
    return """### Phase 4 Accuracy Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Extraction Precision | ≥ 91% | False positives erode user trust |
| Extraction Recall | ≥ 87% | Missing commitments create accountability gaps |
| Extraction F1 | ≥ 89% | Harmonic mean of precision + recall |
| Anti-Pattern | 0 extracted | Zero tolerance — vague statements must never appear as commitments |
| Match Accuracy | ≥ 85% | Resolver correctly linking new → historical |
| Detection Accuracy | ≥ 90% | GPT-4.1 Mini RESOLVED/NOT_RESOLVED classification |
| False Positive Rate | ≤ 5% | Wrongly RESOLVED is catastrophic (accountability corrupted) |

> **Asymmetry-of-harm principle**: A false positive (wrongly marking a commitment as FULFILLED)
> is far more harmful than a false negative (an extra reminder). The confidence threshold
> and conservative bias are calibrated to protect against false positives above all else.

"""


def generate_report() -> str:
    """Generate the full Phase 4 evaluation report."""
    all_results = _load_all_results()

    extraction_results = [r for r in all_results if "extraction" in r.get("_source_file", "")]
    resolution_results = [r for r in all_results if "resolution" in r.get("_source_file", "")]

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    lines = [
        "# Vocaply AI Pipeline — Phase 4 Evaluation Report",
        "",
        f"**Generated:** {timestamp}",
        f"**Eval runs found:** {len(all_results)} "
        f"({len(extraction_results)} extraction + {len(resolution_results)} resolution)",
        "",
        "---",
        "",
        _render_targets_section(),
        "---",
        "",
        "## Results",
        "",
        _render_extraction_table(extraction_results),
        _render_resolution_table(resolution_results),
        "---",
        "",
        _render_per_fixture_extraction(extraction_results),
    ]

    report_text = "\n".join(lines)
    return report_text


def main() -> None:
    """Generate and save the Phase 4 evaluation report."""
    print("Generating Phase 4 Evaluation Report...")

    if not RESULTS_DIR.exists():
        print(f"ERROR: Results directory not found: {RESULTS_DIR}")
        print("Run run_extraction_eval.py and run_resolution_eval.py first.")
        sys.exit(1)

    report = generate_report()
    print("\n" + report)

    # Write to file
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")
    out_path = RESULTS_DIR / f"Phase4_Report_{timestamp}.md"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(report)

    print(f"\nReport written to: {out_path}")


if __name__ == "__main__":
    main()
