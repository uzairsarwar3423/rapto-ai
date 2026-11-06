"""
eval/ragas_harness.py
──────────────────────
ragas evaluation of the SUMMARY extractor. ragas is built for RAG /
summarisation, so it suits the summary better than classification metrics.

METRICS:
  context_recall       — does the summary cover the key meeting points?   pass ≥ 0.82
  faithfulness         — is every summary claim grounded in the transcript? pass ≥ 0.88
  semantic_similarity  — embedding similarity to the reference summary     pass ≥ 0.75

SAMPLE CONSTRUCTION (one ragas SingleTurnSample per fixture):
  user_input         "Summarize this meeting: purpose, key takeaways, decisions, outcomes."
  response           the structured summary flattened to prose
  retrieved_contexts [transcript]
  reference          expected_summary.reference_summary, or — when the fixture
                     has none — a reference synthesized from the golden
                     decisions / commitments / action items / blockers / risks
                     (marked "synthesized" in the output; add a human
                     reference_summary for a stricter signal)

DEPENDENCIES / COST:
  pip install -r requirements-eval.txt; OPENAI_API_KEY for the judge LLM
  (--judge-model, default gpt-4.1) and embeddings (text-embedding-3-small).

USAGE:
  python -m src.eval.ragas_harness --all
  python -m src.eval.ragas_harness --fixture standup_01
  python -m src.eval.ragas_harness --all --from-results src/eval/results/latest.json
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path
from typing import Any, Optional

from src.eval.eval_io import ExtractionRun, Fixture, load_fixtures, run_all_in_process, run_http

THRESHOLDS = {"context_recall": 0.82, "faithfulness": 0.88, "semantic_similarity": 0.75}
DEFAULT_JUDGE_MODEL = os.getenv("RAGAS_JUDGE_MODEL", "gpt-4.1")
DEFAULT_EMBEDDING_MODEL = os.getenv("RAGAS_EMBEDDING_MODEL", "text-embedding-3-small")
USER_INPUT = "Summarize this meeting: purpose, key takeaways, topics, decisions and outcomes."


def summary_to_text(summary: Any) -> str:
    """Flatten a StructuredSummary dict (or legacy string) to prose."""
    if isinstance(summary, str):
        return summary
    if not isinstance(summary, dict):
        return ""
    parts = [summary.get("meeting_purpose", ""), summary.get("overview", "")]
    parts += [f"Takeaway: {t}" for t in summary.get("key_takeaways", []) or []]
    for topic in summary.get("topics_discussed", []) or []:
        if isinstance(topic, dict):
            parts.append(f"{topic.get('topic', '')}: {'; '.join(topic.get('bullets', []) or [])}")
    parts += [f"Decision: {d}" for d in summary.get("decisions", []) or []]
    parts += [f"Conclusion: {c}" for c in summary.get("conclusions", []) or []]
    return "\n".join(p for p in parts if p and str(p).strip())


def reference_for(fixture: Fixture) -> tuple[str, bool]:
    """(reference text, synthesized?)"""
    case = fixture.case
    if case.expected_summary and case.expected_summary.reference_summary:
        return case.expected_summary.reference_summary, False
    lines = [f"{case.meeting_title or fixture.fixture_id} ({case.meeting_type} meeting)."]
    lines += [f"Decided: {d.text_contains}." for d in case.expected_decisions]
    lines += [f"{c.owner_name_contains} committed to {c.text_contains or 'a task'}." for c in case.expected_commitments]
    lines += [f"{a.assignee_name_contains} was asked to {a.text_contains}." for a in case.expected_action_items]
    lines += [f"Blocker: {b.text_contains}." for b in case.expected_blockers]
    lines += [f"Risk raised: {r.text_contains}." for r in case.expected_risks]
    if case.expected_summary and case.expected_summary.required_topics:
        lines.append("Topics: " + ", ".join(case.expected_summary.required_topics) + ".")
    return " ".join(lines), True


def build_samples(fixtures: list[Fixture], runs: dict[str, ExtractionRun]) -> list[dict[str, Any]]:
    """SingleTurnSample kwargs per fixture — pure, no ragas import needed."""
    samples = []
    for fixture in fixtures:
        run = runs.get(fixture.fixture_id)
        if run is None or run.result is None:
            continue
        response = summary_to_text(run.result.get("summary"))
        if not response.strip():
            continue
        reference, synthesized = reference_for(fixture)
        samples.append({
            "fixture_id": fixture.fixture_id,
            "synthesized_reference": synthesized,
            "sample": {
                "user_input": USER_INPUT,
                "response": response,
                "retrieved_contexts": [fixture.transcript_text],
                "reference": reference,
            },
        })
    return samples


def _require_ragas(judge_model: str, embedding_model: str) -> tuple[Any, Any, list[Any], Any, Any]:
    try:
        from langchain_openai import ChatOpenAI, OpenAIEmbeddings
        from ragas import EvaluationDataset, SingleTurnSample, evaluate
        from ragas.embeddings import LangchainEmbeddingsWrapper
        from ragas.llms import LangchainLLMWrapper
        from ragas.metrics import Faithfulness, LLMContextRecall, SemanticSimilarity
    except ImportError as exc:  # pragma: no cover — environment guard
        raise SystemExit("ragas is not installed. Run: pip install -r requirements-eval.txt") from exc
    os.environ.setdefault("RAGAS_DO_NOT_TRACK", "true")
    llm = LangchainLLMWrapper(ChatOpenAI(model=judge_model, temperature=0))
    embeddings = LangchainEmbeddingsWrapper(OpenAIEmbeddings(model=embedding_model))
    metrics = [LLMContextRecall(), Faithfulness(), SemanticSimilarity()]
    return (evaluate, (EvaluationDataset, SingleTurnSample), metrics, llm, embeddings)


def _clean(value: Any) -> Optional[float]:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(number) else round(number, 4)


def evaluate_runs(
    fixtures: list[Fixture],
    runs: dict[str, ExtractionRun],
    judge_model: str = DEFAULT_JUDGE_MODEL,
    embedding_model: str = DEFAULT_EMBEDDING_MODEL,
) -> dict[str, Any]:
    prepared = build_samples(fixtures, runs)
    if not prepared:
        return {"aggregate": {}, "per_fixture": [], "pass": True, "note": "no summaries to score"}

    evaluate, (EvaluationDataset, SingleTurnSample), metrics, llm, embeddings = _require_ragas(
        judge_model, embedding_model
    )
    dataset = EvaluationDataset(samples=[SingleTurnSample(**p["sample"]) for p in prepared])
    result = evaluate(dataset, metrics=metrics, llm=llm, embeddings=embeddings, show_progress=False)

    names = [m.name for m in metrics]  # context_recall, faithfulness, semantic_similarity
    per_fixture = []
    for prep, row in zip(prepared, result.scores):
        per_fixture.append({
            "fixture_id": prep["fixture_id"],
            "synthesized_reference": prep["synthesized_reference"],
            **{name: _clean(row.get(name)) for name in names},
        })

    aggregate: dict[str, Any] = {}
    verdicts = []
    for name in names:
        values = [r[name] for r in per_fixture if r[name] is not None]
        mean = round(sum(values) / len(values), 4) if values else None
        aggregate[name] = mean
        if mean is not None and name in THRESHOLDS:
            verdicts.append(mean >= THRESHOLDS[name])
    return {
        "judge_model": judge_model,
        "thresholds": THRESHOLDS,
        "aggregate": aggregate,
        "per_fixture": per_fixture,
        "pass": all(verdicts) if verdicts else True,
    }


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    scope = parser.add_mutually_exclusive_group(required=True)
    scope.add_argument("--all", action="store_true")
    scope.add_argument("--fixture", action="append")
    parser.add_argument("--judge-model", default=DEFAULT_JUDGE_MODEL)
    parser.add_argument("--embedding-model", default=DEFAULT_EMBEDDING_MODEL)
    parser.add_argument("--from-results", type=Path, help="Re-score saved responses (no extraction calls)")
    parser.add_argument("--service-url", default=os.getenv("AI_PIPELINE_URL", "http://localhost:8001"))
    parser.add_argument("--api-key", default=os.getenv("API_SHARED_SECRET", "dev-secret"))
    parser.add_argument("--in-process", action="store_true")
    args = parser.parse_args(argv)

    fixtures = load_fixtures(only=None if args.all else args.fixture)
    if args.from_results:
        doc = json.loads(args.from_results.read_text(encoding="utf-8"))
        runs = {fid: ExtractionRun(fid, r, 200, 0.0) for fid, r in (doc.get("responses") or {}).items()}
    elif args.in_process:
        runs = run_all_in_process(fixtures)
    else:
        runs = {f.fixture_id: run_http(f, args.service_url, args.api_key) for f in fixtures}

    report = evaluate_runs(fixtures, runs, args.judge_model, args.embedding_model)
    print(json.dumps({k: report[k] for k in ("aggregate", "per_fixture")}, indent=2))
    print("RAGAS:", "PASS" if report["pass"] else "FAIL")
    return 0 if report["pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
