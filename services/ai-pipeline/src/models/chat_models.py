"""
models/chat_models.py
─────────────────────
Day 58 contracts: requests, SSE events (protocol v1), enums, session/feedback models.

THE EVENT UNION IS THE CONTRACT. `encode_event` accepts only a member of the union,
so an event outside the protocol cannot be serialized. Clients must ignore unknown
events/fields (forward compatibility); the server never emits them.
"""

from __future__ import annotations

import json
import uuid
from datetime import date, datetime
from enum import StrEnum
from typing import Annotated, Any, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, TypeAdapter, model_validator

from src.config.chat_config import SSE_PROTOCOL_VERSION

IdStr = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_\-]{1,64}$")]
MAX_FILTER_IDS = 50
MAX_DATE_SPAN_DAYS = 3 * 366


# ─── Enums ────────────────────────────────────────────────────────────────────

class Intent(StrEnum):
    LOOKUP = "LOOKUP"
    SUMMARY = "SUMMARY"
    TEMPORAL = "TEMPORAL"
    COMMITMENT_STATUS = "COMMITMENT_STATUS"
    ANALYTICS = "ANALYTICS"
    CHITCHAT = "CHITCHAT"
    OUT_OF_SCOPE = "OUT_OF_SCOPE"


class FinishReason(StrEnum):
    """`done` may carry stop/no_results/cancelled/length/filtered. `error` is persisted only."""
    STOP = "stop"
    NO_RESULTS = "no_results"
    CANCELLED = "cancelled"
    LENGTH = "length"
    FILTERED = "filtered"
    ERROR = "error"


class ErrorCode(StrEnum):
    # in-stream
    MODEL_UNAVAILABLE = "MODEL_UNAVAILABLE"
    TIMEOUT = "TIMEOUT"
    CONTENT_FILTERED = "CONTENT_FILTERED"
    INTERNAL = "INTERNAL"


class MessageStatus(StrEnum):
    ACCEPTED = "accepted"
    ANSWERED = "answered"
    FAILED = "failed"
    CANCELLED = "cancelled"


class AccessScopeMode(StrEnum):
    TEAM_WIDE = "team_wide"
    ATTENDEE_ONLY = "attendee_only"


class Role(StrEnum):
    OWNER = "OWNER"
    ADMIN = "ADMIN"
    MANAGER = "MANAGER"
    MEMBER = "MEMBER"
    VIEWER = "VIEWER"


# ─── Auth claims ──────────────────────────────────────────────────────────────

class ChatClaims(BaseModel):
    """Identity comes ONLY from the verified service JWT, never from a request body."""
    model_config = ConfigDict(frozen=True, extra="forbid")

    team_id: IdStr
    user_id: IdStr
    role: str = Field(..., min_length=1, max_length=32)
    plan: str = Field(..., min_length=1, max_length=32)
    tz: str = Field(..., min_length=1, max_length=64)
    request_id: Optional[str] = Field(default=None, max_length=128)


# ─── Request ──────────────────────────────────────────────────────────────────

class ChatFilters(BaseModel):
    model_config = ConfigDict(extra="forbid")

    meeting_ids: list[IdStr] = Field(default_factory=list, max_length=MAX_FILTER_IDS)
    speaker_ids: list[IdStr] = Field(default_factory=list, max_length=MAX_FILTER_IDS)
    date_from: Optional[date] = None
    date_to: Optional[date] = None

    @model_validator(mode="after")
    def _dates(self) -> "ChatFilters":
        if self.date_from and self.date_to:
            if self.date_from > self.date_to:
                raise ValueError("date_from must be <= date_to")
            if (self.date_to - self.date_from).days > MAX_DATE_SPAN_DAYS:
                raise ValueError("date range too large")
        return self


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: Optional[uuid.UUID] = None
    message: str = Field(..., min_length=1, max_length=2_000)
    filters: ChatFilters = Field(default_factory=ChatFilters)
    client_message_id: uuid.UUID


# ─── Sources ──────────────────────────────────────────────────────────────────

class SourceItem(BaseModel):
    """One element of the `sources` event. RAG sources carry meeting/speaker fields;
    analytics sources carry `tool`, `params` and `as_of` instead."""
    model_config = ConfigDict(extra="forbid")

    source_id: str = Field(..., pattern=r"^S[1-9][0-9]{0,2}$")
    type: Literal["transcript_chunk", "commitment", "action_item", "decision", "summary", "digest", "analytics"]
    meeting_id: Optional[str] = None
    meeting_title: Optional[str] = None
    commitment_id: Optional[str] = None
    speaker: Optional[str] = None
    start_ms: Optional[int] = None
    end_ms: Optional[int] = None
    occurred_at: Optional[str] = None
    preview: str = ""
    # analytics-only
    tool: Optional[str] = None
    params: Optional[dict[str, Any]] = None
    as_of: Optional[str] = None
    redacted: bool = False


# ─── SSE events (protocol v1) ─────────────────────────────────────────────────

class _Event(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    v: Literal[1] = SSE_PROTOCOL_VERSION  # type: ignore[assignment]


class MetaEvent(_Event):
    event: Literal["meta"] = "meta"
    request_id: str
    session_id: str
    message_id: str
    replayed: bool = False


class StatusEvent(_Event):
    event: Literal["status"] = "status"
    stage: Literal["rewriting", "searching", "reading", "answering"]
    detail: Optional[dict[str, Any]] = None


class SourcesEvent(_Event):
    event: Literal["sources"] = "sources"
    sources: list[SourceItem]


class TokenEvent(_Event):
    event: Literal["token"] = "token"
    t: str


class CitationsEvent(_Event):
    event: Literal["citations"] = "citations"
    valid: list[str] = Field(default_factory=list)
    removed: list[str] = Field(default_factory=list)
    grounded: bool = True
    flags: list[str] = Field(default_factory=list)


class UsageEvent(_Event):
    """No `cost_usd`: dollars are never shown to end users (Q7)."""
    event: Literal["usage"] = "usage"
    input_tokens: int = Field(..., ge=0)
    output_tokens: int = Field(..., ge=0)
    quota_remaining: Optional[int] = None


class DoneEvent(_Event):
    event: Literal["done"] = "done"
    finish_reason: Literal["stop", "no_results", "cancelled", "length", "filtered"]


class ErrorEvent(_Event):
    event: Literal["error"] = "error"
    code: Literal["MODEL_UNAVAILABLE", "TIMEOUT", "CONTENT_FILTERED", "INTERNAL"]
    message: str
    retryable: bool = False


SSEEvent = Annotated[
    Union[MetaEvent, StatusEvent, SourcesEvent, TokenEvent, CitationsEvent, UsageEvent, DoneEvent, ErrorEvent],
    Field(discriminator="event"),
]
SSE_EVENT_ADAPTER: TypeAdapter[Any] = TypeAdapter(SSEEvent)
EVENT_NAMES: frozenset[str] = frozenset({"meta", "status", "sources", "token", "citations", "usage", "done", "error"})
_EVENT_MODELS: dict[str, Any] = {"meta": MetaEvent, "status": StatusEvent, "sources": SourcesEvent, "token": TokenEvent,
                                 "citations": CitationsEvent, "usage": UsageEvent, "done": DoneEvent, "error": ErrorEvent}
TERMINAL_EVENTS: frozenset[str] = frozenset({"done", "error"})

HEARTBEAT_FRAME: bytes = b": ping\n\n"


def encode_event(event: Any) -> bytes:
    """Serialize an event for the wire. The type check is the guard: only union members pass."""
    if not isinstance(event, (MetaEvent, StatusEvent, SourcesEvent, TokenEvent, CitationsEvent,
                              UsageEvent, DoneEvent, ErrorEvent)):
        raise TypeError(f"not an SSE protocol v1 event: {type(event).__name__}")
    payload = event.model_dump(mode="json", exclude={"event"}, exclude_none=False)
    data = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return f"event: {event.event}\ndata: {data}\n\n".encode("utf-8")


def decode_event(name: str, data: str) -> Any:
    """Reference-client parse: unknown event names return None (ignored, forward compatible)."""
    if name not in EVENT_NAMES:
        return None
    model = _EVENT_MODELS[name]
    obj = {k: v for k, v in json.loads(data).items() if k in model.model_fields}      # unknown FIELDS are ignored too
    obj["event"] = name
    return SSE_EVENT_ADAPTER.validate_python(obj)


# ─── Sessions / messages / feedback ───────────────────────────────────────────

class SessionOut(BaseModel):
    id: str
    title: str
    message_count: int = 0
    created_at: datetime
    updated_at: datetime


class SessionList(BaseModel):
    items: list[SessionOut]
    next_cursor: Optional[str] = None


class MessageOut(BaseModel):
    id: str
    role: Literal["user", "assistant"]
    content: str
    status: str
    finish_reason: Optional[str] = None
    intent: Optional[str] = None
    sources: list[SourceItem] = Field(default_factory=list)
    created_at: datetime
    reply_to: Optional[str] = None
    feedback: Optional[str] = None


class MessageList(BaseModel):
    """`items` are chronological (oldest → newest) within a page. `next_cursor` pages toward OLDER messages."""
    items: list[MessageOut]
    next_cursor: Optional[str] = None


class RenameRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(..., min_length=1, max_length=120)


class FeedbackRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rating: Literal["up", "down"]
    reason: Optional[Literal["inaccurate", "irrelevant", "incomplete", "unsafe", "other"]] = None
    comment: Optional[str] = Field(default=None, max_length=1_000)


class SuggestionList(BaseModel):
    items: list[str]
