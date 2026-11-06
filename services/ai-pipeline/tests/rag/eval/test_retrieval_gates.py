"""Retrieval eval gates (Day 57 §12.6).

OFFLINE (RAG_TEST_ADMIN_DSN): the stand-in embedder cannot certify retrieval QUALITY, so these tests enforce
what it CAN prove — the harness is deterministic, no result ever crosses a tenant, and the plumbing has not
regressed against the committed offline baseline.

LIVE (RAG_LIVE_OPENAI=1, paid): the real blocking gates — recall@5 >= 70%, recall@20 >= 90% on tune AND
holdout, and re-rank beating fusion-only on nDCG@3 and MRR.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from src.eval.retrieval_eval import run_eval

ADMIN_DSN = os.getenv("RAG_TEST_ADMIN_DSN") or os.getenv("RAG_EVAL_ADMIN_DSN")
BASELINE = Path(__file__).resolve().parents[2] / "fixtures" / "eval_baseline.json"

pytestmark = [pytest.mark.skipif(not ADMIN_DSN, reason="needs a throwaway pgvector Postgres (RAG_TEST_ADMIN_DSN)"),
              pytest.mark.asyncio]


async def test_offline_eval_is_deterministic_and_tenant_safe():
    first = await run_eval(ADMIN_DSN, variants=["vector_only", "lexical_only", "hybrid_rrf"])
    second = await run_eval(ADMIN_DSN, variants=["vector_only", "lexical_only", "hybrid_rrf"])
    for variant in first["variants"]:
        assert first["variants"][variant]["overall"] == second["variants"][variant]["overall"], variant
        assert first["variants"][variant]["per_query"] == second["variants"][variant]["per_query"], variant
        assert first["variants"][variant]["cross_tenant_violations"] == {}, variant
    assert first["n_queries"] >= 40


async def test_offline_plumbing_has_not_regressed_against_the_committed_baseline():
    if not BASELINE.exists():
        pytest.skip("no committed baseline yet: run scripts.run_retrieval_eval --write-baseline")
    baseline = json.loads(BASELINE.read_text("utf-8"))
    report = await run_eval(ADMIN_DSN, baseline=baseline)
    failures = [g for g in report["gates"] if g["status"] == "FAIL"]
    assert not failures, failures                      # cross-tenant, or a >3 point drop vs the baseline
    assert any(g["gate"].startswith("zero cross-tenant") and g["status"] == "PASS" for g in report["gates"])
    assert any(g["status"] == "NOT_EVALUATED" for g in report["gates"])      # the re-rank gate must say it was NOT run


async def test_every_category_and_split_is_covered_and_unanswerable_are_labeled():
    report = await run_eval(ADMIN_DSN, variants=["hybrid_rrf"])
    queries = json.loads((Path(__file__).resolve().parents[2] / "fixtures" / "retrieval_eval_queries.json").read_text("utf-8"))["queries"]
    categories = {q["category"] for q in queries}
    assert categories == {"name_owner", "semantic", "temporal", "commitment", "decision", "multi_source",
                          "code_switch", "unanswerable", "cross_tenant"}
    minimum = {"name_owner": 6, "semantic": 6, "temporal": 5, "commitment": 5, "decision": 4, "multi_source": 4,
               "code_switch": 3, "unanswerable": 4, "cross_tenant": 3}
    for category, floor in minimum.items():
        assert sum(1 for q in queries if q["category"] == category) >= floor, category
    holdout = sum(1 for q in queries if q["split"] == "holdout")
    assert 0.15 <= holdout / len(queries) <= 0.40                              # ~25% held out, never used for tuning
    assert set(report["variants"]["hybrid_rrf"]["by_split"]) == {"tune", "holdout"}


@pytest.mark.skipif(not os.getenv("RAG_LIVE_OPENAI"), reason="set RAG_LIVE_OPENAI=1 (paid: real embeddings + GPT-4.1 Mini)")
async def test_live_blocking_gates():
    from src.config.settings import get_settings
    from src.services.openai_client import OpenAIClient

    report = await run_eval(ADMIN_DSN, live=True, openai_client=OpenAIClient(get_settings(), role="retrieval-eval"))
    print(json.dumps(report["gates"], indent=2))
    assert not [g for g in report["gates"] if g["status"] == "FAIL"], report["gates"]
