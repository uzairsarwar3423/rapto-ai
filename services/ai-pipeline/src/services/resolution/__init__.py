"""
services/resolution/__init__.py
────────────────────────────────────────────────────────────────────────────────
Vocaply AI Pipeline — Resolution Package Public API
Day 53 + Day 54 + Day 55 Extension | Principal Engineer Edition

PUBLIC API — what the rest of the service imports from this package:
  resolve()                 — Day 53: model-free similarity-based resolver
  detect_resolution()       — Day 54: single-pair two-stage resolution detector
  detect_many()             — Day 54: batch detection with bounded concurrency
  run_resolution_pipeline() — Day 55: full orchestrator (route handler uses ONLY this)

PHASE 4 CONTRACT: The route handler (api/routes/resolve.py) imports and calls
ONLY run_resolution_pipeline(). It never calls resolve(), detect_resolution(),
or detect_many() directly. The orchestrator owns the entire resolution chain.
"""

from src.services.resolution.commitment_resolver import resolve
from src.services.resolution.resolution_detector import (
    detect_many,
    detect_resolution,
)
from src.services.resolution.resolver_pipeline import run_resolution_pipeline

__all__ = [
    "resolve",
    "detect_resolution",
    "detect_many",
    "run_resolution_pipeline",
]
