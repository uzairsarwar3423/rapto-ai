"""
models/rag_models.py
─────────────────────
Pydantic v2 contracts for the RAG write and read paths (Day 56).

API inputs use extra="forbid". IDs are TEXT (Prisma cuid), validated against a
strict charset so they are safe in logs, lock keys and set_config values.
"""

from __future__ import annotations

import json
import math
from datetime import date, datetime
from enum import StrEnum
from typing import Annotated, Any, Literal, Optional
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from src.config.rag_config import (
    EMBEDDING_DIMENSIONS,
    FILTERABLE_METADATA_KEYS,
    SOURCE_TYPES,
)
from src.models.common import CostRecord

IdStr = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_\-]{1,64}$")]
HashStr = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]

MAX_METADATA_BYTES = 8 * 1024


class EmbeddingSource(StrEnum):
    TRANSCRIPT_CHUNK = "transcript_chunk"
    COMMITMENT = "commitment"
    ACTION_ITEM = "action_item"
    DECISION = "decision"
    SUMMARY = "summary"
    DIGEST = "digest"


# Drift guard at import time; a test additionally parses the SQL CHECK constraint.
assert tuple(s.value for s in EmbeddingSource) == SOURCE_TYPES


class UpsertMode(StrEnum):
    REPLACE = "replace"   # chunks are a full snapshot of the source (orphans deleted)
    MERGE = "merge"       # chunks are individual edits (nothing deleted)


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


# ─── Metadata validation ──────────────────────────────────────────────────────

_RESERVED_METADATA_TYPES: dict[str, tuple[type, ...]] = {
    "meeting_id": (str,),
    "speaker_name": (str,),
    "speaker_user_id": (str, type(None)),
    "start_time": (int, float),
    "end_time": (int, float),
    "turn_ids": (list,),
    "commitment_owner_id": (str, type(None)),
    "due_date_utc": (str, type(None)),
}


def validate_metadata(metadata: dict[str, Any]) -> dict[str, Any]:
    """JSON-safe, ≤ 8 KB serialized, reserved keys type-checked."""
    try:
        encoded = json.dumps(metadata, allow_nan=False, sort_keys=True, ensure_ascii=False)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"metadata must be JSON-serialisable (no NaN/Infinity): {exc}") from exc
    if len(encoded.encode("utf-8")) > MAX_METADATA_BYTES:
        raise ValueError(f"metadata exceeds {MAX_METADATA_BYTES} bytes when serialized")
    for key, allowed in _RESERVED_METADATA_TYPES.items():
        if key in metadata:
            value = metadata[key]
            if isinstance(value, bool) or not isinstance(value, allowed):
                raise ValueError(f"metadata.{key} has invalid type {type(value).__name__}")
    if "turn_ids" in metadata and not all(isinstance(t, str) for t in metadata["turn_ids"]):
        raise ValueError("metadata.turn_ids must be a list of strings")
    return metadata


def validate_vector(values: list[float], *, what: str = "embedding") -> list[float]:
    if len(values) != EMBEDDING_DIMENSIONS:
        raise ValueError(f"{what} must have {EMBEDDING_DIMENSIONS} dimensions, got {len(values)}")
    if not all(math.isfinite(v) for v in values):
        raise ValueError(f"{what} contains NaN or Infinity")
    return values


# ─── Write path ───────────────────────────────────────────────────────────────


class ChunkToEmbed(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    content: str = Field(..., min_length=1, max_length=40_000)
    source_type: EmbeddingSource
    source_id: IdStr
    chunk_index: int = Field(..., ge=0, le=32_767)
    team_id: IdStr
    source_date: Optional[date] = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("content")
    @classmethod
    def _strip_content(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("content must not be blank")
        return v

    @field_validator("metadata")
    @classmethod
    def _check_metadata(cls, v: dict[str, Any]) -> dict[str, Any]:
        return validate_metadata(v)


class ChunkInput(BaseModel):
    """API-facing chunk: team_id comes from the request, not each chunk."""

    model_config = ConfigDict(extra="forbid")

    content: str = Field(..., min_length=1, max_length=40_000)
    source_type: EmbeddingSource
    source_id: IdStr
    chunk_index: int = Field(..., ge=0, le=32_767)
    source_date: Optional[date] = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    def to_chunk(self, team_id: str) -> ChunkToEmbed:
        return ChunkToEmbed(team_id=team_id, **self.model_dump())


class EmbeddedChunk(ChunkToEmbed):
    embedding: list[float]
    content_hash: HashStr
    model_name: str
    token_count: int = Field(..., ge=0)
    vector_origin: Literal["api", "reused"]

    @field_validator("embedding")
    @classmethod
    def _check_embedding(cls, v: list[float]) -> list[float]:
        return validate_vector(v)


class ChunkFailure(BaseModel):
    source_type: EmbeddingSource
    source_id: str
    chunk_index: int
    reason: Literal["upstream_error", "invalid_input", "validation_failed", "rate_limited", "timeout"]
    detail: str = ""


class UpsertResult(BaseModel):
    upserted_count: int = 0        # new rows inserted
    updated_count: int = 0         # existing rows whose content/metadata changed
    unchanged_count: int = 0       # nothing to do (diff skip or no-op conflict)
    reused_vector_count: int = 0   # rows written WITHOUT an embedding API call
    deleted_orphans: int = 0
    failed_count: int = 0
    failures: list[ChunkFailure] = Field(default_factory=list)
    total_cost: CostRecord
    api_calls: int = 0
    duration_ms: float = 0.0


class UpsertRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    team_id: IdStr
    mode: UpsertMode = UpsertMode.REPLACE
    chunks: list[ChunkInput] = Field(..., min_length=1)


class DeleteSourceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    team_id: IdStr
    source_type: EmbeddingSource
    source_id: IdStr


class DeleteSourceResponse(BaseModel):
    deleted: int


class BackfillRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    team_id: IdStr
    source_types: list[EmbeddingSource] = Field(..., min_length=1)
    since: Optional[date] = None
    created_by: Optional[str] = Field(default=None, max_length=100)

    @field_validator("source_types")
    @classmethod
    def _dedupe(cls, v: list[EmbeddingSource]) -> list[EmbeddingSource]:
        if EmbeddingSource.DIGEST in v:
            raise ValueError("source_type 'digest' has no backfill source yet")
        return list(dict.fromkeys(v))


class EmbeddingJob(BaseModel):
    id: UUID
    team_id: str
    source_types: list[str]
    since: Optional[date] = None
    status: JobStatus
    cursor: dict[str, Any] = Field(default_factory=dict)
    total_sources: Optional[int] = None
    processed_sources: int = 0
    upserted: int = 0
    reused: int = 0
    skipped: int = 0
    failed: int = 0
    cost_usd: float = 0.0
    error: Optional[str] = None
    created_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    heartbeat_at: Optional[datetime] = None
    created_by: Optional[str] = None


class BackfillAccepted(BaseModel):
    job_id: UUID
    status: JobStatus
    status_url: str


# ─── Read path ────────────────────────────────────────────────────────────────

_ScalarMeta = str | int | float | bool


class VectorSearchQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    team_id: IdStr
    query_embedding: list[float]
    top_k: int = Field(default=20, ge=1, le=100)
    source_types: Optional[list[EmbeddingSource]] = None
    source_ids_filter: Optional[list[IdStr]] = Field(default=None, max_length=500)
    meeting_id: Optional[IdStr] = None
    date_range: Optional[tuple[date, date]] = None
    metadata_filter: Optional[dict[str, _ScalarMeta]] = None
    min_similarity: float = Field(default=0.0, ge=0.0, le=1.0)

    @field_validator("query_embedding")
    @classmethod
    def _check_embedding(cls, v: list[float]) -> list[float]:
        return validate_vector(v, what="query_embedding")

    @field_validator("metadata_filter")
    @classmethod
    def _check_filter(cls, v: Optional[dict[str, _ScalarMeta]]) -> Optional[dict[str, _ScalarMeta]]:
        if v is None:
            return v
        unknown = set(v) - FILTERABLE_METADATA_KEYS
        if unknown:
            raise ValueError(
                f"metadata_filter keys not allowed: {sorted(unknown)}; "
                f"allowed: {sorted(FILTERABLE_METADATA_KEYS)}"
            )
        return v

    @model_validator(mode="after")
    def _check_range(self) -> "VectorSearchQuery":
        if self.date_range and self.date_range[0] > self.date_range[1]:
            raise ValueError("date_range start must be <= end")
        return self

    @property
    def has_filters(self) -> bool:
        return any((
            self.source_types, self.source_ids_filter, self.meeting_id,
            self.date_range, self.metadata_filter,
        ))


class VectorSearchResult(BaseModel):
    id: UUID
    chunk_text: str
    source_type: EmbeddingSource
    source_id: str
    chunk_index: int
    metadata: dict[str, Any]
    source_date: Optional[date] = None
    model_name: str
    similarity_score: float = Field(..., ge=0.0, le=1.0)
    rank: int = Field(..., ge=1)


class SearchStats(BaseModel):
    requested_k: int
    returned_k: int
    underfilled: bool = False
    latency_ms: float = 0.0
