"""
eval/run_extraction_eval.py
────────────────────────────
Backward-compatible entry point for the Day 55 extraction eval.

The original commitments-only harness has been superseded by
eval/run_all_evals.py, which evaluates all extractors with one-to-one
matching, calibration error, anti-pattern gating and a payload builder that
produces valid ExtractRequest bodies (the v1 harness posted participants as
bare strings and transcript turns in the wrong shape, which /extract rejects).

This module keeps the old command and environment variables working:

  AI_PIPELINE_URL=http://localhost:8001 API_SHARED_SECRET=<secret> \\
    python -m src.eval.run_extraction_eval            # all extractors
  python -m src.eval.run_extraction_eval --extractor commitments

Any extra arguments are passed through to run_all_evals.
"""

from __future__ import annotations

import sys
from typing import Optional

from src.eval.run_all_evals import main as run_all_evals_main


def run_extraction_eval(argv: Optional[list[str]] = None) -> bool:
    """Run the eval; True when all targets pass (legacy return contract)."""
    return run_all_evals_main(argv or []) == 0


if __name__ == "__main__":
    sys.exit(0 if run_extraction_eval(sys.argv[1:]) else 1)
