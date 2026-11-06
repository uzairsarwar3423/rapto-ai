"""Pure functions: hashing, truncation, batching, token bucket, models, SQL parity."""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from pydantic import ValidationError

from src.config.rag_config import RagSettings, SOURCE_TYPES
from src.models.rag_models import (
    BackfillRequest,
    ChunkInput,
    ChunkToEmbed,
    EmbeddedChunk,
    EmbeddingSource,
    VectorSearchQuery,
)
from src.rag.batching import build_batches, count_tokens, truncate_to_tokens
from src.rag.hashing import compute_content_hash, normalize_text
from src.rag.rate_limit import TokenBucket
from tests.rag.helpers import vec_for

ROOT = Path(__file__).resolve().parents[2]

# ── hashing ──────────────────────────────────────────────────────────────────


def test_hash_is_deterministic_and_normalisation_invariant():
    a = compute_content_hash("Hello   world\n")
    assert a == compute_content_hash("  Hello world")
    assert a == compute_content_hash("Hello world")
    assert re.fullmatch(r"[0-9a-f]{64}", a)
    # NFC vs NFD of "é"
    assert compute_content_hash("café") == compute_content_hash("café")


def test_hash_is_case_and_model_sensitive():
    assert compute_content_hash("Hello") != compute_content_hash("hello")
    assert compute_content_hash("x", "text-embedding-3-small") != compute_content_hash("x", "text-embedding-3-large")


def test_hash_is_stable_across_processes():
    code = "from src.rag.hashing import compute_content_hash as h; print(h('stable text'))"
    out = [subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, cwd=ROOT,
                          env={"PYTHONPATH": str(ROOT), "PATH": ""}, timeout=60).stdout.strip() for _ in range(2)]
    assert out[0] == out[1] == compute_content_hash("stable text")


# ── truncation ───────────────────────────────────────────────────────────────


def test_truncation_noop_under_limit():
    assert truncate_to_tokens("short text", 100) == ("short text", False, count_tokens("short text"))


@pytest.mark.parametrize("text", [
    "Alpha beta gamma. " * 200,
    "word " * 500,
    "پہلی بات یہ ہے۔ دوسری بات یہ ہے۔ " * 120,          # Urdu
    "Roman urdu hai yeh mera kaam kal tak ho jayega. " * 100,
    "launch 🚀🚀🚀 done ✅ " * 150,                          # emoji (multi-byte)
])
def test_truncation_respects_limit_and_never_splits_words(text):
    out, truncated, original = truncate_to_tokens(text, 64)
    assert truncated and original > 64
    assert count_tokens(out) <= 64
    assert text.startswith(out)                       # a clean prefix, no mangling
    assert text[len(out):len(out) + 1] in {"", " ", "\n", "۔"} or out[-1] in ".!?۔؟"
    assert "�" not in out


def test_truncation_prefers_sentence_boundary_in_last_window():
    text = ("This is one sentence. " * 40).strip()
    out, _, _ = truncate_to_tokens(text, 50)
    assert out.endswith(".")


def test_truncation_rejects_bad_limit():
    with pytest.raises(ValueError):
        truncate_to_tokens("x", 0)


# ── batching ─────────────────────────────────────────────────────────────────


def test_build_batches_respects_both_limits():
    assert build_batches([10, 10, 10, 10], max_items=3, max_tokens=1000) == [[0, 1, 2], [3]]
    assert build_batches([60, 60, 60], max_items=100, max_tokens=100) == [[0], [1], [2]]
    assert build_batches([], 10, 10) == []


def test_build_batches_rejects_oversized_item():
    with pytest.raises(ValueError):
        build_batches([5, 500], max_items=10, max_tokens=100)


@settings(max_examples=200, deadline=None)
@given(st.lists(st.integers(min_value=0, max_value=500), max_size=80),
       st.integers(min_value=1, max_value=20), st.integers(min_value=500, max_value=2000))
def test_build_batches_property(tokens, max_items, max_tokens):
    batches = build_batches(tokens, max_items, max_tokens)
    assert [i for b in batches for i in b] == list(range(len(tokens)))      # order preserved, lossless
    for b in batches:
        assert b and len(b) <= max_items and sum(tokens[i] for i in b) <= max_tokens


# ── token bucket ─────────────────────────────────────────────────────────────


async def test_token_bucket_waits_for_refill():
    now = [0.0]
    slept: list[float] = []

    async def fake_sleep(d: float) -> None:
        slept.append(d)
        now[0] += d

    bucket = TokenBucket(6_000, clock=lambda: now[0], sleep=fake_sleep)     # 100 tokens/s, burst 6000
    assert await bucket.acquire(6_000) == 0
    waited = await bucket.acquire(1_000)
    assert waited == pytest.approx(10.0) and sum(slept) == pytest.approx(10.0)


async def test_token_bucket_clamps_oversized_request():
    bucket = TokenBucket(600, clock=lambda: 0.0, sleep=lambda d: None)      # type: ignore[arg-type]
    assert await bucket.acquire(10_000) == 0          # clamped to capacity, no deadlock


# ── models ───────────────────────────────────────────────────────────────────


def _base(**kw):
    d = dict(content="hello", source_type="transcript_chunk", source_id="m1", chunk_index=0, team_id="t1")
    d.update(kw)
    return d


@pytest.mark.parametrize("override", [
    {"chunk_index": -1}, {"source_type": "email"}, {"content": "   "}, {"team_id": "bad id!"},
    {"source_id": ""}, {"metadata": {"x": float("nan")}}, {"metadata": {"blob": "x" * 9000}},
    {"metadata": {"start_time": "soon"}}, {"metadata": {"turn_ids": [1, 2]}}, {"unknown": 1},
])
def test_chunk_validation_rejects(override):
    with pytest.raises(ValidationError):
        ChunkToEmbed(**_base(**override))


def test_chunk_input_has_no_team_and_converts():
    c = ChunkInput(content=" hi ", source_type="decision", source_id="d1", chunk_index=0).to_chunk("teamX")
    assert c.team_id == "teamX" and c.content == "hi"


def test_embedded_chunk_vector_validation():
    ok = dict(_base(), embedding=vec_for("a"), content_hash="a" * 64, model_name="m", token_count=1, vector_origin="api")
    EmbeddedChunk(**ok)
    for bad in (vec_for("a")[:-1], [float("nan")] + vec_for("a")[1:], vec_for("a") + [0.0]):
        with pytest.raises(ValidationError):
            EmbeddedChunk(**{**ok, "embedding": bad})


def test_search_query_validation():
    emb = vec_for("q")
    VectorSearchQuery(team_id="t", query_embedding=emb, metadata_filter={"meeting_id": "m1"})
    with pytest.raises(ValidationError):
        VectorSearchQuery(team_id="t", query_embedding=emb[:10])
    with pytest.raises(ValidationError):
        VectorSearchQuery(team_id="t", query_embedding=emb, metadata_filter={"password": "x"})   # not allow-listed
    from datetime import date
    with pytest.raises(ValidationError):
        VectorSearchQuery(team_id="t", query_embedding=emb, date_range=(date(2026, 2, 1), date(2026, 1, 1)))
    with pytest.raises(ValidationError):
        VectorSearchQuery(team_id="t", query_embedding=emb, top_k=101)


def test_backfill_rejects_digest_and_dedupes():
    with pytest.raises(ValidationError):
        BackfillRequest(team_id="t", source_types=["digest"])
    assert BackfillRequest(team_id="t", source_types=["commitment", "commitment"]).source_types == [EmbeddingSource.COMMITMENT]


def test_enum_matches_sql_check_constraint():
    sql = (ROOT / "migrations" / "001_pgvector_embeddings_table.up.sql").read_text(encoding="utf-8")
    body = re.search(r"source_type IN \(([^)]*)\)", sql).group(1)
    in_sql = tuple(re.findall(r"'([a-z_]+)'", body))
    assert in_sql == SOURCE_TYPES == tuple(s.value for s in EmbeddingSource)


# ── settings ─────────────────────────────────────────────────────────────────


def test_rag_settings_cross_field_validation():
    assert RagSettings().rag_enabled is False          # opt-in by default
    with pytest.raises(ValidationError):
        RagSettings(hnsw_ef_search=10, similarity_top_k=20)
    with pytest.raises(ValidationError):
        RagSettings(rerank_top_n=30, similarity_top_k=20)
    with pytest.raises(ValidationError):
        RagSettings(rag_enabled=True)                   # needs RAG_DATABASE_URL
    with pytest.raises(ValidationError):
        RagSettings(embedding_max_input_tokens=8000, embedding_batch_max_tokens=2000)
