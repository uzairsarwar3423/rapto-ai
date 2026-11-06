"""Day 57 on a real Postgres + pgvector: lexical leg, view isolation, filter parity, end-to-end retrieval."""

from __future__ import annotations

import random
from datetime import date, datetime, timezone

import asyncpg
import pytest

from src.config.rag_config import RagSettings
from src.models.rag_models import EmbeddingSource, LexicalSearchQuery, RetrievalFilters, VectorSearchQuery
from src.rag import vector_store as vs
from src.rag.embedder import QueryEmbedder, embed_chunks
from src.rag.query_processing import process_query
from src.rag.reranker import LLMReranker
from src.rag.retriever import Retriever
from src.rag.source_context import SourceContextResolver
from src.rag.tenant_context import tenant_tx
from tests.rag.helpers import FakeEmbeddingClient, chunk, vec_for
from tests.rag.test_retrieval_unit import FakeAI, out

pytestmark = pytest.mark.asyncio


async def lexical(db, team, text, **kw):
    p = process_query(text)
    q = LexicalSearchQuery(team_id=team, query_embedding=vec_for(text), tokens=p.tokens, top_k=kw.pop("top_k", 30), **kw)
    return await vs.lexical_search(db, q)


# ── migration 003 / source-context view ──────────────────────────────────────


async def test_tsvector_is_maintained_by_postgres(rag_db, admin):
    await embed_chunks([chunk(0, "the quarterly roadmap review")], FakeEmbeddingClient(), rag_db)
    await admin.execute("UPDATE rag.embeddings SET chunk_text = 'now it mentions zebra migration'")
    assert await admin.fetchval("SELECT count(*) FROM rag.embeddings WHERE chunk_tsv @@ to_tsquery('simple','zebra')") == 1
    assert await admin.fetchval("SELECT count(*) FROM rag.embeddings WHERE chunk_tsv @@ to_tsquery('simple','roadmap')") == 0


async def test_view_is_tenant_scoped_fail_closed_and_core_tables_stay_private(rag_db, admin):
    at = datetime(2026, 6, 9, 10, 0, tzinfo=timezone.utc)
    await admin.execute("TRUNCATE public.meetings, public.users")
    await admin.executemany('INSERT INTO public.meetings VALUES ($1,$2,$3,$4,$5)',
                            [("mA", "teamA", "A planning", at, "DONE"), ("mB", "teamB", "B secret roadmap", at, "DONE")])
    await admin.executemany('INSERT INTO public.users VALUES ($1,$2,$3,$4)',
                            [("uA", "teamA", "Alice", None), ("uB", "teamB", "Bob", None), ("uGone", "teamA", "Deleted", at)])

    async with rag_db.pool.acquire() as conn:                                        # no tenant set
        assert await conn.fetchval("SELECT count(*) FROM rag.v_rag_source_context") == 0
    async with tenant_tx(rag_db, "teamA", readonly=True) as conn:
        rows = {(r["kind"], r["ref_id"]) for r in await conn.fetch("SELECT kind, ref_id FROM rag.v_rag_source_context")}
        assert rows == {("meeting", "mA"), ("user", "uA")}                           # not B's rows, not the deleted user
        assert await conn.fetchval("SELECT count(*) FROM rag.v_rag_source_context WHERE ref_id = 'mB'") == 0
    for table in ("public.meetings", "public.users"):
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            async with tenant_tx(rag_db, "teamA", readonly=True) as conn:
                await conn.fetch(f"SELECT * FROM {table}")


# ── lexical leg ──────────────────────────────────────────────────────────────


async def test_lexical_finds_a_rare_name_the_vector_leg_misses(rag_db):
    """The case the spec's post-hoc keyword boost could never handle."""
    filler = [f"general discussion number {i} about sprint logistics and tooling" for i in range(300)]
    target = "Zulfiqar volunteered to own the legacy database migration"
    texts = filler + [target]                                                        # 301 chunks over 3 sources
    chunks = [chunk(i % 150, t, source=f"s{i // 150}") for i, t in enumerate(texts)]
    await embed_chunks(chunks, FakeEmbeddingClient(), rag_db)

    query = "what did Zulfiqar volunteer for"
    vec_hits = await vs.similarity_search(rag_db, VectorSearchQuery(team_id="teamA", query_embedding=vec_for(query), top_k=30))
    assert target not in {h.chunk_text for h in vec_hits}                        # the vector leg does NOT surface it
    lex_hits = await lexical(rag_db, "teamA", query)
    assert lex_hits and lex_hits[0].chunk_text == target and lex_hits[0].rank == 1
    assert 0.0 <= lex_hits[0].similarity_score <= 1.0                            # exact cosine is returned for thresholds


async def test_lexical_uses_or_semantics_for_natural_language(rag_db):
    await embed_chunks([chunk(0, "billing page launch moved to friday", source="a"),
                        chunk(0, "ahmed owns the webhook handler", source="b")], FakeEmbeddingClient(), rag_db)
    hits = await lexical(rag_db, "teamA", "what is the status of the billing page and who is ahmed")
    assert {h.chunk_text for h in hits} == {"billing page launch moved to friday", "ahmed owns the webhook handler"}


@pytest.mark.parametrize("payload", ["foo & bar", "a | b", "!x", "term:*", "(a & b) | c", "o'brien", "x <-> y", "'; DROP TABLE rag.embeddings;--"])
async def test_fulltext_operator_payloads_never_raise(rag_db, admin, payload):
    await embed_chunks([chunk(0, "foo bar a b term obrien x y brien")], FakeEmbeddingClient(), rag_db)
    tokens = process_query(f"find {payload}").tokens
    if tokens:
        hits = await lexical(rag_db, "teamA", f"find {payload}")
        assert isinstance(hits, list)
    assert await admin.fetchval("SELECT count(*) FROM rag.embeddings") == 1      # the table survived


async def test_filters_apply_identically_to_both_legs(rag_db):
    client = FakeEmbeddingClient()
    await embed_chunks([chunk(i, f"billing review part {i}", source="m1", when=date(2026, 1, 10)) for i in range(3)], client, rag_db)
    await embed_chunks([chunk(i, f"billing review part {i}", source="m2", when=date(2026, 3, 10)) for i in range(3)], client, rag_db)
    await embed_chunks([chunk(0, "billing decision made", source="d1", kind=EmbeddingSource.DECISION,
                              when=date(2026, 2, 1), meta={"meeting_id": "m1"})], client, rag_db)
    cases = [
        (dict(source_types=[EmbeddingSource.DECISION]), {"d1"}),
        (dict(meeting_ids=["m1"]), {"m1", "d1"}),                          # derived rows match via metadata.meeting_id
        (dict(meeting_ids=["m2", "nope"]), {"m2"}),
        (dict(date_range=(date(2026, 2, 1), date(2026, 3, 31))), {"d1", "m2"}),
        (dict(source_types=[EmbeddingSource.TRANSCRIPT_CHUNK], meeting_ids=["m1"],
              date_range=(date(2026, 1, 1), date(2026, 1, 31))), {"m1"}),
    ]
    for filters, expected in cases:
        v = await vs.similarity_search(rag_db, VectorSearchQuery(team_id="teamA", query_embedding=vec_for("billing"), top_k=50, **filters))
        l = await lexical(rag_db, "teamA", "billing review decision", top_k=50, **filters)
        assert {h.source_id for h in v} == expected, ("vector", filters)
        assert {h.source_id for h in l} == expected, ("lexical", filters)
    # an empty allowed set (access scope ∩ request) returns nothing from either leg
    assert await vs.similarity_search(rag_db, VectorSearchQuery(team_id="teamA", query_embedding=vec_for("x"), meeting_ids=[])) == []
    assert await lexical(rag_db, "teamA", "billing", meeting_ids=[]) == []


async def test_lexical_leg_never_returns_another_teams_rows(rag_db):
    client = FakeEmbeddingClient()
    shared = [f"shared roadmap sentence {i} about the quarterly billing release" for i in range(25)]
    for team in ("teamA", "teamB"):
        await embed_chunks([chunk(i, t, team=team, source=f"{team}-m") for i, t in enumerate(shared)], client, rag_db)
    rng = random.Random(11)
    words = "shared roadmap sentence quarterly billing release".split()
    for _ in range(100):
        asker = rng.choice(["teamA", "teamB"])
        hits = await lexical(rag_db, asker, " ".join(rng.sample(words, 3)))
        assert hits and all(h.source_id.startswith(asker) for h in hits)


# ── end to end through the real stack ────────────────────────────────────────


async def test_retrieve_end_to_end_with_real_view_citations_and_caches(rag_db, admin):
    at = datetime(2026, 6, 9, 21, 30, tzinfo=timezone.utc)                           # 02:30 on the 10th in Karachi
    await admin.execute("TRUNCATE public.meetings, public.users")
    await admin.executemany('INSERT INTO public.meetings VALUES ($1,$2,$3,$4,$5)',
                            [("m1", "teamA", "Sprint 24 Planning", at, "DONE")])
    await admin.execute('INSERT INTO public.users VALUES ($1,$2,$3,$4)', "u1", "teamA", "Ahmed Hassan", None)

    texts = ["We decided to ship the billing page on Friday", "Ahmed will finish the webhook handler by Thursday",
             "Unrelated chat about lunch options"]
    chunks = [chunk(i, t, source="m1", meta={"meeting_id": "m1", "start_time": 10.0 * i, "end_time": 10.0 * i + 8})
              for i, t in enumerate(texts)]
    chunks.append(chunk(0, "Commitment by Ahmed Hassan: finish the webhook handler", source="c1",
                        kind=EmbeddingSource.COMMITMENT,
                        meta={"meeting_id": "m1", "commitment_owner_id": "u1", "due_date_utc": "2026-06-11T18:00:00+00:00"}))
    chunks.append(chunk(0, "Orphaned chunk whose meeting was deleted", source="ghost", meta={"meeting_id": "ghost"}))
    client = FakeEmbeddingClient()
    await embed_chunks(chunks[:3], client, rag_db)
    for c in chunks[3:]:
        await embed_chunks([c], client, rag_db)

    settings = RagSettings(rerank_top_n=3, noise_floor_similarity=0.0)
    ai = FakeAI(out((0, 3), (1, 2), (2, 0), (3, 1)))
    retriever = Retriever(rag_db, QueryEmbedder(client, settings), LLMReranker(ai, settings),
                          SourceContextResolver(rag_db, settings), settings)
    filters = RetrievalFilters()
    res = await retriever.retrieve("what is Ahmed doing with the webhook handler", "teamA", filters=filters,
                                   timezone_name="Asia/Karachi", as_of=datetime(2026, 6, 15, 9, 0, tzinfo=timezone.utc))

    assert all(c.chunk.source_id != "ghost" for c in res.candidates)                 # orphan guard dropped it
    assert [c.source_id for c in res.citations] == [c.chunk.source_id for c in res.reranked]
    transcript = next(c for c in res.citations if c.source_type is EmbeddingSource.TRANSCRIPT_CHUNK)
    assert transcript.meeting_id == "m1" and transcript.meeting_title == "Sprint 24 Planning"
    assert transcript.meeting_date == date(2026, 6, 10)                              # team-timezone DATE (UTC date is the 9th)
    assert transcript.start_time is not None
    commit = next(c for c in res.citations if c.source_type is EmbeddingSource.COMMITMENT)
    assert commit.commitment_owner_name == "Ahmed Hassan" and commit.due_date == date(2026, 6, 11)
    assert res.embedding_cost.estimated_cost_usd > 0 and res.reranking_cost.estimated_cost_usd > 0
    assert not res.degraded and res.retrieval_confidence > 0

    again = await retriever.retrieve("what is Ahmed doing with the webhook handler", "teamA", filters=filters,
                                     timezone_name="Asia/Karachi")
    assert again.embedding_cost.estimated_cost_usd == 0                              # query-embedding cache hit
    assert [c.chunk.source_id for c in again.reranked] == [c.chunk.source_id for c in res.reranked]

    other_team = await retriever.retrieve("what is Ahmed doing with the webhook handler", "teamB")
    assert other_team.no_relevant_context and other_team.candidates == []             # tenant B sees none of A
