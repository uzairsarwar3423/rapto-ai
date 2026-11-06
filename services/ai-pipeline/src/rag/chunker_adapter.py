"""
rag/chunker_adapter.py — TextChunk → ChunkToEmbed. Pure, no I/O.

The single seam between the Day 48 chunker and RAG. Empty chunks are dropped
BEFORE indexing so chunk_index stays contiguous (replace-mode requires it).
"""

from __future__ import annotations

from datetime import date
from typing import Any, Optional, Sequence

import structlog

from src.models.chunk_models import TextChunk
from src.models.rag_models import ChunkToEmbed, EmbeddingSource
from src.rag.errors import RagValidationError

log = structlog.get_logger(__name__)


def to_chunks_to_embed(
    text_chunks: Sequence[TextChunk],
    *,
    team_id: str,
    source_type: EmbeddingSource,
    source_id: str,
    source_date: Optional[date] = None,
    base_metadata: Optional[dict[str, Any]] = None,
    max_chunks: int = 200,
) -> list[ChunkToEmbed]:
    live = [c for c in text_chunks if c.content and c.content.strip()]
    if len(live) > max_chunks:
        # Raise instead of silently truncating: the caller decides (re-chunk bigger, or split).
        raise RagValidationError(
            f"{source_type.value}/{source_id} produced {len(live)} chunks (max {max_chunks})"
        )
    out: list[ChunkToEmbed] = []
    for position, chunk in enumerate(live):
        metadata: dict[str, Any] = dict(base_metadata or {})
        chunk_meta: dict[str, Any] = {}
        if chunk.source_turn_ids:
            chunk_meta["turn_ids"] = list(chunk.source_turn_ids)
        if chunk.start_time is not None:
            chunk_meta["start_time"] = float(chunk.start_time)
        if chunk.end_time is not None:
            chunk_meta["end_time"] = float(chunk.end_time)
        collisions = sorted(set(metadata) & set(chunk_meta))
        if collisions:
            log.debug("chunk_metadata_overrides_base", keys=collisions)
        metadata.update(chunk_meta)                 # chunk keys win on collision
        out.append(ChunkToEmbed(
            content=chunk.content,
            source_type=source_type,
            source_id=source_id,
            chunk_index=position,                   # re-indexed 0..n-1, contiguous
            team_id=team_id,
            source_date=source_date,
            metadata=metadata,
        ))
    return out
