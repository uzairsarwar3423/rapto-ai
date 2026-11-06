"""
rag/fusion.py — Reciprocal Rank Fusion of the vector and lexical legs (pure, no I/O).

Why RRF (ADR-1): it fuses by RANK, so cosine similarity and ts_rank (incomparable
scales) can be combined with no calibration; a candidate found by both legs
naturally outranks one found by a single leg.

Determinism: every sort has a total order (-fused, -cosine, source_id,
chunk_index), so the output is identical for any input ordering.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Sequence

from src.models.rag_models import ScoredChunk, VectorSearchResult

Key = tuple[str, str, int]


def _key(hit: VectorSearchResult) -> Key:
    return (hit.source_type.value, hit.source_id, hit.chunk_index)


def fuse(
    vector_hits: Sequence[VectorSearchResult],
    lexical_hits: Sequence[VectorSearchResult],
    *,
    rrf_k: int = 60,
    weight_vector: float = 1.0,
    weight_lexical: float = 0.8,
    per_source_cap: int = 4,
    noise_floor: float = 0.0,
    top_k: int = 20,
) -> list[ScoredChunk]:
    """Each leg is a list in rank order (best first); the position is the rank."""
    merged: dict[Key, ScoredChunk] = {}

    for position, hit in enumerate(vector_hits, start=1):
        merged[_key(hit)] = ScoredChunk(
            chunk=hit, cosine_similarity=hit.similarity_score, vector_rank=position,
            fused_score=weight_vector / (rrf_k + position), retrieval_legs="vector",
        )
    for position, hit in enumerate(lexical_hits, start=1):
        key = _key(hit)
        gain = weight_lexical / (rrf_k + position)
        existing = merged.get(key)
        if existing is None:
            merged[key] = ScoredChunk(
                chunk=hit, cosine_similarity=hit.similarity_score, lexical_rank=position,
                fused_score=gain, retrieval_legs="lexical",
            )
        else:
            existing.lexical_rank = position
            existing.fused_score += gain
            existing.retrieval_legs = "both"

    ordered = sorted(
        merged.values(),
        key=lambda c: (-c.fused_score, -c.cosine_similarity, c.chunk.source_id, c.chunk.chunk_index,
                       c.chunk.source_type.value),
    )

    # Noise floor: a weak, purely semantic hit with no lexical support is noise.
    # Anything with a lexical match is exempt.
    ordered = [c for c in ordered if c.retrieval_legs != "vector" or c.cosine_similarity >= noise_floor]

    # Diversity: overlapping chunks of one meeting must not crowd out other meetings.
    taken: defaultdict[tuple[str, str], int] = defaultdict(int)
    capped: list[ScoredChunk] = []
    for candidate in ordered:
        source = (candidate.chunk.source_type.value, candidate.chunk.source_id)
        if taken[source] >= per_source_cap:
            continue
        taken[source] += 1
        capped.append(candidate)
    return capped[:top_k]
