"""
rag/citation_builder.py — PURE, synchronous mapping chunk + SourceContext → Citation.

All I/O happens earlier (source_context.py), so this module cannot cause an N+1
by construction. Invariant (tested): citations[i] corresponds to reranked[i].

SECURITY: `preview` is untrusted transcript text, returned as PLAIN TEXT with
control and bidi-override characters stripped. The UI MUST escape / render it as text.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Optional, Sequence
from zoneinfo import ZoneInfo

from src.models.rag_models import Citation, EmbeddingSource, ScoredChunk, SourceContext
from src.rag.text_utils import preview as make_preview


def meeting_id_of(chunk_source_type: EmbeddingSource, source_id: str, metadata: dict[str, Any]) -> Optional[str]:
    """Transcript chunks and summaries are keyed by the meeting itself; derived rows
    (commitment, decision, action item) carry it in metadata."""
    value = metadata.get("meeting_id")
    if isinstance(value, str) and value:
        return value
    if chunk_source_type in (EmbeddingSource.TRANSCRIPT_CHUNK, EmbeddingSource.SUMMARY):
        return source_id
    return None


def _as_float(value: Any) -> Optional[float]:
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def _due_date(value: Any, tz_name: str) -> Optional[date]:
    if not isinstance(value, str) or not value:
        return None
    try:
        moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    try:
        return moment.astimezone(ZoneInfo(tz_name)).date()
    except Exception:  # noqa: BLE001 — unknown tz → UTC date
        return moment.astimezone(timezone.utc).date()


def build_citations(
    reranked: Sequence[ScoredChunk],
    context: SourceContext,
    *,
    preview_chars: int = 150,
    timezone_name: str = "UTC",
) -> list[Citation]:
    citations: list[Citation] = []
    for ordinal, scored in enumerate(reranked, start=1):
        chunk = scored.chunk
        meta = chunk.metadata
        meeting_id = meeting_id_of(chunk.source_type, chunk.source_id, meta)
        info = context.meetings.get(meeting_id) if meeting_id else None

        speaker = meta.get("speaker_name") if isinstance(meta.get("speaker_name"), str) else None
        if speaker is None and isinstance(meta.get("speaker_user_id"), str):
            speaker = context.users.get(meta["speaker_user_id"])

        owner_name = None
        due = None
        if chunk.source_type is EmbeddingSource.COMMITMENT:
            owner_id = meta.get("commitment_owner_id")
            owner_name = context.users.get(owner_id) if isinstance(owner_id, str) else None
            due = _due_date(meta.get("due_date_utc"), timezone_name)

        title = info.title if info and info.title else (
            meta.get("meeting_title") if isinstance(meta.get("meeting_title"), str) else None)
        meeting_date = (info.meeting_date if info and info.meeting_date else chunk.source_date)

        citations.append(Citation(
            citation_id=ordinal,
            embedding_id=chunk.id,
            source_type=chunk.source_type,
            source_id=chunk.source_id,
            chunk_index=chunk.chunk_index,
            meeting_id=meeting_id,
            meeting_title=title,
            meeting_date=meeting_date,
            speaker_name=speaker,
            start_time=_as_float(meta.get("start_time")),
            end_time=_as_float(meta.get("end_time")),
            commitment_owner_name=owner_name,
            due_date=due,
            preview=make_preview(chunk.chunk_text, preview_chars),
            relevance_grade=scored.rerank_grade,
            stale=context.stale,
        ))
    return citations
