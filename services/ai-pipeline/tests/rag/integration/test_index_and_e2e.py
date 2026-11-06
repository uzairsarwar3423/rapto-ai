"""HNSW usage (EXPLAIN), filtered under-fill, latency, and the end-to-end path.

The 50k-vector tests are slow (index build): enable with RAG_TEST_LARGE=1.
"""

from __future__ import annotations

import os
import statistics
import time

import numpy as np
import pytest
from pgvector.asyncpg import register_vector

from src.eval.eval_io import build_extract_payload, load_fixtures
from src.models.chunk_models import ChunkingStrategy, TranscriptContent
from src.models.cleanup_models import CleanedTranscriptTurn
from src.models.rag_models import EmbeddingSource, VectorSearchQuery
from src.rag import vector_store as vs
from src.rag.chunker_adapter import to_chunks_to_embed
from src.rag.db import create_database
from src.rag.embedder import embed_chunks
from src.rag.tenant_context import tenant_tx
from src.services.chunker import chunk_content
from tests.rag.helpers import FakeEmbeddingClient, vec_for
from tests.rag.integration.conftest import make_settings

pytestmark = pytest.mark.asyncio
LARGE = pytest.mark.skipif(not os.getenv("RAG_TEST_LARGE"), reason="set RAG_TEST_LARGE=1 (builds a 50k-vector HNSW index)")

BIG, SMALL = 49_500, 500


async def explain(db, team_id: str, sql: str, args: list, *, analyze: bool = True) -> str:
    prefix = "EXPLAIN (ANALYZE, BUFFERS) " if analyze else "EXPLAIN "
    async with tenant_tx(db, team_id, readonly=True, search=True, top_k=20) as conn:
        rows = await conn.fetch(prefix + sql, *args)
    return "\n".join(r[0] for r in rows)


@pytest.fixture
async def large_db(rag_dsns, admin):
    await admin.execute("DROP INDEX IF EXISTS rag.idx_embeddings_hnsw")
    await register_vector(admin, schema="public")
    rng = np.random.default_rng(42)

    async def records(team: str, n: int, offset: int):
        for lo in range(0, n, 5_000):
            size = min(5_000, n - lo)
            block = rng.normal(size=(size, 1536)).astype(np.float32)
            block /= np.linalg.norm(block, axis=1, keepdims=True)
            for k in range(size):
                i = offset + lo + k
                yield (team, "transcript_chunk", f"s{i // 200}", i % 200, f"synthetic chunk {i}",
                       f"{i:064x}", block[k], "text-embedding-3-small")

    cols = ["team_id", "source_type", "source_id", "chunk_index", "chunk_text", "content_hash", "embedding", "model_name"]
    await admin.copy_records_to_table("embeddings", schema_name="rag", columns=cols, records=records("teamA", BIG, 0))
    await admin.copy_records_to_table("embeddings", schema_name="rag", columns=cols, records=records("teamB", SMALL, BIG))
    await admin.execute("""UPDATE rag.embeddings SET metadata = '{"meeting_id": "mb"}' WHERE team_id = 'teamB'""")
    await admin.execute("SET maintenance_work_mem = '1GB'")
    await admin.execute("SET max_parallel_maintenance_workers = 0")        # parallel build needs a big /dev/shm
    await admin.execute("CREATE INDEX idx_embeddings_hnsw ON rag.embeddings USING hnsw (embedding vector_cosine_ops) "
                        "WITH (m = 16, ef_construction = 64)")
    await admin.execute("ANALYZE rag.embeddings")
    db = await create_database(make_settings(rag_dsns["app"]))
    yield db
    await db.close()


@LARGE
async def test_hnsw_usage_underfill_and_latency_on_50k_vectors(rag_dsns, large_db):
    """One 50k-vector build, three checks (the index build dominates the runtime)."""
    # 1. EXPLAIN: the search really uses the HNSW index; the negative control does not.
    query = VectorSearchQuery(team_id="teamA", query_embedding=vec_for("probe"), top_k=20)
    sql, args = vs.build_search_sql(query)
    plan = await explain(large_db, "teamA", sql, args)
    print("\n--- EXPLAIN (ANALYZE, BUFFERS): similarity search ---\n" + plan)
    assert "Index Scan using idx_embeddings_hnsw" in plan and "Seq Scan" not in plan

    wrong = sql.replace("ORDER BY embedding <=> $2::vector", "ORDER BY 1 - (embedding <=> $2::vector) DESC")
    # plan only: actually EXECUTING the exact-scan plan exceeds the 2 s statement timeout, which is the point
    wrong_plan = await explain(large_db, "teamA", wrong, args, analyze=False)
    print("--- negative control: ORDER BY 1 - distance ---\n" + wrong_plan)
    assert "idx_embeddings_hnsw" not in wrong_plan                      # why the raw-operator rule exists

    # 2. a 500-row tenant inside 50k rows still gets a full top-20 (iterative scan), with a recorded 'off' comparison
    q = VectorSearchQuery(team_id="teamB", query_embedding=vec_for("needle"), top_k=20, meeting_id="mb")
    on = await vs.similarity_search_with_stats(large_db, q)
    off_db = await create_database(make_settings(rag_dsns["app"], hnsw_iterative_scan="off"))
    try:
        off = await vs.similarity_search_with_stats(off_db, q)
    finally:
        await off_db.close()
    print(f"\nfiltered small-tenant search: iterative_scan=relaxed_order → {on.stats.returned_k}/20 rows; "
          f"off → {off.stats.returned_k}/20 rows (underfilled={off.stats.underfilled})")
    assert on.stats.returned_k == 20 and not on.stats.underfilled

    # 3. latency
    rng = np.random.default_rng(1)
    times = []
    for _ in range(200):
        vec = rng.normal(size=1536)
        q = VectorSearchQuery(team_id="teamA", query_embedding=(vec / np.linalg.norm(vec)).tolist(), top_k=20)
        t0 = time.perf_counter()
        await vs.similarity_search(large_db, q)
        times.append((time.perf_counter() - t0) * 1000)
    p50, p95 = statistics.median(times), statistics.quantiles(times, n=20)[18]
    print(f"search latency over 200 queries @ {BIG + SMALL} rows: p50={p50:.1f}ms p95={p95:.1f}ms")
    assert p95 < 500          # loose CI guard; the plan target (<100 ms) is judged from the printed value


# ── end to end (no network) ──────────────────────────────────────────────────


async def test_transcript_to_chunks_to_search_end_to_end(rag_db):
    fixture = next(f for f in load_fixtures() if f.fixture_id == "planning_01")
    payload = build_extract_payload(fixture)
    turns = [CleanedTranscriptTurn(**{**t, "original_text": t["original_text"]}) for t in payload["cleaned_transcript"]]
    text_chunks, _ = chunk_content(TranscriptContent(turns=turns), ChunkingStrategy.SPEAKER_TURN_GROUPED,
                                   max_tokens=120, overlap_units=1)
    chunks = to_chunks_to_embed(text_chunks, team_id="teamA", source_type=EmbeddingSource.TRANSCRIPT_CHUNK,
                                source_id="planning_01", base_metadata={"meeting_id": "planning_01"})
    assert len(chunks) > 3

    result = await embed_chunks(chunks, FakeEmbeddingClient(), rag_db)
    assert result.upserted_count == len(chunks) and result.total_cost.estimated_cost_usd > 0

    target = chunks[len(chunks) // 2]
    hits = await vs.similarity_search(rag_db, VectorSearchQuery(team_id="teamA", query_embedding=vec_for(target.content), top_k=5))
    assert hits[0].chunk_text == target.content and hits[0].similarity_score == pytest.approx(1.0, abs=1e-4)
    assert hits[0].metadata["meeting_id"] == "planning_01" and "start_time" in hits[0].metadata    # citation fields


@pytest.mark.skipif(not os.getenv("RAG_LIVE_OPENAI"), reason="set RAG_LIVE_OPENAI=1 (one real, paid OpenAI call)")
async def test_live_openai_paraphrase_retrieval(rag_db):
    from src.config.settings import get_settings
    from src.services.openai_client import OpenAIClient
    from src.rag.embedder import QueryEmbedder

    client = OpenAIClient(get_settings(), role="rag-live-test")
    facts = ["We have decided to drop the invoice PDF export from this sprint and move it to sprint 25.",
             "Tom is blocked on the staging database because he still has no write access.",
             "Priya will own the Paddle webhook handler and merge it by the end of next week.",
             "Lena is worried the Paddle sandbox does not support proration testing."]
    result = await embed_chunks([chunk_ for chunk_ in to_chunks_to_embed(
        [__import__("src.models.chunk_models", fromlist=["TextChunk"]).TextChunk(content=f, token_count=20, chunk_index=i)
         for i, f in enumerate(facts)], team_id="teamA", source_type=EmbeddingSource.TRANSCRIPT_CHUNK, source_id="live")],
        client, rag_db)
    assert result.failed_count == 0 and result.total_cost.estimated_cost_usd > 0
    qe = QueryEmbedder(client, rag_db.settings)
    vec = await qe.embed_query("Who can't access the staging environment?")
    hits = await vs.similarity_search(rag_db, VectorSearchQuery(team_id="teamA", query_embedding=vec, top_k=3))
    assert "staging" in hits[0].chunk_text
