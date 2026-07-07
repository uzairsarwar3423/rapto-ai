"""
eval/run_extraction_eval.py
────────────────────────────────────────────────────────────────────────────────
Vocaply AI Pipeline — Phase 4 Extraction Evaluation Harness
Day 55 | Principal AI/RAG Engineer Edition

PURPOSE:
  This is a STANDALONE MEASUREMENT SCRIPT, not a pytest test file.
  It makes real HTTP calls against a running service instance and measures
  extraction accuracy against labeled golden data.

  WHY STANDALONE (Decision 5 from Day 55 plan):
    - Tests the service AS A BLACK BOX through its HTTP interface
    - Catches integration bugs that unit tests on individual modules miss
    - Validates the actual API contract, not a hypothetical internal one
    - Running in CI pytest would require live service + OpenAI quota + ~5min

  WHEN TO RUN:
    a. Today (Day 55): establish the Phase 4 baseline
    b. Day 60: formal phase sign-off (re-run, compare against Day 55 baseline)
    c. After any prompt change: verify no regression

PHASE 4 ACCURACY TARGETS:
  Precision ≥ 91%
  Recall    ≥ 87%
  F1        ≥ 89%
  Anti-pattern fixture: extracted_commitments == 0 (ZERO TOLERANCE)

USAGE:
  # Start the service first:
  uvicorn src.api.main:create_app --factory --port 8000

  # Run the eval:
  AI_PIPELINE_URL=http://localhost:8000 API_SHARED_SECRET=dev-secret \\
    python -m eval.run_extraction_eval

  # Or with a running production-staging service:
  AI_PIPELINE_URL=https://ai-pipeline.internal API_SHARED_SECRET=<secret> \\
    python -m eval.run_extraction_eval

OUTPUT:
  - Stdout: per-fixture results + aggregate metrics + PASS/FAIL verdict
  - File: eval/results/extraction_eval_{timestamp}.json (permanent record)
"""

from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

# ── Dependency check: httpx required for eval harness ─────────────────────────
try:
    import httpx
except ImportError:
    print("ERROR: httpx is required for the eval harness. Install with: pip install httpx")
    sys.exit(1)

# Add src to Python path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

# ─── Configuration ─────────────────────────────────────────────────────────────

SERVICE_BASE_URL: str = os.getenv("AI_PIPELINE_URL", "http://localhost:8000")
API_KEY: str = os.getenv("API_SHARED_SECRET", "dev-secret")
GOLDEN_DATASET_DIR: Path = Path(__file__).parent / "golden_dataset"
RESULTS_DIR: Path = Path(__file__).parent / "results"

EVAL_TARGETS: Dict[str, float] = {
    "precision_min": 0.91,
    "recall_min": 0.87,
    "f1_min": 0.89,
    "anti_pattern_max_commitments": 0,
}

REQUEST_TIMEOUT_SECONDS: float = 30.0
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


# ─── Fixture Loading ───────────────────────────────────────────────────────────

def _load_fixture(path: Path) -> Dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _find_fixtures() -> List[Dict[str, Any]]:
    """Find all *_cleaned.json fixtures with their corresponding *_expected.json files.

    Returns list of dicts with:
      - fixture_id: stem without '_cleaned'
      - cleaned: parsed JSON of cleaned transcript
      - expected: parsed JSON of expected output
      - is_anti_pattern: True if expected_zero_commitments
    """
    fixtures = []
    for cleaned_path in sorted(GOLDEN_DATASET_DIR.glob("*_cleaned.json")):
        fixture_id = cleaned_path.stem.replace("_cleaned", "")
        expected_path = GOLDEN_DATASET_DIR / f"{fixture_id}_expected.json"

        if not expected_path.exists():
            print(f"  [WARN] No expected file for {cleaned_path.name} — skipping")
            continue

        cleaned = _load_fixture(cleaned_path)
        expected = _load_fixture(expected_path)

        fixtures.append({
            "fixture_id": fixture_id,
            "cleaned": cleaned,
            "expected": expected,
            "is_anti_pattern": expected.get("expected_zero_commitments", False),
        })

    return fixtures


# ─── Extraction Call ───────────────────────────────────────────────────────────

def _call_extract(client: httpx.Client, cleaned: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Call POST /api/v1/extract with the cleaned transcript fixture.

    Returns the parsed JSON response body, or None on error.
    """
    payload = {
        "meeting_id": cleaned.get("meeting_id", "eval-fixture"),
        "team_id": "eval-team-01",
        "meeting_date": "2026-06-15T09:00:00Z",
        "team_timezone": "UTC",
        "participants": cleaned.get("participants", []),
        "cleaned_transcript": [
            {
                "speaker": cleaned.get("meeting_id", "unknown"),
                "text": cleaned.get("content", ""),
                "turn_index": 0,
            }
        ],
    }

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = client.post("/api/v1/extract", content=json.dumps(payload))
            if response.status_code in (200, 206):
                return response.json()
            else:
                print(f"  [WARN] /extract returned {response.status_code} on attempt {attempt}: {response.text[:200]}")
        except Exception as exc:
            print(f"  [ERROR] /extract call failed on attempt {attempt}: {exc}")
            if attempt < MAX_RETRIES:
                time.sleep(1.0 * attempt)

    return None


# ─── Matching Logic ────────────────────────────────────────────────────────────

def _match_commitment(
    expected_commitment: Dict[str, Any],
    extracted_commitments: List[Dict[str, Any]],
) -> bool:
    """Check if any extracted commitment matches the expected one.

    Matching criterion (text-overlap based, as specified in Day 55 §5.5):
      - expected.text_contains appears as case-insensitive substring of extracted.text
      - expected.owner_name_contains appears as case-insensitive substring of extracted.owner_name
      - if expected.confidence_min is set: extracted.confidence >= confidence_min

    Returns True if ANY extracted commitment satisfies all active criteria.
    """
    text_check = expected_commitment.get("text_contains", "").lower()
    owner_check = expected_commitment.get("owner_name_contains", "").lower()
    confidence_min = expected_commitment.get("confidence_min")

    for extracted in extracted_commitments:
        extracted_text = (extracted.get("text") or "").lower()
        extracted_owner = (extracted.get("owner_name") or "").lower()
        extracted_confidence = extracted.get("confidence", 0.0)

        text_match = text_check in extracted_text if text_check else True
        owner_match = owner_check in extracted_owner if owner_check else True
        confidence_match = (
            extracted_confidence >= confidence_min if confidence_min is not None else True
        )

        if text_match and owner_match and confidence_match:
            return True

    return False


# ─── Fixture Evaluation ───────────────────────────────────────────────────────

def _evaluate_fixture(
    fixture: Dict[str, Any],
    client: httpx.Client,
) -> Dict[str, Any]:
    """Evaluate one fixture against /extract. Returns per-fixture metrics dict."""
    fixture_id = fixture["fixture_id"]
    cleaned = fixture["cleaned"]
    expected = fixture["expected"]
    is_anti_pattern = fixture["is_anti_pattern"]

    print(f"\n  [{fixture_id}] Calling /extract...", end="", flush=True)
    t0 = time.monotonic()
    response_body = _call_extract(client, cleaned)
    latency_ms = (time.monotonic() - t0) * 1000.0

    if response_body is None:
        print(f" FAILED (HTTP error)")
        return {
            "fixture_id": fixture_id,
            "error": "HTTP call failed",
            "latency_ms": round(latency_ms, 2),
        }

    # Extract commitments from the response
    result = response_body.get("result") or {}
    if isinstance(result, dict):
        extracted_commitments = result.get("commitments", []) or []
        prompt_version = result.get("prompt_version", "unknown")
    else:
        extracted_commitments = []
        prompt_version = "unknown"

    print(f" done ({len(extracted_commitments)} commitments, {round(latency_ms)}ms)")

    # ── Anti-pattern fixture check ─────────────────────────────────────────────
    if is_anti_pattern:
        anti_pattern_pass = len(extracted_commitments) == 0
        if not anti_pattern_pass:
            print(
                f"  [ANTI_PATTERN_FAIL] {fixture_id}: expected 0 commitments, "
                f"got {len(extracted_commitments)}. IMMEDIATE FAIL — zero tolerance."
            )
        return {
            "fixture_id": fixture_id,
            "is_anti_pattern": True,
            "extracted_count": len(extracted_commitments),
            "anti_pattern_pass": anti_pattern_pass,
            "prompt_version": prompt_version,
            "latency_ms": round(latency_ms, 2),
        }

    # ── Precision/Recall computation ──────────────────────────────────────────
    expected_commitments = expected.get("expected_commitments", [])
    expected_count = expected.get("expected_commitment_count", len(expected_commitments))

    tp = 0
    fn = 0
    for expected_c in expected_commitments:
        if _match_commitment(expected_c, extracted_commitments):
            tp += 1
        else:
            fn += 1
            print(
                f"  [FN] '{expected_c.get('text_contains', '')}' "
                f"(owner: {expected_c.get('owner_name_contains', '')}) NOT found"
            )

    # False positives: extracted commitments with no corresponding expected entry
    fp = max(0, len(extracted_commitments) - tp)

    precision = tp / (tp + fp) if (tp + fp) > 0 else 1.0  # 1.0 if nothing extracted
    recall = tp / (tp + fn) if (tp + fn) > 0 else 1.0
    f1 = (
        2 * (precision * recall) / (precision + recall)
        if (precision + recall) > 0
        else 0.0
    )

    pass_p = precision >= EVAL_TARGETS["precision_min"]
    pass_r = recall >= EVAL_TARGETS["recall_min"]
    pass_f1 = f1 >= EVAL_TARGETS["f1_min"]

    print(
        f"  P={precision:.1%} ({'✓' if pass_p else '✗'}) | "
        f"R={recall:.1%} ({'✓' if pass_r else '✗'}) | "
        f"F1={f1:.1%} ({'✓' if pass_f1 else '✗'}) | "
        f"TP={tp} FP={fp} FN={fn}"
    )

    return {
        "fixture_id": fixture_id,
        "is_anti_pattern": False,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "extracted_count": len(extracted_commitments),
        "expected_count": expected_count,
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "precision_pass": pass_p,
        "recall_pass": pass_r,
        "f1_pass": pass_f1,
        "prompt_version": prompt_version,
        "latency_ms": round(latency_ms, 2),
    }


# ─── Service Health Check ──────────────────────────────────────────────────────

def _get_service_version(client: httpx.Client) -> str:
    """Fetch service version from /health endpoint."""
    try:
        response = client.get("/health")
        if response.status_code == 200:
            data = response.json()
            return data.get("version", "unknown")
    except Exception:
        pass
    return "unknown"


# ─── Main Eval Runner ─────────────────────────────────────────────────────────

def run_extraction_eval() -> bool:
    """Run the full extraction evaluation harness.

    Returns:
        True if all targets are met.
        False if any target fails.

    Raises:
        SystemExit(1) on anti-pattern failure (zero tolerance).
    """
    print("=" * 70)
    print("Vocaply AI Pipeline — Phase 4 Extraction Evaluation")
    print(f"Service URL: {SERVICE_BASE_URL}")
    print(f"Golden dataset: {GOLDEN_DATASET_DIR}")
    print("=" * 70)

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    with make_client() as client:
        # ── Service connectivity check ─────────────────────────────────────────
        service_version = _get_service_version(client)
        print(f"\nService version: {service_version}")

        # ── Load fixtures ──────────────────────────────────────────────────────
        fixtures = _find_fixtures()
        if not fixtures:
            print(f"\nERROR: No fixtures found in {GOLDEN_DATASET_DIR}")
            return False

        print(f"Found {len(fixtures)} fixtures: {[f['fixture_id'] for f in fixtures]}")

        # ── Evaluate each fixture ──────────────────────────────────────────────
        print("\nRunning extraction eval:")
        per_fixture_results = []
        anti_pattern_result = None
        prompt_version = "unknown"

        for fixture in fixtures:
            result = _evaluate_fixture(fixture, client)
            if result.get("error"):
                print(f"  [ERROR] {fixture['fixture_id']}: {result['error']}")
                continue

            if result.get("is_anti_pattern"):
                anti_pattern_result = result
                if not result.get("anti_pattern_pass", False):
                    # ZERO TOLERANCE: anti-pattern failure aborts the eval run
                    print(
                        f"\n{'='*70}\n"
                        f"EVAL ABORTED: Anti-pattern fixture '{result['fixture_id']}' extracted "
                        f"{result['extracted_count']} commitments. Expected 0.\n"
                        f"This is a ZERO TOLERANCE failure — fix the extraction prompt before "
                        f"re-running the eval.\n{'='*70}"
                    )
                    sys.exit(1)
            else:
                per_fixture_results.append(result)
                if result.get("prompt_version") not in (None, "unknown"):
                    prompt_version = result["prompt_version"]

        # ── Aggregate metrics ──────────────────────────────────────────────────
        if not per_fixture_results:
            print("\nERROR: No non-anti-pattern fixture results to aggregate.")
            return False

        total_tp = sum(r.get("tp", 0) for r in per_fixture_results)
        total_fp = sum(r.get("fp", 0) for r in per_fixture_results)
        total_fn = sum(r.get("fn", 0) for r in per_fixture_results)

        agg_precision = total_tp / (total_tp + total_fp) if (total_tp + total_fp) > 0 else 1.0
        agg_recall = total_tp / (total_tp + total_fn) if (total_tp + total_fn) > 0 else 1.0
        agg_f1 = (
            2 * (agg_precision * agg_recall) / (agg_precision + agg_recall)
            if (agg_precision + agg_recall) > 0
            else 0.0
        )

        precision_pass = agg_precision >= EVAL_TARGETS["precision_min"]
        recall_pass = agg_recall >= EVAL_TARGETS["recall_min"]
        f1_pass = agg_f1 >= EVAL_TARGETS["f1_min"]
        overall_pass = precision_pass and recall_pass and f1_pass
        if anti_pattern_result:
            overall_pass = overall_pass and anti_pattern_result.get("anti_pattern_pass", False)

        # ── Print results ──────────────────────────────────────────────────────
        print(f"\n{'='*70}")
        print("AGGREGATE EXTRACTION RESULTS:")
        print(f"  Precision: {agg_precision:.1%} (target: ≥{EVAL_TARGETS['precision_min']:.0%}) {'✓ PASS' if precision_pass else '✗ FAIL'}")
        print(f"  Recall:    {agg_recall:.1%} (target: ≥{EVAL_TARGETS['recall_min']:.0%}) {'✓ PASS' if recall_pass else '✗ FAIL'}")
        print(f"  F1:        {agg_f1:.1%} (target: ≥{EVAL_TARGETS['f1_min']:.0%}) {'✓ PASS' if f1_pass else '✗ FAIL'}")
        if anti_pattern_result:
            ap_pass = anti_pattern_result.get("anti_pattern_pass", False)
            print(f"  Anti-pattern ({anti_pattern_result['fixture_id']}): "
                  f"{anti_pattern_result['extracted_count']} extracted {'✓ PASS' if ap_pass else '✗ FAIL'}")
        print(f"\n  OVERALL: {'✓ ALL TARGETS MET — PHASE 4 EXTRACTION GATE PASSED' if overall_pass else '✗ TARGETS NOT MET'}")
        print(f"{'='*70}")

        # ── Write results file ─────────────────────────────────────────────────
        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        results_payload = {
            "timestamp": timestamp,
            "service_url": SERVICE_BASE_URL,
            "service_version": service_version,
            "prompt_version": prompt_version,
            "per_fixture": per_fixture_results,
            "aggregate": {
                "precision": round(agg_precision, 4),
                "recall": round(agg_recall, 4),
                "f1": round(agg_f1, 4),
                "total_tp": total_tp,
                "total_fp": total_fp,
                "total_fn": total_fn,
                "target_precision": EVAL_TARGETS["precision_min"],
                "target_recall": EVAL_TARGETS["recall_min"],
                "target_f1": EVAL_TARGETS["f1_min"],
                "precision_pass": precision_pass,
                "recall_pass": recall_pass,
                "f1_pass": f1_pass,
            },
            "anti_pattern_result": anti_pattern_result,
            "overall_pass": overall_pass,
        }

        out_path = RESULTS_DIR / f"extraction_eval_{timestamp.replace(':', '-')}.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(results_payload, f, indent=2, default=str)

        print(f"\nResults written to: {out_path}")
        return overall_pass


if __name__ == "__main__":
    success = run_extraction_eval()
    sys.exit(0 if success else 1)
