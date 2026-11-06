"""SQL shape, static guarantees, chunker adapter and generate_embeddings."""

from __future__ import annotations

import re
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import openai
import pytest

from src.models.chunk_models import TextChunk
from src.models.common import TaskType
from src.models.exceptions import AINonRetryableError
from src.models.rag_models import EmbeddingSource, VectorSearchQuery
from src.rag import vector_store as vs
from src.rag.chunker_adapter import to_chunks_to_embed
from src.rag.errors import RagValidationError
from src.services.openai_client import OpenAIClient
from tests.rag.helpers import vec_for

RAG_DIR = Path(__file__).resolve().parents[2] / "src" / "rag"


def _query(**kw) -> VectorSearchQuery:
    return VectorSearchQuery(team_id="teamA", query_embedding=vec_for("q"), **kw)


# ── SQL shape ────────────────────────────────────────────────────────────────


def test_search_sql_is_tenant_scoped_parameterised_and_index_friendly():
    from datetime import date

    hostile = "Ali'; DROP TABLE x;--"
    q = _query(source_types=["decision"], meeting_id="m1", date_range=(date(2026, 1, 1), date(2026, 2, 1)),
               source_ids_filter=["s1"], metadata_filter={"speaker_name": hostile}, top_k=7)
    sql, args = vs.build_search_sql(q)

    assert "team_id = $1" in sql and "model_name = $3" in sql
    assert re.search(r"ORDER BY embedding <=> \$2::vector LIMIT \$\d+$", sql)       # raw operator → HNSW usable
    assert "1 -" not in sql.split("ORDER BY")[1]
    for value in ("teamA", "DROP TABLE", "Ali", "s1", "decision", "m1"):
        assert value not in sql                                                       # values are never interpolated
    assert args[0] == "teamA" and args[-1] == 7
    assert any(isinstance(a, dict) and a == {"speaker_name": hostile, "meeting_id": "m1"} for a in args)   # one containment dict
    # placeholders are contiguous 1..N and all used
    used = sorted({int(n) for n in re.findall(r"\$(\d+)", sql)})
    assert used == list(range(1, len(args) + 1))


def test_unfiltered_search_sql_minimal():
    sql, args = vs.build_search_sql(_query())
    assert len(args) == 4 and "metadata @>" not in sql and "source_type" not in sql.split("WHERE")[1].split("ORDER")[0]


def test_every_statement_in_vector_store_carries_team_id():
    for name in ("_UPSERT_SQL", "_DELETE_ORPHANS_SQL", "_DELETE_SOURCE_SQL", "_EXISTING_SQL", "_VECTORS_BY_HASH_SQL"):
        text = getattr(vs, name)
        assert "team_id" in text, name
    assert "team_id = $1" in vs._DELETE_ORPHANS_SQL and "team_id = $1" in vs._EXISTING_SQL


# ── static guarantees ────────────────────────────────────────────────────────


def test_meeting_id_validator_rejects_hostile_ids():
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        _query(meeting_id="m'; DROP TABLE x;--")


def test_pool_acquire_only_in_db_and_tenant_context():
    offenders = []
    for path in RAG_DIR.glob("*.py"):
        if path.name in {"db.py", "tenant_context.py"}:
            continue
        if re.search(r"pool\.acquire\(|pool\.fetch|pool\.execute|pool\.fetchval", path.read_text(encoding="utf-8")):
            offenders.append(path.name)
    # backfill.py legitimately reads the *application* DB through its own read-only source_pool
    assert [o for o in offenders if o != "backfill.py"] == []


def test_rag_never_logs_content_or_vectors():
    banned = re.compile(r"log\.\w+\([^)]*(chunk_text|content=|embedding=|\.content\b)", re.S)
    for path in RAG_DIR.glob("*.py"):
        assert not banned.search(path.read_text(encoding="utf-8")), path.name


def test_no_set_local_with_interpolation():
    for path in RAG_DIR.glob("*.py"):
        assert "SET LOCAL app.current_team_id" not in path.read_text(encoding="utf-8"), path.name


# ── chunker adapter ──────────────────────────────────────────────────────────


def _tc(i, text, **kw):
    return TextChunk(content=text, token_count=5, chunk_index=i, **kw)


def test_adapter_maps_and_reindexes_contiguously():
    chunks = [_tc(0, "first", source_turn_ids=["t1", "t2"], start_time=1.5, end_time=9.0),
              _tc(1, "   "), _tc(2, "third", start_time=10.0)]
    out = to_chunks_to_embed(chunks, team_id="T", source_type=EmbeddingSource.TRANSCRIPT_CHUNK, source_id="m1",
                             base_metadata={"meeting_id": "m1", "start_time": 0.0})
    assert [c.chunk_index for c in out] == [0, 1]                   # blank dropped BEFORE indexing
    assert out[0].metadata == {"meeting_id": "m1", "turn_ids": ["t1", "t2"], "start_time": 1.5, "end_time": 9.0}
    assert out[1].metadata == {"meeting_id": "m1", "start_time": 10.0}      # chunk key wins over base


def test_adapter_raises_instead_of_truncating():
    with pytest.raises(RagValidationError):
        to_chunks_to_embed([_tc(i, f"c{i}") for i in range(5)], team_id="T",
                           source_type=EmbeddingSource.TRANSCRIPT_CHUNK, source_id="m", max_chunks=3)


# ── generate_embeddings ──────────────────────────────────────────────────────


def _resp(order, texts):
    data = [SimpleNamespace(index=i, embedding=vec_for(texts[i])) for i in order]
    return SimpleNamespace(data=data, usage=SimpleNamespace(prompt_tokens=123))


def _api_error(cls, status, headers=None):
    request = httpx.Request("POST", "https://api.openai.com/v1/embeddings")
    return cls("boom", response=httpx.Response(status, headers=headers or {}, request=request), body=None)


@pytest.fixture
def client(test_settings):
    return OpenAIClient(test_settings)


async def test_generate_embeddings_restores_order_and_costs(client):
    texts = ["a", "b", "c"]
    client._client.embeddings.create = AsyncMock(return_value=_resp([2, 0, 1], texts))   # shuffled by the API
    out = await client.generate_embeddings(texts)
    assert out.data == [vec_for("a"), vec_for("b"), vec_for("c")]
    assert out.cost.input_tokens == 123 and out.cost.estimated_cost_usd == pytest.approx(123 * 0.02 / 1e6)
    assert out.task_type == TaskType.EMBEDDING


async def test_generate_embeddings_retries_429_honouring_retry_after(client):
    texts = ["a"]
    create = AsyncMock(side_effect=[_api_error(openai.RateLimitError, 429, {"retry-after": "0"}), _resp([0], texts)])
    client._client.embeddings.create = create
    out = await client.generate_embeddings(texts)
    assert create.await_count == 2 and out.retry_count == 1


async def test_generate_embeddings_never_retries_400(client):
    create = AsyncMock(side_effect=_api_error(openai.BadRequestError, 400))
    client._client.embeddings.create = create
    with pytest.raises(AINonRetryableError):
        await client.generate_embeddings(["a"])
    assert create.await_count == 1


async def test_generate_embeddings_rejects_count_mismatch(client):
    client._client.embeddings.create = AsyncMock(return_value=_resp([0], ["a", "b"]))
    with pytest.raises(AINonRetryableError, match="mismatch"):
        await client.generate_embeddings(["a", "b"])
