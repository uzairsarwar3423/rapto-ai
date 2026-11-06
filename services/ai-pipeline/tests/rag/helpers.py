"""Shared test helpers for the RAG suite (no network)."""

from __future__ import annotations

import hashlib
from datetime import date
from typing import Any

import numpy as np

from src.models.common import AICallResult, CostRecord, ModelTier, TaskType
from src.models.rag_models import ChunkToEmbed, EmbeddingSource


def vec_for(text: str) -> list[float]:
    """Deterministic unit vector per text — no OpenAI needed."""
    seed = int(hashlib.sha256(text.encode("utf-8")).hexdigest()[:8], 16)
    v = np.random.default_rng(seed).normal(size=1536)
    return (v / np.linalg.norm(v)).tolist()


class FakeEmbeddingClient:
    """Implements EmbeddingClient. Records every call; can fail on demand."""

    def __init__(self, *, fail_when: Any = None, bad_vector: Any = None) -> None:
        self.calls: list[list[str]] = []
        self.fail_when = fail_when        # callable(texts) -> Exception | None
        self.bad_vector = bad_vector      # callable(texts) -> list[list[float]] | None

    @property
    def texts_sent(self) -> int:
        return sum(len(c) for c in self.calls)

    async def generate_embeddings(self, texts, *, model=None, request_id=None, max_attempts=5):
        self.calls.append(list(texts))
        if self.fail_when and (exc := self.fail_when(texts)):
            raise exc
        vectors = (self.bad_vector(texts) if self.bad_vector else None) or [vec_for(t) for t in texts]
        return AICallResult(
            data=vectors,
            cost=CostRecord(input_tokens=10 * len(texts), output_tokens=0, model_tier=ModelTier.EMBED,
                            model_name="text-embedding-3-small", estimated_cost_usd=1e-6 * len(texts)),
            latency_ms=1.0, retry_count=0, task_type=TaskType.EMBEDDING, model_name="text-embedding-3-small",
        )


def chunk(index: int, text: str, *, team: str = "teamA", source: str = "m1",
          kind: EmbeddingSource = EmbeddingSource.TRANSCRIPT_CHUNK,
          meta: dict | None = None, when: date | None = date(2026, 6, 1)) -> ChunkToEmbed:
    return ChunkToEmbed(content=text, source_type=kind, source_id=source, chunk_index=index,
                        team_id=team, source_date=when, metadata=meta if meta is not None else {"meeting_id": source})
