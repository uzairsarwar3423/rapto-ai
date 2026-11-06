"""Embedder orchestration with the vector store mocked (no DB, no network)."""

from __future__ import annotations

import math
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.config.rag_config import RagSettings
from src.models.exceptions import AIRateLimitExhaustedError, AINonRetryableError
from src.models.common import ModelTier
from src.models.rag_models import UpsertMode
from src.rag import embedder, vector_store as vs
from src.rag.embedder import embed_batch, embed_chunks, validate_vectors
from src.rag.errors import EmbeddingValidationError, RagValidationError
from src.rag.hashing import compute_content_hash
from src.rag.rate_limit import TokenBucket
from tests.rag.helpers import FakeEmbeddingClient, chunk, vec_for


@pytest.fixture
def env(monkeypatch):
    """A fake RagDatabase + mocked store functions. Returns handles to assert on."""
    settings = RagSettings()
    db = SimpleNamespace(settings=settings)
    store = SimpleNamespace(
        existing={}, vectors={},
        replace=AsyncMock(side_effect=lambda db, team, st, sid, rows, keep_count:
                          vs.WriteStats(inserted=len(rows))),
        upsert=AsyncMock(side_effect=lambda db, team, rows: vs.WriteStats(inserted=len(rows))),
    )
    monkeypatch.setattr(vs, "fetch_existing", AsyncMock(side_effect=lambda *a, **k: store.existing))
    monkeypatch.setattr(vs, "fetch_vectors_by_hash", AsyncMock(side_effect=lambda db, t, hashes, m="": {h: store.vectors[h] for h in hashes if h in store.vectors}))
    monkeypatch.setattr(vs, "replace_source_chunks", store.replace)
    monkeypatch.setattr(vs, "upsert", store.upsert)
    return db, store


def existing_row(c, **over):
    row = dict(content_hash=compute_content_hash(c.content), metadata=dict(c.metadata), source_date=c.source_date)
    row.update(over)
    return vs.ExistingRow(**row)


async def test_classification_unchanged_reuse_embed(env):
    db, store = env
    chunks = [chunk(i, f"text number {i}") for i in range(10)]
    for c in chunks[:4]:                                   # 4 already stored, unchanged
        store.existing[("transcript_chunk", "m1", c.chunk_index)] = existing_row(c)
    for c in chunks[4:6]:                                  # 2 reusable from elsewhere in the team
        store.vectors[compute_content_hash(c.content)] = vec_for(c.content)
    client = FakeEmbeddingClient()

    result = await embed_chunks(chunks, client, db)

    assert client.texts_sent == 4                          # only the 4 genuinely new texts
    assert result.unchanged_count == 4 and result.reused_vector_count == 2
    assert result.failed_count == 0 and result.api_calls == 1
    assert result.total_cost.estimated_cost_usd > 0


async def test_identical_rerun_makes_no_calls_and_no_writes(env):
    db, store = env
    chunks = [chunk(i, f"text {i}") for i in range(5)]
    for c in chunks:
        store.existing[("transcript_chunk", "m1", c.chunk_index)] = existing_row(c)
    client = FakeEmbeddingClient()
    result = await embed_chunks(chunks, client, db)
    assert client.calls == [] and result.unchanged_count == 5
    store.replace.assert_not_called()
    store.upsert.assert_not_called()


async def test_metadata_change_rewrites_without_embedding(env):
    db, store = env
    c = chunk(0, "same text", meta={"meeting_id": "m1", "meeting_title": "NEW TITLE"})
    store.existing[("transcript_chunk", "m1", 0)] = existing_row(c, metadata={"meeting_id": "m1", "meeting_title": "old"})
    store.vectors[compute_content_hash(c.content)] = vec_for(c.content)       # its own stored vector
    client = FakeEmbeddingClient()
    result = await embed_chunks([c], client, db)
    assert client.calls == [] and result.reused_vector_count == 1 and store.replace.await_count == 1


async def test_duplicate_text_in_request_embedded_once(env):
    db, _ = env
    chunks = [chunk(0, "Thanks everyone"), chunk(1, "Thanks   everyone "), chunk(2, "unique")]
    client = FakeEmbeddingClient()
    result = await embed_chunks(chunks, client, db)
    assert client.texts_sent == 2                           # the whitespace variant hashes identically
    assert result.reused_vector_count == 1


async def test_partial_batch_failure_isolated(env):
    db, store = env
    db.settings = RagSettings(embedding_batch_size=2)
    texts = [f"distinct text {i}" for i in range(6)]
    poisoned = texts[2]

    def fail_when(batch):
        return AIRateLimitExhaustedError("429 exhausted") if poisoned in batch else None

    client = FakeEmbeddingClient(fail_when=fail_when)
    result = await embed_chunks([chunk(i, t) for i, t in enumerate(texts)], client, db)

    assert result.failed_count == 2                         # exactly the poisoned batch of 2
    assert {f.reason for f in result.failures} == {"rate_limited"}
    persisted = [r for call in store.replace.await_args_list for r in call.args[4]]
    assert len(persisted) == 4                              # the good batches were NOT discarded


async def test_invalid_dimension_persists_nothing(env):
    db, store = env
    client = FakeEmbeddingClient(bad_vector=lambda texts: [[0.1] * 10 for _ in texts])
    result = await embed_chunks([chunk(0, "a"), chunk(1, "b")], client, db)
    assert result.failed_count == 2 and {f.reason for f in result.failures} == {"validation_failed"}
    store.replace.assert_not_called()


async def test_non_retryable_maps_to_invalid_input(env):
    db, _ = env
    client = FakeEmbeddingClient(fail_when=lambda t: AINonRetryableError("400", upstream_status_code=400, upstream_message="bad"))
    result = await embed_chunks([chunk(0, "a")], client, db)
    assert result.failures[0].reason == "invalid_input"


async def test_merge_mode_uses_upsert_and_allows_gaps(env):
    db, store = env
    result = await embed_chunks([chunk(5, "only chunk five")], FakeEmbeddingClient(), db, mode=UpsertMode.MERGE)
    assert result.upserted_count == 1 and store.upsert.await_count == 1 and store.replace.await_count == 0


async def test_replace_deletes_orphans_even_when_nothing_changed(env):
    db, store = env
    c = chunk(0, "kept")
    store.existing[("transcript_chunk", "m1", 0)] = existing_row(c)
    store.existing[("transcript_chunk", "m1", 1)] = existing_row(chunk(1, "stale"))      # beyond new snapshot
    await embed_chunks([c], FakeEmbeddingClient(), db)
    assert store.replace.await_count == 1 and store.replace.await_args.kwargs["keep_count"] == 1


async def test_guards(env):
    db, _ = env
    client = FakeEmbeddingClient()
    with pytest.raises(RagValidationError, match="single team_id"):
        await embed_chunks([chunk(0, "a", team="A"), chunk(1, "b", team="B")], client, db)
    with pytest.raises(RagValidationError, match="duplicate chunk identity"):
        await embed_chunks([chunk(0, "a"), chunk(0, "b")], client, db)
    with pytest.raises(RagValidationError, match="contiguous"):
        await embed_chunks([chunk(0, "a"), chunk(2, "b")], client, db)
    db.settings = RagSettings(max_chunks_per_source=2)
    with pytest.raises(RagValidationError, match="max 2"):
        await embed_chunks([chunk(i, str(i)) for i in range(3)], client, db)
    assert client.calls == []


# ── embed_batch / validation ─────────────────────────────────────────────────


def test_validate_vectors():
    good = [vec_for("a"), vec_for("b")]
    validate_vectors(good, 2)
    with pytest.raises(EmbeddingValidationError, match="expected 2"):
        validate_vectors(good[:1], 2)
    with pytest.raises(EmbeddingValidationError, match="dimension"):
        validate_vectors([[0.1] * 3], 1)
    with pytest.raises(EmbeddingValidationError, match="NaN"):
        validate_vectors([[math.nan] + vec_for("a")[1:]], 1)
    with pytest.raises(EmbeddingValidationError, match="unit length"):
        validate_vectors([[2 * x for x in vec_for("a")]], 1)


async def test_embed_batch_truncates_overlong_input_without_raising():
    settings = RagSettings(embedding_max_input_tokens=32)
    client = FakeEmbeddingClient()
    out = await embed_batch(["word " * 500], client, bucket=TokenBucket(10**6), settings=settings)
    assert len(out.vectors) == 1 and len(client.calls[0][0]) < len("word " * 500)


async def test_query_embedder_caches():
    settings = RagSettings()
    client = FakeEmbeddingClient()
    qe = embedder.QueryEmbedder(client, settings)
    a = await qe.embed_query("what did we decide about billing?")
    b = await qe.embed_query("what did we decide about billing? ")      # normalises to the same key
    assert a == b and client.texts_sent == 1
    with pytest.raises(RagValidationError):
        await qe.embed_query("   ")
