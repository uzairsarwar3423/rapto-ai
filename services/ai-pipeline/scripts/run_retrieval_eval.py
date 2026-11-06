"""
scripts/run_retrieval_eval.py — retrieval evaluation CLI.

  # offline, free, deterministic — validates PLUMBING (stand-in embedder, no re-rank)
  RAG_EVAL_ADMIN_DSN=postgresql://postgres:pw@localhost:55433/postgres \\
      python -m scripts.run_retrieval_eval

  # LIVE: real embeddings + real GPT-4.1 Mini re-ranker. Costs money; the only run that
  # can certify the quality gates. Fills tests/fixtures/eval_embeddings_cache.json.
  python -m scripts.run_retrieval_eval --live --update-cache

  python -m scripts.run_retrieval_eval --split holdout --baseline tests/fixtures/eval_baseline.json
  python -m scripts.run_retrieval_eval --write-baseline tests/fixtures/eval_baseline.json

The admin DSN must point at a THROWAWAY server: the harness creates and DROPs a database
named rag_eval_<random>. Exit code 1 if any gate FAILs (NOT_EVALUATED does not fail).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Optional

from src.eval.retrieval_eval import DEFAULT_CACHE, format_report, run_eval


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--admin-dsn", default=os.getenv("RAG_EVAL_ADMIN_DSN") or os.getenv("RAG_TEST_ADMIN_DSN"))
    p.add_argument("--live", action="store_true", help="real embeddings + real re-ranker (PAID)")
    p.add_argument("--split", choices=("all", "tune", "holdout"), default="all")
    p.add_argument("--variant", action="append", help="limit to a variant (repeatable)")
    p.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    p.add_argument("--update-cache", action="store_true", help="(live) write fetched vectors to the cache file")
    p.add_argument("--noise-floor", type=float)
    p.add_argument("--baseline", type=Path, help="diff against a stored baseline (fail on a >3 point drop)")
    p.add_argument("--write-baseline", type=Path, help="store this run as the new baseline (give a reason in the PR)")
    p.add_argument("--json", type=Path, help="write the full report here")
    return p.parse_args(argv)


async def amain(args: argparse.Namespace) -> int:
    if not args.admin_dsn:
        print("ERROR: set RAG_EVAL_ADMIN_DSN (a THROWAWAY pgvector Postgres) or pass --admin-dsn")
        return 2
    client = None
    if args.live:
        from src.config.settings import get_settings
        from src.services.openai_client import OpenAIClient

        client = OpenAIClient(get_settings(), role="retrieval-eval")
    baseline = json.loads(args.baseline.read_text("utf-8")) if args.baseline and args.baseline.exists() else None
    report = await run_eval(args.admin_dsn, live=args.live, openai_client=client, split=args.split, variants=args.variant,
                            cache_path=args.cache, update_cache=args.update_cache, noise_floor=args.noise_floor,
                            baseline=baseline)
    print(format_report(report))
    if args.json:
        args.json.write_text(json.dumps(report, indent=2), encoding="utf-8")
    if args.write_baseline:
        args.write_baseline.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"baseline written -> {args.write_baseline}")
    return 1 if any(g["status"] == "FAIL" for g in report["gates"]) else 0


def main(argv: Optional[list[str]] = None) -> int:
    return asyncio.run(amain(parse_args(argv)))


if __name__ == "__main__":
    sys.exit(main())
