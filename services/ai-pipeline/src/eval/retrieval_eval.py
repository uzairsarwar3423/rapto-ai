"""
eval/retrieval_eval.py — retrieval evaluation harness (Day 57, deliverable D4).

Loads the labeled corpus into a THROWAWAY Postgres through the REAL Day 56 write
path, runs every retrieval variant over the labeled queries, and reports recall /
MRR / nDCG with per-category + tune/holdout slices, bootstrap 95% CIs, ablations
and gates.

HONESTY ABOUT EMBEDDINGS
  offline (default)  a deterministic stand-in embedder (concept-hashed bag of words
                     with a small thesaurus). It regression-tests the PLUMBING —
                     fusion, lexical leg, filters, tenancy, citations, determinism —
                     but it is NOT a semantic model. Offline recall numbers must not
                     be read as production retrieval quality.
  --live             real text-embedding-3-small vectors and the real GPT-4.1 Mini
                     re-ranker (paid; needs OPENAI_API_KEY). Only live numbers can
                     certify the quality gates and the "re-rank beats fusion" gate.

Gate statuses: PASS | FAIL | NOT_EVALUATED (e.g. re-rank gate offline).
"""

from __future__ import annotations

import hashlib
import json
import math
import random
import re
import secrets
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator, Optional
from urllib.parse import urlsplit, urlunsplit

import asyncpg

from src.config.rag_config import RagSettings, RerankerStrategy, RetrievalMode
from src.models.common import AICallResult, CostRecord, ModelTier, TaskType
from src.models.rag_models import ChunkToEmbed, EmbeddingSource, RetrievalFilters, VectorSearchQuery
from src.rag import migrate, vector_store as vs
from src.rag.db import RagDatabase, create_database
from src.rag.embedder import QueryEmbedder, embed_chunks
from src.rag.query_processing import stop_words
from src.rag.reranker import LLMReranker
from src.rag.retriever import Retriever
from src.rag.source_context import SourceContextResolver

FIXTURES = Path(__file__).resolve().parents[2] / "tests" / "fixtures"
CORPUS_PATH = FIXTURES / "retrieval_eval_corpus.json"
QUERIES_PATH = FIXTURES / "retrieval_eval_queries.json"
DEFAULT_CACHE = FIXTURES / "eval_embeddings_cache.json"
DIMS = 1536
APP_PASSWORD = "eval_app_pw"

# ─── Offline stand-in embedder ────────────────────────────────────────────────

_THESAURUS = [
    {"tax", "vat", "taxes"}, {"vendor", "provider"}, {"duplicate", "twice", "repeat", "resend", "retry", "retries"},
    {"offline", "down", "outage", "unavailable"}, {"missed", "miss", "lost"}, {"postponed", "deferred", "delay", "delayed"},
    {"overload", "load", "storm", "crash"}, {"tester", "testers", "qa", "test", "tests", "testing"},
    {"unable", "blocked", "blocker", "stuck", "missing"}, {"launch", "release", "ship", "shipped"},
    {"risk", "concern", "worry", "danger"}, {"decide", "decided", "decision", "choose", "chose", "pick", "picked"},
    {"promise", "commit", "committed", "commitment", "own", "owns", "owner", "responsible", "agree", "agreed"},
]
_CANON = {w: sorted(group)[0] for group in _THESAURUS for w in group}
_WORD = re.compile(r"\w+", re.UNICODE)


def _stem(word: str) -> str:
    for suffix in ("ing", "ed", "es", "s"):
        if word.endswith(suffix) and len(word) - len(suffix) >= 4:
            return word[: -len(suffix)]
    return word


def offline_embed(text: str) -> list[float]:
    stop = stop_words()
    counts: dict[str, int] = {}
    for token in _WORD.findall(text.casefold()):
        if token in stop or len(token) < 2:
            continue
        concept = _CANON.get(token) or _CANON.get(_stem(token)) or _stem(token)
        counts[concept] = counts.get(concept, 0) + 1
    vec = [0.0] * DIMS
    for concept, tf in counts.items():
        digest = hashlib.sha1(concept.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % DIMS
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vec[index] += sign * (1.0 + math.log(tf))
    norm = math.sqrt(sum(v * v for v in vec))
    if norm == 0.0:
        vec[0], norm = 1.0, 1.0
    return [v / norm for v in vec]


class OfflineEmbeddingClient:
    async def generate_embeddings(self, texts, *, model=None, request_id=None, max_attempts=5):
        return AICallResult(
            data=[offline_embed(t) for t in texts],
            cost=CostRecord(input_tokens=sum(len(t.split()) for t in texts), output_tokens=0, model_tier=ModelTier.EMBED,
                            model_name="offline-stand-in", estimated_cost_usd=0.0),
            latency_ms=0.0, retry_count=0, task_type=TaskType.EMBEDDING, model_name="text-embedding-3-small")


class CachedEmbeddingClient:
    """Vector cache keyed by text hash: a live run fills it once, later runs are offline and free."""

    def __init__(self, inner: Any, path: Path, *, write: bool) -> None:
        self._inner, self._path, self._write = inner, path, write
        self._cache: dict[str, list[float]] = json.loads(path.read_text("utf-8")) if path.exists() else {}
        self._dirty = False

    @staticmethod
    def _key(text: str) -> str:
        return hashlib.sha256(text.encode("utf-8")).hexdigest()

    async def generate_embeddings(self, texts, *, model=None, request_id=None, max_attempts=5):
        missing = [t for t in dict.fromkeys(texts) if self._key(t) not in self._cache]
        cost = CostRecord(input_tokens=0, output_tokens=0, model_tier=ModelTier.EMBED, model_name="cache", estimated_cost_usd=0.0)
        if missing:
            fetched = await self._inner.generate_embeddings(missing, model=model, request_id=request_id, max_attempts=max_attempts)
            cost = fetched.cost
            for text, vector in zip(missing, fetched.data):
                self._cache[self._key(text)] = vector
            self._dirty = True
        return AICallResult(data=[self._cache[self._key(t)] for t in texts], cost=cost, latency_ms=0.0, retry_count=0,
                            task_type=TaskType.EMBEDDING, model_name="text-embedding-3-small")

    def save(self) -> None:
        if self._write and self._dirty:
            self._path.write_text(json.dumps(self._cache), encoding="utf-8")


# ─── Scratch database + seeding ───────────────────────────────────────────────


def _dsn(base: str, database: str, user: Optional[str] = None, password: Optional[str] = None) -> str:
    parts = urlsplit(base)
    netloc = f"{user}:{password}@{parts.hostname}:{parts.port or 5432}" if user else parts.netloc
    return urlunsplit(parts._replace(path=f"/{database}", netloc=netloc))


@dataclass
class Seeded:
    db: RagDatabase
    key_of: dict[tuple[str, str, int], str]      # (source_type, source_id, chunk_index) → fixture key
    team_of: dict[str, str]                      # fixture key → team
    corpus: dict[str, Any]


@asynccontextmanager
async def scratch_database(admin_dsn: str, corpus: dict[str, Any], client: Any, settings_overrides: dict[str, Any]) -> AsyncIterator[Seeded]:
    """Create → migrate → seed → yield → DROP. Never touches an existing database."""
    name = f"rag_eval_{secrets.token_hex(4)}"
    root = await asyncpg.connect(_dsn(admin_dsn, "postgres"))
    await root.execute(f'CREATE DATABASE "{name}"')
    admin = await asyncpg.connect(_dsn(admin_dsn, name))
    db: Optional[RagDatabase] = None
    try:
        await admin.execute("CREATE TABLE public.teams (id text PRIMARY KEY)")
        await admin.execute('CREATE TABLE public.meetings (id text PRIMARY KEY, "teamId" text NOT NULL, title text NOT NULL, '
                            '"scheduledAt" timestamptz NOT NULL, status text NOT NULL DEFAULT \'DONE\')')
        await admin.execute('CREATE TABLE public.users (id text PRIMARY KEY, "teamId" text, name text NOT NULL, "deletedAt" timestamptz)')
        teams = sorted({m["team"] for m in corpus["meetings"]})
        await admin.executemany("INSERT INTO public.teams VALUES ($1)", [(t,) for t in teams])
        await admin.executemany("INSERT INTO public.users (id, \"teamId\", name) VALUES ($1,$2,$3)",
                                [(u["id"], u["team"], u["name"]) for u in corpus["users"]])
        await admin.executemany('INSERT INTO public.meetings VALUES ($1,$2,$3,$4,$5)',
                                [(m["key"], m["team"], m["title"], datetime.fromisoformat(f"{m['date']}T10:00:00+05:00"), "DONE")
                                 for m in corpus["meetings"]])
        await migrate.migrate_up(_dsn(admin_dsn, name), app_role_password=APP_PASSWORD)

        db = await create_database(RagSettings(
            rag_enabled=True, rag_database_url=_dsn(admin_dsn, name, "vocaply_ai_app", APP_PASSWORD),
            rag_pool_min_size=1, rag_pool_max_size=6, **settings_overrides))
        key_of, team_of = await seed(db, corpus, client)
        yield Seeded(db, key_of, team_of, corpus)
    finally:
        if db is not None:
            await db.close()
        await admin.close()
        await root.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
        await root.close()


async def seed(db: RagDatabase, corpus: dict[str, Any], client: Any) -> tuple[dict, dict]:
    users = {u["id"]: u["name"] for u in corpus["users"]}
    key_of: dict[tuple[str, str, int], str] = {}
    team_of: dict[str, str] = {}
    by_team: dict[str, list[ChunkToEmbed]] = {}

    def add(team: str, fixture_key: str, kind: EmbeddingSource, source_id: str, index: int, text: str,
            when: date, meta: dict[str, Any]) -> None:
        by_team.setdefault(team, []).append(ChunkToEmbed(
            content=text, source_type=kind, source_id=source_id, chunk_index=index, team_id=team, source_date=when, metadata=meta))
        key_of[(kind.value, source_id, index)] = fixture_key
        team_of[fixture_key] = team

    for m in corpus["meetings"]:
        when, mk, team = date.fromisoformat(m["date"]), m["key"], m["team"]
        base = {"meeting_id": mk, "meeting_title": m["title"]}
        for i, (speaker, text) in enumerate(m["chunks"]):
            add(team, f"{mk}.t{i}", EmbeddingSource.TRANSCRIPT_CHUNK, mk, i, f"{speaker}: {text}", when,
                {**base, "speaker_name": speaker, "start_time": 60.0 * i, "end_time": 60.0 * i + 50})
        for i, c in enumerate(m.get("commitments", [])):
            add(team, f"{mk}.c{i}", EmbeddingSource.COMMITMENT, f"{mk}-c{i}", 0,
                f"Commitment by {users[c['owner']]}: {c['text']} (due {c['due']})", when,
                {**base, "commitment_owner_id": c["owner"], "due_date_utc": f"{c['due']}T18:00:00+00:00"})
        for i, d in enumerate(m.get("decisions", [])):
            add(team, f"{mk}.d{i}", EmbeddingSource.DECISION, f"{mk}-d{i}", 0, f"Decision: {d}", when, base)
        if m.get("summary"):
            add(team, f"{mk}.s", EmbeddingSource.SUMMARY, mk, 0, m["summary"], when, base)

    for team, chunks in by_team.items():
        # one request per SOURCE keeps replace-mode indices contiguous
        grouped: dict[tuple[str, str], list[ChunkToEmbed]] = {}
        for c in chunks:
            grouped.setdefault((c.source_type.value, c.source_id), []).append(c)
        for group in grouped.values():
            result = await embed_chunks(group, client, db)
            assert result.failed_count == 0, result.failures
    return key_of, team_of


# ─── Metrics (pure) ───────────────────────────────────────────────────────────


def recall_at(ranked: list[str], rel2: set[str], k: int) -> float:
    return len(rel2 & set(ranked[:k])) / len(rel2) if rel2 else 1.0


def mrr_at(ranked: list[str], rel2: set[str], k: int = 10) -> float:
    for position, key in enumerate(ranked[:k], start=1):
        if key in rel2:
            return 1.0 / position
    return 0.0


def ndcg_at(ranked: list[str], graded: dict[str, int], k: int) -> float:
    gain = lambda g: (2 ** g) - 1  # noqa: E731
    dcg = sum(gain(graded.get(key, 0)) / math.log2(i + 2) for i, key in enumerate(ranked[:k]))
    ideal = sorted(graded.values(), reverse=True)[:k]
    idcg = sum(gain(g) / math.log2(i + 2) for i, g in enumerate(ideal))
    return dcg / idcg if idcg else 0.0


def precision_at(ranked: list[str], rel2: set[str], n: int) -> float:
    top = ranked[:n]
    return sum(1 for k in top if k in rel2) / len(top) if top else 0.0


def bootstrap_ci(values: list[float], *, seed: int = 7, samples: int = 1000) -> tuple[float, float, float]:
    """(mean, lo, hi) 95% percentile bootstrap. Deterministic. With ~40 queries the interval is WIDE: that is the point."""
    if not values:
        return 0.0, 0.0, 0.0
    rng = random.Random(seed)
    means = sorted(sum(rng.choices(values, k=len(values))) / len(values) for _ in range(samples))
    return sum(values) / len(values), means[int(0.025 * samples)], means[int(0.975 * samples) - 1]


def spec_keyword_boost(hits: list[Any], query: str, stop: frozenset[str]) -> list[str]:
    """The ORIGINAL spec's approach, for the ablation: +0.05 per query word found, capped at 1.0, re-sort the vector top-K."""
    words = [w for w in _WORD.findall(query.casefold()) if w not in stop and len(w) > 1]
    scored = []
    for hit in hits:
        text = hit.chunk_text.casefold()
        score = min(1.0, hit.similarity_score + 0.05 * sum(1 for w in words if w in text))
        scored.append((-score, hit.source_id, hit.chunk_index, hit))
    return [h for *_, h in sorted(scored, key=lambda t: t[:3])]


# ─── Runner ───────────────────────────────────────────────────────────────────


def query_filters(q: dict[str, Any]) -> RetrievalFilters:
    """The filters Day 58's intent router would hand the retriever for this query."""
    raw = (q.get("filters") or {}).get("date_range")
    return RetrievalFilters(date_range=(date.fromisoformat(raw[0]), date.fromisoformat(raw[1])) if raw else None)


@dataclass
class QueryRun:
    qid: str
    category: str
    split: str
    candidates: list[str]
    final: list[str]
    grades_present: bool
    no_context: bool
    confidence: float
    cross_tenant_violations: list[str] = field(default_factory=list)
    degraded: bool = False


async def run_variant(seeded: Seeded, queries: list[dict[str, Any]], variant: str, *, settings: RagSettings,
                      client: Any, reranker_client: Any, tz: str, as_of: datetime) -> list[QueryRun]:
    reranker = LLMReranker(reranker_client, settings)
    embedder = QueryEmbedder(client, settings)
    ctx = SourceContextResolver(seeded.db, settings)
    retriever = Retriever(seeded.db, embedder, reranker, ctx, settings)
    stop = stop_words()
    runs: list[QueryRun] = []
    for q in queries:
        team = q.get("team", "teamA")
        filters = query_filters(q)
        if variant == "spec_keyword_boost":
            vec = await embedder.embed_query(q["text"], team_id=team)
            hits = await vs.similarity_search(seeded.db, VectorSearchQuery(
                team_id=team, query_embedding=vec, top_k=settings.similarity_top_k, **filters.shared_fields()))
            keys = [seeded.key_of[(h.source_type.value, h.source_id, h.chunk_index)]
                    for h in spec_keyword_boost(hits, q["text"], stop)]
            runs.append(QueryRun(q["id"], q["category"], q["split"], keys, keys[:settings.rerank_top_n], False, False, 0.0,
                                 [k for k in keys if seeded.team_of[k] != team]))
            continue
        mode = {"vector_only": RetrievalMode.VECTOR_ONLY, "lexical_only": RetrievalMode.LEXICAL_ONLY}.get(variant, RetrievalMode.HYBRID_RRF)
        res = await retriever.retrieve(q["text"], team, filters=filters, as_of=as_of, timezone_name=tz, mode=mode)
        name = lambda c: seeded.key_of[c.key]  # noqa: E731
        cand, final = [name(c) for c in res.candidates], [name(c) for c in res.reranked]
        runs.append(QueryRun(q["id"], q["category"], q["split"], cand, final, any(c.rerank_grade is not None for c in res.reranked),
                             res.no_relevant_context, res.retrieval_confidence,
                             [k for k in cand + final if seeded.team_of[k] != team], res.degraded))
    return runs


def summarize(runs: list[QueryRun], queries: list[dict[str, Any]]) -> dict[str, Any]:
    by_id = {q["id"]: q for q in queries}
    answerable = [r for r in runs if by_id[r.qid]["relevant"]]
    per_query: dict[str, dict[str, float]] = {}
    for r in answerable:
        graded = by_id[r.qid]["relevant"]
        rel2 = {k for k, g in graded.items() if g >= 2}
        per_query[r.qid] = {
            "recall@5": recall_at(r.candidates, rel2, 5), "recall@20": recall_at(r.candidates, rel2, 20),
            "hit@3": 1.0 if rel2 & set(r.candidates[:3]) else 0.0, "mrr@10": mrr_at(r.candidates, rel2),
            "ndcg@3": ndcg_at(r.final, graded, 3), "ndcg@8": ndcg_at(r.final, graded, 8),
            "final_mrr": mrr_at(r.final, rel2), "precision@N": precision_at(r.final, rel2, 8),
        }

    def agg(rows: list[str]) -> dict[str, dict[str, float]]:
        out: dict[str, dict[str, float]] = {}
        for metric in next(iter(per_query.values()), {}):
            mean, lo, hi = bootstrap_ci([per_query[q][metric] for q in rows])
            out[metric] = {"mean": round(mean, 4), "ci_lo": round(lo, 4), "ci_hi": round(hi, 4)}
        return out

    ids = list(per_query)
    unanswerable = [r for r in runs if by_id[r.qid].get("unanswerable")]
    return {
        "n_answerable": len(ids),
        "per_query": {q: {m: round(v, 3) for m, v in vals.items()} for q, vals in per_query.items()},
        "overall": agg(ids),
        "by_split": {s: agg([q for q in ids if by_id[q]["split"] == s]) for s in ("tune", "holdout") if any(by_id[q]["split"] == s for q in ids)},
        "by_category": {c: agg([q for q in ids if by_id[q]["category"] == c]) for c in sorted({by_id[q]["category"] for q in ids})},
        "unanswerable": {
            "n": len(unanswerable),
            "flagged_no_context": sum(1 for r in unanswerable if r.no_context),
            "graded_runs": sum(1 for r in unanswerable if r.grades_present),
        },
        "cross_tenant_violations": {r.qid: r.cross_tenant_violations for r in runs if r.cross_tenant_violations},
        "degraded_queries": [r.qid for r in runs if r.degraded],
    }


# ─── Gates ────────────────────────────────────────────────────────────────────

BLOCKING = {"recall@5": 0.70, "recall@20": 0.90}
TARGETS = {"recall@5": 0.80, "recall@20": 0.95}


def evaluate_gates(report: dict[str, Any], *, live: bool, baseline: Optional[dict[str, Any]], max_regression: float = 0.03) -> list[dict[str, str]]:
    gates: list[dict[str, str]] = []
    hybrid = report["variants"]["hybrid_rrf"]

    def add(name: str, status: str, detail: str = "") -> None:
        gates.append({"gate": name, "status": status, "detail": detail})

    # Offline numbers come from a stand-in embedder, so they cannot CERTIFY quality: they are reported as INFO.
    verdict = (lambda ok: "PASS" if ok else "FAIL") if live else (lambda ok: "INFO")
    note = "" if live else " — offline stand-in: not a quality verdict"
    for scope, block in [("overall", hybrid["overall"]), *[(f"split={s}", b) for s, b in hybrid["by_split"].items()]]:
        for metric, floor in BLOCKING.items():
            value = block[metric]["mean"]
            add(f"hybrid {metric} >= {floor:.0%} [{scope}]", verdict(value >= floor),
                f"{value:.3f} (95% CI {block[metric]['ci_lo']:.3f}-{block[metric]['ci_hi']:.3f})"
                + ("" if live else f"; would {'pass' if value >= floor else 'fail'}") + note)
    for metric, target in TARGETS.items():
        value = hybrid["overall"][metric]["mean"]
        add(f"target {metric} >= {target:.0%} (non-blocking)", verdict(value >= target), f"{value:.3f}{note}")
    violations = sum(len(v["cross_tenant_violations"]) for v in report["variants"].values())
    add("zero cross-tenant results (all variants, all queries)", "PASS" if violations == 0 else "FAIL", f"{violations} violation(s)")
    if live:
        fusion, rerank = hybrid["overall"], report["variants"].get("hybrid_rerank", {}).get("overall")
        if rerank:
            for metric in ("ndcg@3", "final_mrr"):
                better = rerank[metric]["mean"] > fusion[metric]["mean"]
                add(f"re-rank beats fusion-only on {metric}", "PASS" if better else "FAIL",
                    f"{rerank[metric]['mean']:.3f} vs {fusion[metric]['mean']:.3f}")
    else:
        add("re-rank beats fusion-only (nDCG@3, MRR)", "NOT_EVALUATED", "needs --live (real GPT-4.1 Mini grader)")
    if baseline and baseline.get("mode") != report["mode"]:
        add("baseline comparison", "NOT_EVALUATED", f"baseline is {baseline.get('mode')!r}, this run is {report['mode']!r}")
    elif baseline:
        for metric, cur in hybrid["overall"].items():
            old = baseline["variants"]["hybrid_rrf"]["overall"].get(metric, {}).get("mean")
            if old is not None and cur["mean"] < old - max_regression:
                add(f"regression vs baseline: {metric}", "FAIL", f"{old:.3f} -> {cur['mean']:.3f}")
    return gates


# ─── Orchestration ────────────────────────────────────────────────────────────


async def run_eval(
    admin_dsn: str,
    *,
    live: bool = False,
    openai_client: Any = None,
    split: str = "all",
    variants: Optional[list[str]] = None,
    cache_path: Path = DEFAULT_CACHE,
    update_cache: bool = False,
    noise_floor: Optional[float] = None,
    baseline: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    corpus = json.loads(CORPUS_PATH.read_text("utf-8"))
    queries = json.loads(QUERIES_PATH.read_text("utf-8"))["queries"]
    for q in queries:
        q.setdefault("team", "teamA")
    if split != "all":
        queries = [q for q in queries if q["split"] == split]
    variants = variants or ["vector_only", "spec_keyword_boost", "lexical_only", "hybrid_rrf"] + (["hybrid_rerank"] if live else [])

    if live:
        inner = openai_client
        client: Any = CachedEmbeddingClient(inner, cache_path, write=update_cache or not cache_path.exists())
        floor = 0.15 if noise_floor is None else noise_floor
    else:
        client = OfflineEmbeddingClient()
        floor = 0.0 if noise_floor is None else noise_floor      # stand-in cosine scale is not calibrated
    overrides = dict(noise_floor_similarity=floor, rerank_strategy=RerankerStrategy.SCORE_ONLY)

    tz, as_of = corpus["timezone"], datetime.fromisoformat(corpus["as_of"].replace("Z", "+00:00"))
    report: dict[str, Any] = {"mode": "live" if live else "offline-stand-in", "n_queries": len(queries),
                              "split": split, "noise_floor": floor, "variants": {}}
    async with scratch_database(admin_dsn, corpus, client, overrides) as seeded:
        for variant in variants:
            settings = RagSettings(rag_enabled=True, rag_database_url="postgresql://x:y@localhost/z", **{
                **overrides, **({"rerank_strategy": RerankerStrategy.GPT41_MINI} if variant == "hybrid_rerank" else {})})
            runs = await run_variant(seeded, queries, variant, settings=settings, client=client,
                                     reranker_client=openai_client, tz=tz, as_of=as_of)
            report["variants"][variant] = summarize(runs, queries)
    if isinstance(client, CachedEmbeddingClient):
        client.save()
    report["gates"] = evaluate_gates(report, live=live, baseline=baseline)
    return report


def format_report(report: dict[str, Any]) -> str:
    lines = [f"Retrieval eval — mode={report['mode']} queries={report['n_queries']} split={report['split']}"]
    if report["mode"] != "live":
        lines.append("  ** OFFLINE stand-in embedder: validates plumbing, NOT semantic retrieval quality **")
    lines.append(f"\n{'variant':<20}{'recall@5':>10}{'recall@20':>11}{'MRR@10':>9}{'nDCG@3':>9}{'finalMRR':>10}")
    for name, v in report["variants"].items():
        o = v["overall"]
        lines.append(f"{name:<20}{o['recall@5']['mean']:>10.3f}{o['recall@20']['mean']:>11.3f}{o['mrr@10']['mean']:>9.3f}"
                     f"{o['ndcg@3']['mean']:>9.3f}{o['final_mrr']['mean']:>10.3f}")
    hybrid = report["variants"]["hybrid_rrf"]
    lines.append("\nhybrid_rrf by category (recall@5 / recall@20):")
    for cat, block in hybrid["by_category"].items():
        lines.append(f"  {cat:<14}{block['recall@5']['mean']:>7.3f}{block['recall@20']['mean']:>9.3f}")
    lines.append("\nGates:")
    for g in report["gates"]:
        lines.append(f"  [{g['status']:^13}] {g['gate']}  {g['detail']}")
    return "\n".join(lines)
