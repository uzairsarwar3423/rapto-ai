"""Migration, P0 tenant isolation, write semantics and search — on a real pgvector."""

from __future__ import annotations

import random
from datetime import date

import asyncpg
import pytest

from src.models.rag_models import EmbeddingSource, UpsertMode, VectorSearchQuery
from src.rag import migrate, vector_store as vs
from src.rag.db import create_database
from src.rag.embedder import embed_chunks
from src.rag.errors import TenantIsolationError
from src.rag.tenant_context import tenant_tx
from tests.rag.helpers import FakeEmbeddingClient, chunk, vec_for
from tests.rag.integration.conftest import dsn_for, make_settings

pytestmark = pytest.mark.asyncio

VEC = "[" + ",".join(["0.0255"] * 1536) + "]"


async def seed(admin, team, source="m1", text="hello"):
    await admin.execute(
        "INSERT INTO rag.embeddings (team_id,source_type,source_id,chunk_text,content_hash,embedding) "
        "VALUES ($1,'transcript_chunk',$2,$3,$4,$5::vector)", team, source, text, f"{abs(hash(team + text)):x}".rjust(64, "0"), VEC)


# ── migration ────────────────────────────────────────────────────────────────


async def test_migration_up_down_up_on_scratch_db(rag_dsns):
    import secrets

    name = f"rag_mig_{secrets.token_hex(3)}"
    root = await asyncpg.connect(dsn_for(rag_dsns["root"], "postgres"))
    await root.execute(f'CREATE DATABASE "{name}"')
    dsn = dsn_for(rag_dsns["root"], name)
    try:
        c = await asyncpg.connect(dsn)
        await c.execute("CREATE TABLE public.teams (id text PRIMARY KEY)")
        assert await migrate.migrate_up(dsn) == ["001_pgvector_embeddings_table", "002_embedding_jobs"]
        assert await migrate.migrate_up(dsn) == []                                   # idempotent
        assert await migrate.migrate_down(dsn, steps=2) == ["002_embedding_jobs", "001_pgvector_embeddings_table"]
        assert await c.fetchval("SELECT to_regclass('rag.embeddings')") is None
        assert await c.fetchval("SELECT count(*) FROM pg_extension WHERE extname='vector'") == 1   # extension kept
        assert len(await migrate.migrate_up(dsn)) == 2
        flags = await c.fetchrow("SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid='rag.embeddings'::regclass")
        assert flags["relrowsecurity"] and flags["relforcerowsecurity"]
        indexes = {r[0] for r in await c.fetch("SELECT indexname FROM pg_indexes WHERE schemaname='rag' AND tablename='embeddings'")}
        assert {"idx_embeddings_hnsw", "idx_embeddings_team_hash", "idx_embeddings_team_type_date",
                "idx_embeddings_metadata_gin", "uq_embeddings_identity"} <= indexes
        await c.close()
    finally:
        await root.execute(f'DROP DATABASE "{name}" WITH (FORCE)')
        await root.close()


# ── P0: tenant isolation ─────────────────────────────────────────────────────


async def test_missing_tenant_context_fails_closed(rag_db, admin):
    await seed(admin, "teamA")
    await seed(admin, "teamB")
    async with rag_db.pool.acquire() as conn:                  # raw session, no tenant set
        assert await conn.fetchval("SELECT count(*) FROM rag.embeddings") == 0
    async with tenant_tx(rag_db, "teamA") as conn:
        assert await conn.fetchval("SELECT count(*) FROM rag.embeddings") == 1


async def test_explicit_where_for_another_team_returns_nothing(rag_db, admin):
    await seed(admin, "teamB")
    async with tenant_tx(rag_db, "teamA") as conn:
        assert await conn.fetchval("SELECT count(*) FROM rag.embeddings WHERE team_id = 'teamB'") == 0


async def test_cross_tenant_insert_is_blocked_by_with_check(rag_db):
    async with tenant_tx(rag_db, "teamA") as conn:
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            await conn.execute(
                "INSERT INTO rag.embeddings (team_id,source_type,source_id,chunk_text,content_hash,embedding) "
                "VALUES ('teamB','decision','x','t',$1,$2::vector)", "b" * 64, [0.0255] * 1536)


async def test_tenant_context_does_not_leak_across_pooled_connections(rag_dsns, admin):
    await seed(admin, "teamA")
    db = await create_database(make_settings(rag_dsns["app"], rag_pool_max_size=1))   # force connection reuse
    try:
        async with tenant_tx(db, "teamA") as conn:
            assert await conn.fetchval("SELECT count(*) FROM rag.embeddings") == 1
        async with db.pool.acquire() as conn:                                          # SAME physical connection
            assert await conn.fetchval("SELECT count(*) FROM rag.embeddings") == 0
            assert await conn.fetchval("SELECT current_setting('app.current_team_id', true)") in (None, "")
    finally:
        await db.close()


async def test_service_refuses_to_start_with_a_bypassrls_role(rag_dsns):
    with pytest.raises(TenantIsolationError, match="SUPERUSER or BYPASSRLS"):
        await create_database(make_settings(rag_dsns["admin"]))


async def test_randomised_searches_never_return_another_teams_rows(rag_db):
    client = FakeEmbeddingClient()
    shared = [f"shared sentence number {i} about the quarterly roadmap" for i in range(30)]
    for team in ("teamA", "teamB"):
        await embed_chunks([chunk(i, t, team=team, source=f"{team}-m", meta={"meeting_id": f"{team}-m"})
                            for i, t in enumerate(shared)], client, rag_db)
    rng = random.Random(7)
    for _ in range(100):
        asker = rng.choice(["teamA", "teamB"])
        q = VectorSearchQuery(team_id=asker, query_embedding=vec_for(rng.choice(shared)), top_k=20)
        results = await vs.similarity_search(rag_db, q)
        assert results and all(r.source_id.startswith(asker) for r in results)


# ── write semantics ──────────────────────────────────────────────────────────


async def test_idempotent_upsert_change_detection_and_updated_at(rag_db, admin):
    client = FakeEmbeddingClient()
    chunks = [chunk(i, f"billing discussion part {i}") for i in range(10)]

    first = await embed_chunks(chunks, client, rag_db)
    assert (first.upserted_count, first.updated_count, first.unchanged_count) == (10, 0, 0)
    calls = len(client.calls)

    second = await embed_chunks(chunks, client, rag_db)
    assert (second.upserted_count, second.updated_count, second.unchanged_count) == (0, 0, 10)
    assert len(client.calls) == calls                                            # zero extra API calls

    before = await admin.fetchval("SELECT updated_at FROM rag.embeddings WHERE chunk_index = 3")
    edited = list(chunks)
    edited[3] = chunk(3, "billing discussion part 3 — EDITED")
    third = await embed_chunks(edited, client, rag_db)
    assert (third.updated_count, third.unchanged_count) == (1, 9) and third.api_calls == 1
    after = await admin.fetchval("SELECT updated_at FROM rag.embeddings WHERE chunk_index = 3")
    assert after > before                                                        # trigger advanced it


async def test_replace_semantics_delete_orphans(rag_db, admin):
    client = FakeEmbeddingClient()
    await embed_chunks([chunk(i, f"segment {i}") for i in range(40)], client, rag_db)
    result = await embed_chunks([chunk(i, f"segment {i}") for i in range(35)], client, rag_db)
    assert result.deleted_orphans == 5 and result.api_calls == 0
    assert await admin.fetchval("SELECT count(*) FROM rag.embeddings") == 35
    assert await admin.fetchval("SELECT max(chunk_index) FROM rag.embeddings") == 34


async def test_same_text_in_two_meetings_keeps_two_rows_with_separate_citations(rag_db, admin):
    client = FakeEmbeddingClient()
    text = "Thanks everyone, see you next week"
    await embed_chunks([chunk(0, text, source="mA")], client, rag_db)
    second = await embed_chunks([chunk(0, text, source="mB")], client, rag_db)
    assert second.reused_vector_count == 1 and second.api_calls == 0
    assert await admin.fetchval("SELECT count(*) FROM rag.embeddings") == 2

    assert await vs.delete_by_source(rag_db, "teamA", EmbeddingSource.TRANSCRIPT_CHUNK, "mA") == 1
    left = await admin.fetch("SELECT source_id FROM rag.embeddings")
    assert [r["source_id"] for r in left] == ["mB"]                              # B survives A's deletion


async def test_vector_reuse_never_crosses_teams(rag_db):
    client = FakeEmbeddingClient()
    text = "confidential roadmap statement"
    await embed_chunks([chunk(0, text, team="teamA", source="a")], client, rag_db)
    await embed_chunks([chunk(0, text, team="teamB", source="b")], client, rag_db)
    assert client.texts_sent == 2                                                # B paid for its own embedding


async def test_merge_mode_never_deletes(rag_db, admin):
    client = FakeEmbeddingClient()
    await embed_chunks([chunk(i, f"item {i}") for i in range(3)], client, rag_db)
    await embed_chunks([chunk(1, "item 1 changed")], client, rag_db, mode=UpsertMode.MERGE)
    assert await admin.fetchval("SELECT count(*) FROM rag.embeddings") == 3


async def test_concurrent_reprocessing_of_one_source_is_safe(rag_db, admin):
    import asyncio

    client = FakeEmbeddingClient()
    chunks = [chunk(i, f"concurrent chunk {i}") for i in range(8)]
    results = await asyncio.gather(*(embed_chunks(chunks, client, rag_db) for _ in range(5)))
    assert await admin.fetchval("SELECT count(*) FROM rag.embeddings") == 8        # no duplicates, no deadlock
    assert all(r.failed_count == 0 for r in results)


# ── search ───────────────────────────────────────────────────────────────────


async def test_exact_match_ranks_first_with_scores_in_range(rag_db):
    client = FakeEmbeddingClient()
    texts = [f"distinct topic {i} {'alpha beta gamma delta'[: 5 + i]}" for i in range(10)]
    await embed_chunks([chunk(i, t) for i, t in enumerate(texts)], client, rag_db)
    out = await vs.similarity_search_with_stats(rag_db, VectorSearchQuery(team_id="teamA", query_embedding=vec_for(texts[3]), top_k=10))
    assert out.results[0].chunk_text == texts[3] and out.results[0].similarity_score == pytest.approx(1.0, abs=1e-4)
    scores = [r.similarity_score for r in out.results]
    assert scores == sorted(scores, reverse=True) and all(0 <= s <= 1 for s in scores)
    assert [r.rank for r in out.results] == list(range(1, len(out.results) + 1))
    assert out.stats.returned_k == len(out.results) <= 10


async def test_filters_narrow_results(rag_db):
    client = FakeEmbeddingClient()
    await embed_chunks([chunk(i, f"meeting one chunk {i}", source="m1", when=date(2026, 1, 10)) for i in range(4)], client, rag_db)
    await embed_chunks([chunk(i, f"meeting two chunk {i}", source="m2", when=date(2026, 3, 10)) for i in range(4)], client, rag_db)
    await embed_chunks([chunk(0, "a firm decision", source="d1", kind=EmbeddingSource.DECISION, when=date(2026, 2, 1), meta={"meeting_id": "m1"})], client, rag_db)
    base = dict(team_id="teamA", query_embedding=vec_for("anything"), top_k=50)

    def q(**kw):
        return vs.similarity_search(rag_db, VectorSearchQuery(**base, **kw))

    assert len(await q()) == 9
    assert {r.source_id for r in await q(source_types=["decision"])} == {"d1"}
    assert {r.source_id for r in await q(meeting_id="m1")} == {"m1", "d1"}           # via metadata containment
    assert {r.source_id for r in await q(source_ids_filter=["m2"])} == {"m2"}
    assert {r.source_id for r in await q(date_range=(date(2026, 2, 1), date(2026, 3, 31)))} == {"d1", "m2"}
    assert await q(min_similarity=0.99) == []


async def test_search_ignores_rows_from_another_model(rag_db, admin):
    await embed_chunks([chunk(0, "current model row")], FakeEmbeddingClient(), rag_db)
    await admin.execute("UPDATE rag.embeddings SET model_name = 'text-embedding-3-large'")
    assert await vs.similarity_search(rag_db, VectorSearchQuery(team_id="teamA", query_embedding=vec_for("current model row"))) == []
