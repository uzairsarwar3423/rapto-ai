"""
eval/metrics.py
────────────────
Pure functions — no I/O, no side effects. Inputs/outputs are plain Python
values so every function is trivially unit-testable.

  precision(tp, fp), recall(tp, fn), f1(p, r)
  calibration_error(confidences, outcomes)      — expected calibration error
  match_items(expected, extracted, matcher)     — one-to-one greedy matching
  compute_extraction_metrics(expected, extracted, matcher)
  aggregate_metrics([...])                       — micro-average across fixtures

CONVENTIONS:
  - Empty denominators: precision with nothing extracted = 1.0 (no false
    claims); recall with nothing expected = 1.0 (nothing missed). F1 follows.
  - Matching is ONE-TO-ONE: an extracted item can satisfy at most one
    expected item, so duplicates are counted as false positives instead of
    inflating true positives (the v1 harness counted them as TPs).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Callable, Sequence


def precision(tp: int, fp: int) -> float:
    return tp / (tp + fp) if (tp + fp) > 0 else 1.0


def recall(tp: int, fn: int) -> float:
    return tp / (tp + fn) if (tp + fn) > 0 else 1.0


def f1(p: float, r: float) -> float:
    return 2 * p * r / (p + r) if (p + r) > 0 else 0.0


def calibration_error(
    confidences: Sequence[float],
    outcomes: Sequence[bool],
    n_bins: int = 10,
) -> float:
    """Expected Calibration Error (ECE).

    Items scored 0.9 should be correct ~90% of the time. ECE is the
    count-weighted mean |accuracy - mean confidence| over equal-width bins.
    0.0 = perfectly calibrated; lower is better. Empty input → 0.0.
    """
    if len(confidences) != len(outcomes):
        raise ValueError("confidences and outcomes must have the same length")
    total = len(confidences)
    if total == 0:
        return 0.0
    bins: list[list[tuple[float, bool]]] = [[] for _ in range(n_bins)]
    for conf, outcome in zip(confidences, outcomes):
        c = min(max(float(conf), 0.0), 1.0)
        index = min(int(c * n_bins), n_bins - 1)
        bins[index].append((c, bool(outcome)))
    ece = 0.0
    for bucket in bins:
        if not bucket:
            continue
        mean_conf = sum(c for c, _ in bucket) / len(bucket)
        accuracy = sum(1 for _, ok in bucket if ok) / len(bucket)
        ece += (len(bucket) / total) * abs(accuracy - mean_conf)
    return ece


@dataclass
class MatchResult:
    matched_pairs: list[tuple[int, int]]        # (expected_index, extracted_index)
    unmatched_expected: list[int]
    unmatched_extracted: list[int]


def match_items(
    expected: Sequence[Any],
    extracted: Sequence[dict[str, Any]],
    matcher: Callable[[Any, dict[str, Any]], bool],
) -> MatchResult:
    """Greedy one-to-one matching in expected order.

    For each expected item, take the highest-confidence unused extracted item
    that satisfies the matcher.
    """
    order = sorted(
        range(len(extracted)),
        key=lambda i: -float(extracted[i].get("confidence") or 0.0),
    )
    used: set[int] = set()
    pairs: list[tuple[int, int]] = []
    missed: list[int] = []
    for e_index, exp in enumerate(expected):
        hit = next((i for i in order if i not in used and matcher(exp, extracted[i])), None)
        if hit is None:
            missed.append(e_index)
        else:
            used.add(hit)
            pairs.append((e_index, hit))
    return MatchResult(
        matched_pairs=pairs,
        unmatched_expected=missed,
        unmatched_extracted=[i for i in range(len(extracted)) if i not in used],
    )


@dataclass
class ExtractionMetrics:
    precision: float
    recall: float
    f1: float
    tp: int
    fp: int
    fn: int
    calibration_error: float
    items_extracted: int
    items_expected: int
    missed: list[str] = field(default_factory=list)        # expected items not found
    spurious: list[str] = field(default_factory=list)      # extracted items not expected

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        for key in ("precision", "recall", "f1", "calibration_error"):
            data[key] = round(data[key], 4)
        return data


def compute_extraction_metrics(
    expected: Sequence[Any],
    extracted: Sequence[dict[str, Any]],
    matcher: Callable[[Any, dict[str, Any]], bool],
    describe_expected: Callable[[Any], str] = str,
) -> ExtractionMetrics:
    result = match_items(expected, extracted, matcher)
    tp = len(result.matched_pairs)
    fp = len(result.unmatched_extracted)
    fn = len(result.unmatched_expected)
    p, r = precision(tp, fp), recall(tp, fn)

    matched_extracted = {x for _, x in result.matched_pairs}
    confidences = [float(item.get("confidence") or 0.0) for item in extracted]
    outcomes = [i in matched_extracted for i in range(len(extracted))]

    return ExtractionMetrics(
        precision=p,
        recall=r,
        f1=f1(p, r),
        tp=tp,
        fp=fp,
        fn=fn,
        calibration_error=calibration_error(confidences, outcomes),
        items_extracted=len(extracted),
        items_expected=len(expected),
        missed=[describe_expected(expected[i]) for i in result.unmatched_expected],
        spurious=[str(extracted[i].get("text", ""))[:120] for i in result.unmatched_extracted],
    )


def aggregate_metrics(per_fixture: Sequence[ExtractionMetrics]) -> ExtractionMetrics:
    """Micro-average: sum TP/FP/FN across fixtures, then compute P/R/F1.

    Calibration error is item-weighted across fixtures.
    """
    tp = sum(m.tp for m in per_fixture)
    fp = sum(m.fp for m in per_fixture)
    fn = sum(m.fn for m in per_fixture)
    items = sum(m.items_extracted for m in per_fixture)
    ece = (
        sum(m.calibration_error * m.items_extracted for m in per_fixture) / items
        if items
        else 0.0
    )
    p, r = precision(tp, fp), recall(tp, fn)
    return ExtractionMetrics(
        precision=p,
        recall=r,
        f1=f1(p, r),
        tp=tp,
        fp=fp,
        fn=fn,
        calibration_error=ece,
        items_extracted=items,
        items_expected=sum(m.items_expected for m in per_fixture),
    )
