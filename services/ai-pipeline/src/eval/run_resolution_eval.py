"""
eval/run_resolution_eval.py
────────────────────────────────────────────────────────────────────────────────
Vocaply AI Pipeline — Phase 4 Resolution Evaluation Harness
Day 55 | Principal AI/RAG Engineer Edition

PURPOSE:
  Measures two distinct accuracy dimensions of the resolution pipeline:
    1. MATCHING ACCURACY: Does the resolver correctly identify which new
       commitment corresponds to which historical commitment?
    2. DETECTION ACCURACY: When matched, does the detector correctly
       determine RESOLVED vs. NOT_RESOLVED?

  Uses resolver_fixture_*.json (matching-only) and resolution_fixture_*.json
  (full pipeline) from the golden dataset.

PHASE 4 RESOLUTION TARGETS:
  Match Accuracy:     ≥ 85%
  Detection Accuracy: ≥ 90% (weighted toward TNR per asymmetry-of-harm)
  False Positive Rate (wrongly RESOLVED): ≤ 5% (strictest gate)

USAGE:
  AI_PIPELINE_URL=http://localhost:8000 API_SHARED_SECRET=dev-secret \\
    python -m eval.run_resolution_eval
"""

from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    import httpx
except ImportError:
    print("ERROR: httpx is required. Install with: pip install httpx")
    sys.exit(1)

sys.path.insert(0, str(Path(__file__).parent.parent))

# ─── Configuration ─────────────────────────────────────────────────────────────

SERVICE_BASE_URL: str = os.getenv("AI_PIPELINE_URL", "http://localhost:8000")
API_KEY: str = os.getenv("API_SHARED_SECRET", "dev-secret")
GOLDEN_DATASET_DIR: Path = Path(__file__).parent / "golden_dataset"
RESULTS_DIR: Path = Path(__file__).parent / "results"

RESOLUTION_TARGETS: Dict[str, float] = {
    "match_accuracy_min": 0.85,
    "detection_accuracy_min": 0.90,
    "false_positive_rate_max": 0.05,
}

REQUEST_TIMEOUT_SECONDS: float = 60.0
MAX_RETRIES: int = 2


# ─── HTTP Client ───────────────────────────────────────────────────────────────

def make_client() -> httpx.Client:
    return httpx.Client(
        base_url=SERVICE_BASE_URL,
        headers={
            "X-Internal-Service-Key": API_KEY,
            "Content-Type": "application/json",
        },
        timeout=REQUEST_TIMEOUT_SECONDS,
    )


def _load_fixture(path: Path) -> Dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# ─── /resolve API Call ─────────────────────────────────────────────────────────

def _call_resolve(
    client: httpx.Client,
    meeting_id: str,
    team_id: str,
    meeting_date: str,
    team_timezone: str,
    new_commitments: List[Dict[str, Any]],
    historical_commitments: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """Call POST /api/v1/resolve. Returns parsed JSON or None on failure."""
    payload = {
        "meeting_id": meeting_id,
        "team_id": team_id,
        "meeting_date": meeting_date,
        "team_timezone": team_timezone,
        "new_commitments": new_commitments,
        "historical_commitments": historical_commitments,
    }

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = client.post("/api/v1/resolve", content=json.dumps(payload))
            if response.status_code in (200, 206):
                return response.json()
            elif response.status_code == 422:
                print(f"  [WARN] /resolve 422: {response.text[:300]}")
                return None
            else:
                print(f"  [WARN] /resolve {response.status_code} on attempt {attempt}")
        except Exception as exc:
            print(f"  [ERROR] /resolve failed on attempt {attempt}: {exc}")
            if attempt < MAX_RETRIES:
                time.sleep(2.0 * attempt)

    return None


# ─── Find Fixtures ─────────────────────────────────────────────────────────────

def _find_resolution_fixtures() -> Tuple[List[Path], List[Path]]:
    """Return (resolver_fixtures, resolution_fixtures) sorted paths."""
    resolver_fixtures = sorted(GOLDEN_DATASET_DIR.glob("resolver_fixture_*.json"))
    resolution_fixtures = sorted(GOLDEN_DATASET_DIR.glob("resolution_fixture_*.json"))
    return resolver_fixtures, resolution_fixtures


# ─── Matching Accuracy Evaluation ─────────────────────────────────────────────

def _evaluate_matching_accuracy(
    fixture: Dict[str, Any],
    client: httpx.Client,
) -> Dict[str, Any]:
    """Evaluate resolver MATCHING accuracy for one resolver fixture.

    Checks whether expected_match pairs appear in resolved_updates OR
    not_resolved_references (either means the resolver MATCHED them).
    Checks whether expected_no_match items appear in new_commitments
    (the resolver correctly identified them as new, not matched).
    """
    fixture_id = fixture.get("fixture_id", "unknown")
    meeting_id = fixture.get("meeting_id", f"resolver_eval_{fixture_id}")
    team_id = fixture.get("team_id", "eval-team-match")
    meeting_date = fixture.get("meeting_date", "2026-06-15T09:00:00Z")
    team_timezone = fixture.get("team_timezone", "UTC")

    new_commitments = fixture.get("new_commitments", [])
    historical_commitments = fixture.get("historical_commitments", [])
    expected_matches = fixture.get("expected_matches", [])
    expected_no_matches = fixture.get("expected_no_matches", [])

    print(f"\n  [{fixture_id}] Calling /resolve for matching eval...", end="", flush=True)
    t0 = time.monotonic()
    response_body = _call_resolve(
        client, meeting_id, team_id, meeting_date, team_timezone,
        new_commitments, historical_commitments,
    )
    latency_ms = (time.monotonic() - t0) * 1000.0

    if response_body is None:
        print(f" FAILED")
        return {"fixture_id": fixture_id, "error": "HTTP call failed"}

    result = response_body.get("result") or {}
    resolved_updates = result.get("resolved_updates", []) or []
    not_resolved_refs = result.get("not_resolved_references", []) or []
    new_comms = result.get("new_commitments", []) or []
    stats = result.get("stats", {}) or {}

    # Build sets of matched historical IDs (in either resolved or not_resolved_refs)
    matched_hist_ids = set()
    for ru in resolved_updates:
        matched_hist_ids.add(ru.get("historical_commitment_id"))
    for nrr in not_resolved_refs:
        matched_hist_ids.add(nrr.get("historical_commitment_id"))

    # Build set of new commitment IDs (correctly identified as new)
    new_commitment_ids = {nc.get("id") or nc.get("dedup_key") for nc in new_comms}

    # Check expected matches
    correct_matches = 0
    missed_matches = 0
    for expected_match in expected_matches:
        hist_id = expected_match.get("historical_commitment_id")
        if hist_id in matched_hist_ids:
            correct_matches += 1
        else:
            missed_matches += 1
            print(f"\n    [MISS] Expected match for hist_id={hist_id} not found")

    # Check expected no-matches (should appear as new_commitments)
    correct_no_matches = 0
    false_matches = 0
    for expected_no_match in expected_no_matches:
        nc_id = expected_no_match.get("new_commitment_id")
        if nc_id in new_commitment_ids:
            correct_no_matches += 1
        else:
            false_matches += 1
            print(f"\n    [FALSE_MATCH] Expected no-match for new_id={nc_id} was wrongly matched")

    total_decisions = correct_matches + missed_matches + correct_no_matches + false_matches
    match_accuracy = (
        (correct_matches + correct_no_matches) / total_decisions
        if total_decisions > 0
        else 1.0
    )

    print(
        f" done ({round(latency_ms)}ms) | "
        f"match_acc={match_accuracy:.1%} | "
        f"correct={correct_matches + correct_no_matches}/{total_decisions}"
    )

    return {
        "fixture_id": fixture_id,
        "correct_matches": correct_matches,
        "missed_matches": missed_matches,
        "correct_no_matches": correct_no_matches,
        "false_matches": false_matches,
        "total_decisions": total_decisions,
        "match_accuracy": round(match_accuracy, 4),
        "latency_ms": round(latency_ms, 2),
        "stage1_blocks": stats.get("stage1_blocks", 0),
        "detection_calls_made": stats.get("detection_calls_made", 0),
    }


# ─── Detection Accuracy Evaluation ────────────────────────────────────────────

def _evaluate_detection_accuracy(
    fixture: Dict[str, Any],
    client: httpx.Client,
) -> Dict[str, Any]:
    """Evaluate DETECTION accuracy for full pipeline resolution_fixture.

    Checks labeled_detection_pairs against the pipeline's resolved_updates
    and not_resolved_references to compute:
      - True detection rate (expected_resolved=True → in resolved_updates)
      - True rejection rate (expected_resolved=False → NOT in resolved_updates)
      - False positive rate (expected_resolved=False → wrongly in resolved_updates)
    """
    fixture_id = fixture.get("fixture_id", "unknown")
    meeting_id = fixture.get("meeting_id", f"detect_eval_{fixture_id}")
    team_id = fixture.get("team_id", "eval-team-detect")
    meeting_date = fixture.get("meeting_date", "2026-06-15T09:00:00Z")
    team_timezone = fixture.get("team_timezone", "UTC")

    new_commitments = fixture.get("new_commitments", [])
    historical_commitments = fixture.get("historical_commitments", [])
    labeled_pairs = fixture.get("labeled_detection_pairs", [])

    if not labeled_pairs:
        print(f"\n  [{fixture_id}] No labeled_detection_pairs — skipping detection eval")
        return {"fixture_id": fixture_id, "skipped": True}

    print(f"\n  [{fixture_id}] Calling /resolve for detection eval...", end="", flush=True)
    t0 = time.monotonic()
    response_body = _call_resolve(
        client, meeting_id, team_id, meeting_date, team_timezone,
        new_commitments, historical_commitments,
    )
    latency_ms = (time.monotonic() - t0) * 1000.0

    if response_body is None:
        print(f" FAILED")
        return {"fixture_id": fixture_id, "error": "HTTP call failed"}

    result = response_body.get("result") or {}
    resolved_updates = result.get("resolved_updates", []) or []
    stats = result.get("stats", {}) or {}

    # Build set of (new_commitment_id, historical_commitment_id) that were RESOLVED
    # We match by looking for the historical_commitment_id in resolved_updates
    # and checking if the resolved_by_new_commitment has the matching new_commitment_id
    resolved_hist_ids: Dict[str, Optional[str]] = {}  # hist_id → new_commitment_id (or None)
    for ru in resolved_updates:
        hist_id = ru.get("historical_commitment_id")
        new_comm = ru.get("resolved_by_new_commitment") or {}
        new_id: Optional[str] = new_comm.get("id") or new_comm.get("dedup_key") or None
        if hist_id:
            resolved_hist_ids[hist_id] = new_id

    true_detections = 0
    missed_detections = 0
    correct_rejections = 0
    false_detections = 0

    for pair in labeled_pairs:
        new_id = pair.get("new_commitment_id")
        hist_id = pair.get("historical_commitment_id")
        expected_resolved = pair.get("expected_resolved", False)
        reasoning = pair.get("reasoning", "")

        was_resolved = (
            hist_id in resolved_hist_ids
        )

        if expected_resolved:
            if was_resolved:
                true_detections += 1
            else:
                missed_detections += 1
                print(f"\n    [MISS_DETECT] ({new_id}→{hist_id}): expected RESOLVED, got NOT_RESOLVED. {reasoning[:80]}")
        else:
            if not was_resolved:
                correct_rejections += 1
            else:
                false_detections += 1
                print(f"\n    [FALSE_POSITIVE] ({new_id}→{hist_id}): expected NOT_RESOLVED, got RESOLVED! {reasoning[:80]}")

    total_pairs = true_detections + missed_detections + correct_rejections + false_detections
    detection_accuracy = (
        (true_detections + correct_rejections) / total_pairs if total_pairs > 0 else 1.0
    )
    labeled_positive_count = true_detections + missed_detections + false_detections
    false_positive_rate = (
        false_detections / labeled_positive_count if labeled_positive_count > 0 else 0.0
    )

    acc_pass = detection_accuracy >= RESOLUTION_TARGETS["detection_accuracy_min"]
    fpr_pass = false_positive_rate <= RESOLUTION_TARGETS["false_positive_rate_max"]

    print(
        f" done ({round(latency_ms)}ms) | "
        f"det_acc={detection_accuracy:.1%} ({'✓' if acc_pass else '✗'}) | "
        f"FPR={false_positive_rate:.1%} ({'✓' if fpr_pass else '✗'}) | "
        f"TP={true_detections} FP={false_detections} FN={missed_detections} TN={correct_rejections}"
    )

    return {
        "fixture_id": fixture_id,
        "true_detections": true_detections,
        "missed_detections": missed_detections,
        "correct_rejections": correct_rejections,
        "false_detections": false_detections,
        "total_pairs": total_pairs,
        "detection_accuracy": round(detection_accuracy, 4),
        "false_positive_rate": round(false_positive_rate, 4),
        "detection_accuracy_pass": acc_pass,
        "false_positive_rate_pass": fpr_pass,
        "stage1_blocks": stats.get("stage1_blocks", 0),
        "detection_calls_made": stats.get("detection_calls_made", 0),
        "below_threshold_conservatives": stats.get("below_threshold_conservatives", 0),
        "latency_ms": round(latency_ms, 2),
        "response_partial": response_body.get("partial", False),
    }


# ─── Service Health Check ──────────────────────────────────────────────────────

def _get_service_version(client: httpx.Client) -> str:
    try:
        response = client.get("/health")
        if response.status_code == 200:
            return response.json().get("version", "unknown")
    except Exception:
        pass
    return "unknown"


# ─── Main Eval Runner ─────────────────────────────────────────────────────────

def run_resolution_eval() -> bool:
    """Run the full resolution evaluation harness.

    Returns:
        True if all targets are met.
        False if any target fails.
    """
    print("=" * 70)
    print("Vocaply AI Pipeline — Phase 4 Resolution Evaluation")
    print(f"Service URL: {SERVICE_BASE_URL}")
    print(f"Golden dataset: {GOLDEN_DATASET_DIR}")
    print("=" * 70)

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    resolver_fixture_paths, resolution_fixture_paths = _find_resolution_fixtures()
    all_paths = resolver_fixture_paths + resolution_fixture_paths

    if not all_paths:
        print(f"\nERROR: No resolution fixtures found in {GOLDEN_DATASET_DIR}")
        return False

    print(f"Found {len(resolver_fixture_paths)} resolver fixtures + "
          f"{len(resolution_fixture_paths)} resolution fixtures")

    matching_results = []
    detection_results = []

    with make_client() as client:
        service_version = _get_service_version(client)
        print(f"Service version: {service_version}")

        # ── Matching accuracy from resolver fixtures ───────────────────────────
        if resolver_fixture_paths:
            print("\n=== MATCHING ACCURACY (resolver fixtures) ===")
            for path in resolver_fixture_paths:
                fixture = _load_fixture(path)
                result = _evaluate_matching_accuracy(fixture, client)
                if not result.get("error") and not result.get("skipped"):
                    matching_results.append(result)

        # ── Detection accuracy from resolution fixtures (full pipeline) ────────
        if resolution_fixture_paths:
            print("\n=== DETECTION ACCURACY (full pipeline fixtures) ===")
            for path in resolution_fixture_paths:
                fixture = _load_fixture(path)
                result = _evaluate_detection_accuracy(fixture, client)
                if not result.get("error") and not result.get("skipped"):
                    detection_results.append(result)

    # ── Aggregate metrics ──────────────────────────────────────────────────────
    # Matching accuracy aggregate
    if matching_results:
        total_correct = sum(r.get("correct_matches", 0) + r.get("correct_no_matches", 0)
                           for r in matching_results)
        total_decisions = sum(r.get("total_decisions", 0) for r in matching_results)
        agg_match_acc = total_correct / total_decisions if total_decisions > 0 else 1.0
    else:
        agg_match_acc = None

    # Detection accuracy aggregate
    if detection_results:
        total_true_det = sum(r.get("true_detections", 0) for r in detection_results)
        total_miss_det = sum(r.get("missed_detections", 0) for r in detection_results)
        total_correct_rej = sum(r.get("correct_rejections", 0) for r in detection_results)
        total_false_det = sum(r.get("false_detections", 0) for r in detection_results)
        total_det_pairs = total_true_det + total_miss_det + total_correct_rej + total_false_det
        agg_detect_acc = (
            (total_true_det + total_correct_rej) / total_det_pairs
            if total_det_pairs > 0
            else 1.0
        )
        labeled_pos = total_true_det + total_miss_det + total_false_det
        agg_fpr = total_false_det / labeled_pos if labeled_pos > 0 else 0.0
    else:
        agg_detect_acc = None
        agg_fpr = None

    # ── Print aggregate results ────────────────────────────────────────────────
    print(f"\n{'='*70}")
    print("AGGREGATE RESOLUTION RESULTS:")

    match_pass = False
    detect_pass = False
    fpr_pass_agg = False

    if agg_match_acc is not None:
        match_pass = agg_match_acc >= RESOLUTION_TARGETS["match_accuracy_min"]
        print(f"  Match Accuracy:    {agg_match_acc:.1%} "
              f"(target: ≥{RESOLUTION_TARGETS['match_accuracy_min']:.0%}) "
              f"{'✓ PASS' if match_pass else '✗ FAIL'}")

    if agg_detect_acc is not None:
        assert agg_fpr is not None  # set in the same branch as agg_detect_acc
        detect_pass = agg_detect_acc >= RESOLUTION_TARGETS["detection_accuracy_min"]
        fpr_pass_agg = agg_fpr <= RESOLUTION_TARGETS["false_positive_rate_max"]
        print(f"  Detection Accuracy:{agg_detect_acc:.1%} "
              f"(target: ≥{RESOLUTION_TARGETS['detection_accuracy_min']:.0%}) "
              f"{'✓ PASS' if detect_pass else '✗ FAIL'}")
        print(f"  False Positive Rate:{agg_fpr:.1%} "
              f"(target: ≤{RESOLUTION_TARGETS['false_positive_rate_max']:.0%}) "
              f"{'✓ PASS' if fpr_pass_agg else '✗ FAIL'}")

    overall_pass = match_pass and detect_pass and fpr_pass_agg
    if not matching_results:
        overall_pass = detect_pass and fpr_pass_agg
    if not detection_results:
        overall_pass = match_pass

    print(f"\n  OVERALL: {'✓ ALL TARGETS MET — PHASE 4 RESOLUTION GATE PASSED' if overall_pass else '✗ TARGETS NOT MET'}")
    print(f"{'='*70}")

    # ── Write results file ─────────────────────────────────────────────────────
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    results_payload = {
        "timestamp": timestamp,
        "service_url": SERVICE_BASE_URL,
        "service_version": service_version if "service_version" in dir() else "unknown",
        "per_fixture_matching": matching_results,
        "per_fixture_detection": detection_results,
        "aggregate_matching": {
            "match_accuracy": round(agg_match_acc, 4) if agg_match_acc is not None else None,
            "target": RESOLUTION_TARGETS["match_accuracy_min"],
            "pass": match_pass,
        } if matching_results else None,
        "aggregate_detection": {
            "detection_accuracy": round(agg_detect_acc, 4) if agg_detect_acc is not None else None,
            "false_positive_rate": round(agg_fpr, 4) if agg_fpr is not None else None,
            "target_detection": RESOLUTION_TARGETS["detection_accuracy_min"],
            "target_fpr": RESOLUTION_TARGETS["false_positive_rate_max"],
            "detection_pass": detect_pass,
            "fpr_pass": fpr_pass_agg,
        } if detection_results else None,
        "overall_pass": overall_pass,
    }

    out_path = RESULTS_DIR / f"resolution_eval_{timestamp.replace(':', '-')}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results_payload, f, indent=2, default=str)

    print(f"\nResults written to: {out_path}")
    return overall_pass


if __name__ == "__main__":
    success = run_resolution_eval()
    sys.exit(0 if success else 1)
