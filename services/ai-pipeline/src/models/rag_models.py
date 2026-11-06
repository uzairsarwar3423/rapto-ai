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


class SearchFilterFields(BaseModel):
    """Filters shared by BOTH retrieval legs. One definition → one SQL builder →
    the vector and lexical legs can never filter differently (tenant-safety property)."""

    model_config = ConfigDict(extra="forbid")

    source_types: Optional[list[EmbeddingSource]] = None
    source_ids_filter: Optional[list[IdStr]] = Field(default=None, max_length=500)
    meeting_id: Optional[IdStr] = None
    meeting_ids: Optional[list[IdStr]] = Field(default=None, max_length=500)
    date_range: Optional[tuple[date, date]] = None
    metadata_filter: Optional[dict[str, _ScalarMeta]] = None

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
    def _check_range(self) -> "SearchFilterFields":
        if self.date_range and self.date_range[0] > self.date_range[1]:
            raise ValueError("date_range start must be <= end")
        return self

    @property
    def has_filters(self) -> bool:
        return any((
            self.source_types, self.source_ids_filter, self.meeting_id, self.meeting_ids is not None,
            self.date_range, self.metadata_filter,
        ))


class VectorSearchQuery(SearchFilterFields):
    team_id: IdStr
    query_embedding: list[float]
    top_k: int = Field(default=20, ge=1, le=100)
    min_similarity: float = Field(default=0.0, ge=0.0, le=1.0)

    @field_validator("query_embedding")
    @classmethod
    def _check_embedding(cls, v: list[float]) -> list[float]:
        return validate_vector(v, what="query_embedding")


_TOKEN = r"^[\w]{1,64}$"


class LexicalSearchQuery(SearchFilterFields):
    """Full-text leg. `tokens` are ALREADY sanitised (letters/digits/underscore only)."""

    team_id: IdStr
    query_embedding: list[float]          # so rows can return their exact cosine similarity
    tokens: list[Annotated[str, StringConstraints(pattern=_TOKEN)]] = Field(..., min_length=1, max_length=64)
    top_k: int = Field(default=30, ge=1, le=100)
    rank_normalization: int = Field(default=1, ge=0, le=63)

    @field_validator("query_embedding")
    @classmethod
    def _check_embedding(cls, v: list[float]) -> list[float]:
        return validate_vector(v, what="query_embedding")


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


# ═══════════════════════════════════════════════════════════════════════════════
# Day 57 — retrieval, re-ranking and citations
# ═══════════════════════════════════════════════════════════════════════════════

from src.config.rag_config import RerankerStrategy, RetrievalMode  # noqa: E402  (re-exported)

__all_day57__ = ("RerankerStrategy", "RetrievalMode")


class AccessScope(BaseModel):
    """Q1 hook (within-team access control). Default = whole team (today's behaviour).

    kind="meetings" restricts retrieval to a pre-computed set of meeting ids the
    caller may see (SQL-layer filtering; post-filtering in the app is rejected
    because it under-fills results and is weaker)."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    kind: Literal["team", "meetings"] = "team"
    meeting_ids: Optional[list[IdStr]] = Field(default=None, max_length=5_000)

    @model_validator(mode="after")
    def _check(self) -> "AccessScope":
        if self.kind == "meetings" and self.meeting_ids is None:
            raise ValueError("access_scope.kind='meetings' requires meeting_ids")
        return self


class RetrievalProfile(BaseModel):
    """Day 58 amendment (plan §3.3): per-intent retrieval knobs, so chat does not need a second retriever.
    None = use the configured default (RagSettings.similarity_top_k / rerank_top_n)."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    candidate_count: Optional[int] = Field(default=None, ge=1, le=100)
    top_n: Optional[int] = Field(default=None, ge=1, le=30)


class RetrievalFilters(BaseModel):
    """What the Day 58 intent router resolves from the question."""

    model_config = ConfigDict(extra="forbid")

    source_types: Optional[list[EmbeddingSource]] = Field(default=None, max_length=len(EmbeddingSource))
    date_range: Optional[tuple[date, date]] = None          # inclusive, in the TEAM's timezone
    meeting_ids: Optional[list[IdStr]] = Field(default=None, max_length=500)
    metadata_filter: Optional[dict[str, _ScalarMeta]] = None
    access_scope: AccessScope = Field(default_factory=AccessScope)

    @property
    def effective_meeting_ids(self) -> Optional[list[str]]:
        """Requested ids ∩ access scope. None = unrestricted; [] = nothing is allowed."""
        requested = None if self.meeting_ids is None else set(self.meeting_ids)
        allowed = set(self.access_scope.meeting_ids or []) if self.access_scope.kind == "meetings" else None
        if requested is None and allowed is None:
            return None
        if requested is None:
            return sorted(allowed or [])
        if allowed is None:
            return sorted(requested)
        return sorted(requested & allowed)

    def shared_fields(self) -> dict[str, Any]:
        """The ONE conversion both legs use (parity is tested)."""
        return {
            "source_types": self.source_types,
            "date_range": self.date_range,
            "meeting_ids": self.effective_meeting_ids,
            "metadata_filter": self.metadata_filter,
        }


class ScoredChunk(BaseModel):
    """A candidate. SEPARATE score fields on purpose: after fusion no single score
    means 'similarity'. Threshold on rerank_grade or cosine_similarity, NEVER fused_score."""

    chunk: VectorSearchResult
    cosine_similarity: float = Field(..., ge=0.0, le=1.0)    # raw, from the vector space
    vector_rank: Optional[int] = None
    lexical_rank: Optional[int] = None
    fused_score: float = 0.0
    retrieval_legs: Literal["vector", "lexical", "both"] = "vector"
    rerank_grade: Optional[int] = Field(default=None, ge=0, le=3)
    final_rank: Optional[int] = None

    @property
    def key(self) -> tuple[str, str, int]:
        return (self.chunk.source_type.value, self.chunk.source_id, self.chunk.chunk_index)


class SourceContext(BaseModel):
    meetings: dict[str, "MeetingInfo"] = Field(default_factory=dict)
    users: dict[str, str] = Field(default_factory=dict)
    unresolved_meetings: set[str] = Field(default_factory=set)
    stale: bool = False


class MeetingInfo(BaseModel):
    title: Optional[str] = None
    meeting_date: Optional[date] = None          # a DATE in the team's timezone, never a naive datetime
    status: Optional[str] = None


SourceContext.model_rebuild()


class RerankedItem(BaseModel):
    index: int
    relevance: int       # clamped to 0-3 during validation; no schema bounds (OpenAI strict mode)


class RerankModelOutput(BaseModel):
    """The structured output the grader must return (indices and grades only)."""

    ranking: list[RerankedItem] = Field(default_factory=list)


class RerankCandidate(BaseModel):
    index: int
    header: str
    text: str


class RerankRequest(BaseModel):
    query: str
    candidates: list[RerankCandidate]
    now: datetime
    timezone: str
    top_n: int


class RerankResult(BaseModel):
    ordered_indices: list[int]                       # into the candidate list, best first, post-cut
    grades: dict[int, int] = Field(default_factory=dict)
    strategy_used: RerankerStrategy
    degraded: bool = False
    degrade_reason: Optional[str] = None
    skipped_reason: Optional[str] = None             # skipped is NOT degraded (e.g. too few candidates)
    repaired: bool = False
    prompt_version: Optional[str] = None
    prompt_hash: Optional[str] = None
    cost: CostRecord
    latency_ms: float = 0.0


class Citation(BaseModel):
    citation_id: int = Field(..., ge=1)               # stable ordinal for [n] markers
    embedding_id: UUID
    source_type: EmbeddingSource
    source_id: str
    chunk_index: int
    meeting_id: Optional[str] = None
    meeting_title: Optional[str] = None
    meeting_date: Optional[date] = None
    speaker_name: Optional[str] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    commitment_owner_name: Optional[str] = None
    due_date: Optional[date] = None
    preview: str = ""                                 # PLAIN TEXT: the UI must escape it
    relevance_grade: Optional[int] = None
    stale: bool = False


class RetrievalPipelineResult(BaseModel):
    query_hash: str
    retrieval_mode: RetrievalMode
    candidates: list[ScoredChunk] = Field(default_factory=list)      # after fusion
    reranked: list[ScoredChunk] = Field(default_factory=list)        # final order, <= RERANK_TOP_N
    citations: list[Citation] = Field(default_factory=list)          # citations[i] <-> reranked[i]
    stage_timings_ms: dict[str, float] = Field(default_factory=dict)
    degraded: bool = False
    degrade_reasons: list[str] = Field(default_factory=list)
    retrieval_confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    no_relevant_context: bool = True
    reranker_prompt_version: Optional[str] = None
    embedding_cost: CostRecord
    reranking_cost: CostRecord
