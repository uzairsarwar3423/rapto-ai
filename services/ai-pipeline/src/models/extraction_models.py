from enum import Enum
from typing import Dict, List, Optional, Any, Literal, Union, Tuple
from pydantic import BaseModel, Field, model_validator, field_validator
from datetime import datetime
import logging
from src.models.cleanup_models import CleanedTranscriptTurn, ParticipantInfo
from src.models.common import CostRecord
from src.models.date_models import DateParseResult

logger = logging.getLogger(__name__)

class PriorityLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    URGENT = "URGENT"

class DecisionType(str, Enum):
    TECHNICAL = "TECHNICAL"
    PROCESS = "PROCESS"
    TIMELINE = "TIMELINE"
    SCOPE = "SCOPE"
    RESOURCE = "RESOURCE"
    PRIORITY = "PRIORITY"
    VENDOR = "VENDOR"
    POLICY = "POLICY"
    OTHER = "OTHER"

class SeverityLevel(str, Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"

class RiskCategory(str, Enum):
    TIMELINE = "TIMELINE"
    TECHNICAL = "TECHNICAL"
    RESOURCE = "RESOURCE"
    EXTERNAL = "EXTERNAL"
    SECURITY = "SECURITY"
    QUALITY = "QUALITY"
    BUSINESS = "BUSINESS"

class ExtractedCommitment(BaseModel):
    text: str = Field(..., min_length=5, max_length=1000)
    owner_name: str = Field(..., min_length=1)
    due_date_raw: Optional[str] = None
    confidence: float = Field(..., ge=0.0, le=1.0)

    @model_validator(mode='after')
    def validate_fields(self):
        if not self.text.strip():
            raise ValueError("text cannot be empty or just whitespace")
        if not self.owner_name.strip():
            raise ValueError("owner_name cannot be empty or just whitespace")
        if self.due_date_raw is not None and not self.due_date_raw.strip():
            raise ValueError("due_date_raw cannot be empty or just whitespace")
        return self

class ExtractedActionItem(BaseModel):
    text: str = Field(..., min_length=5, max_length=1000)
    assignee_name: str = Field(..., min_length=1)
    due_date_raw: Optional[str] = None
    priority: PriorityLevel
    confidence: float = Field(..., ge=0.0, le=1.0)
    assigner_name: Optional[str] = None

    @field_validator('priority', mode='before')
    @classmethod
    def normalize_priority(cls, v: Any) -> Any:
        if isinstance(v, str):
            v_norm = v.strip().upper()
            try:
                return PriorityLevel(v_norm)
            except ValueError:
                logger.warning(f"Unrecognized priority string '{v}', defaulting to MEDIUM")
                return PriorityLevel.MEDIUM
        return v

    @model_validator(mode='after')
    def validate_fields(self):
        if not self.text.strip():
            raise ValueError("text cannot be empty or just whitespace")
        if not self.assignee_name.strip():
            raise ValueError("assignee_name cannot be empty or just whitespace")
        if self.due_date_raw is not None and not self.due_date_raw.strip():
            raise ValueError("due_date_raw cannot be empty or just whitespace")
        return self

class ExtractedDecision(BaseModel):
    text: str = Field(..., min_length=1)
    made_by: Optional[str] = None
    decision_type: DecisionType = DecisionType.OTHER
    confidence: float = Field(..., ge=0.0, le=1.0)
    
    @model_validator(mode='after')
    def validate_fields(self):
        if not self.text.strip():
            raise ValueError("text cannot be empty or just whitespace")
        if self.made_by is not None and not self.made_by.strip():
            raise ValueError("made_by cannot be empty or just whitespace")
        return self

class ExtractedBlocker(BaseModel):
    text: str = Field(..., min_length=1)
    blocked_work: str = Field(default="general work", min_length=1)
    affected_name: Optional[str] = None
    blocking_party: Optional[str] = None
    severity: SeverityLevel = SeverityLevel.MEDIUM
    confidence: float = Field(..., ge=0.0, le=1.0)

    @model_validator(mode='after')
    def validate_fields(self):
        if not self.text.strip():
            raise ValueError("text cannot be empty or just whitespace")
        if not self.blocked_work.strip():
            raise ValueError("blocked_work cannot be empty or just whitespace")
        if self.affected_name is not None and not self.affected_name.strip():
            raise ValueError("affected_name cannot be empty or just whitespace")
        if self.blocking_party is not None and not self.blocking_party.strip():
            raise ValueError("blocking_party cannot be empty or just whitespace")
        return self

class ExtractedRisk(BaseModel):
    text: str = Field(..., min_length=1)
    description: str = Field(default="risk item", min_length=1)
    category: RiskCategory = RiskCategory.TECHNICAL
    raised_by: Optional[str] = None
    impact: str = Field(default="medium impact", min_length=1)
    trigger_condition: str = Field(default="unspecified", min_length=1)
    confidence: float = Field(..., ge=0.0, le=1.0)

    @model_validator(mode='after')
    def validate_fields(self):
        if not self.text.strip():
            raise ValueError("text cannot be empty or just whitespace")
        return self

# ─── Structured Summary Model ────────────────────────────────────────────────

class TopicSection(BaseModel):
    """A single topic discussed in the meeting with its bullet-point summary."""
    topic: str = Field(..., min_length=1, description="Topic name / heading")
    bullets: List[str] = Field(default_factory=list, description="Bullet points summarising the topic discussion")


class StructuredSummary(BaseModel):
    """Production-grade structured meeting summary with 6 canonical sections.

    Generated by summary_system.txt (v4.0). Comparable to Fireflies AI,
    Granola, Fathom, and Read AI output quality.
    """
    meeting_purpose: str = Field(
        default="",
        description="1–2 sentence description of the meeting's primary purpose."
    )
    overview: str = Field(
        default="",
        description="2–5 sentence executive summary covering the overall discussion."
    )
    key_takeaways: List[str] = Field(
        default_factory=list,
        description="High-signal insights from the meeting. No action items."
    )
    topics_discussed: List[TopicSection] = Field(
        default_factory=list,
        description="All substantive topics discussed, each with bullet-point context."
    )
    conclusions: List[str] = Field(
        default_factory=list,
        description="Final outcomes and end-state of the meeting."
    )
    decisions: List[str] = Field(
        default_factory=list,
        description="Confirmed decisions only — never suggestions or possibilities."
    )

    @classmethod
    def from_raw(cls, raw: Any) -> "StructuredSummary":
        """Parse from a raw dict (AI JSON output) with graceful fallback."""
        if isinstance(raw, dict):
            return cls.model_validate(raw)
        if isinstance(raw, str):
            import json
            try:
                data = json.loads(raw)
                return cls.model_validate(data)
            except Exception:
                # Legacy plain-text fallback: wrap in overview field
                return cls(overview=raw)
        return cls()


# Wrapper schemas for structured outputs
class CommitmentsResponse(BaseModel):
    commitments: List[ExtractedCommitment] = Field(default_factory=list)

    @field_validator("commitments")
    @classmethod
    def filter_low_confidence_commitments(cls, v: List[ExtractedCommitment]) -> List[ExtractedCommitment]:
        return [c for c in v if c.confidence >= 0.3]

class ActionItemsResponse(BaseModel):
    action_items: List[ExtractedActionItem] = Field(default_factory=list)

class DecisionsResponse(BaseModel):
    decisions: List[ExtractedDecision] = Field(default_factory=list)

class BlockersResponse(BaseModel):
    blockers: List[ExtractedBlocker] = Field(default_factory=list)

class RisksResponse(BaseModel):
    risks: List[ExtractedRisk] = Field(default_factory=list)

class ExtractionResponse(BaseModel):
    commitments: List[ExtractedCommitment] = Field(default_factory=list)
    action_items: List[ExtractedActionItem] = Field(default_factory=list)
    decisions: List[ExtractedDecision] = Field(default_factory=list)
    blockers: List[ExtractedBlocker] = Field(default_factory=list)
    risks: List[ExtractedRisk] = Field(default_factory=list)
    summary: Optional[str] = None

    @field_validator("commitments")
    @classmethod
    def filter_low_confidence_commitments(cls, v: List[ExtractedCommitment]) -> List[ExtractedCommitment]:
        return [c for c in v if c.confidence >= 0.3]

class ConfidenceCalibrationFlag(BaseModel):
    is_suspicious: bool
    reason: Optional[str] = None
    model_stated: float
    heuristic_estimate_range: Tuple[float, float]

class ParsedCommitment(ExtractedCommitment):
    id: Optional[str] = None
    normalized_text: str
    dedup_key: str
    calibration_flag: Optional[ConfidenceCalibrationFlag] = None
    due_date_utc: Optional[datetime] = None
    due_date_resolution: Optional[DateParseResult] = None
    speaker_user_id: Optional[str] = None
    speaker_name: Optional[str] = None
    owner_user_id: Optional[str] = None

class ParsedActionItem(ExtractedActionItem):
    dedup_key: str

class ParsedDecision(ExtractedDecision):
    text_normalized: str

class ParsedBlocker(ExtractedBlocker):
    text_normalized: str
    dedup_key: str

class ParsedRisk(ExtractedRisk):
    text_normalized: str
    dedup_key: str

class ExtractRequest(BaseModel):
    meeting_id: str = Field(..., min_length=1)
    team_id: str = Field(..., min_length=1)
    meeting_date: datetime
    meeting_title: str = Field(..., max_length=500)
    cleaned_transcript: List[CleanedTranscriptTurn] = Field(..., min_length=1)
    participants: List[ParticipantInfo]
    meeting_duration_seconds: float
    team_timezone: str = Field(..., min_length=1)

class ChunkExtractionResult(BaseModel):
    chunk_id: str
    chunk_index: int
    succeeded: bool
    parsed_commitments: Optional[List[ParsedCommitment]] = None
    parsed_action_items: Optional[List[ParsedActionItem]] = None
    parsed_decisions: Optional[List[ParsedDecision]] = None
    parsed_blockers: Optional[List[ParsedBlocker]] = None
    parsed_risks: Optional[List[ParsedRisk]] = None
    summary: Optional[Union[StructuredSummary, str]] = None
    cost: Optional[CostRecord] = None
    error: Optional[str] = None
    is_first_chunk: bool

class SummaryScopeType(str, Enum):
    FULL = "FULL"
    PARTIAL_FIRST_CHUNK = "PARTIAL_FIRST_CHUNK"

class ExtractionResultWithMeta(BaseModel):
    meeting_id: str
    team_id: str
    commitments: List[ParsedCommitment]
    action_items: List[ParsedActionItem]
    decisions: List[ParsedDecision]
    blockers: List[ParsedBlocker]
    risks: List[ParsedRisk]
    summary: Union[StructuredSummary, str]
    summary_scope: SummaryScopeType
    extraction_model: str
    prompt_version: str
    chunks_total: int
    chunks_succeeded: int
    total_cost: CostRecord
    per_chunk_costs: List[Optional[CostRecord]]
    processing_time_ms: float

class PartialExtractionFailure(BaseModel):
    meeting_id: str
    team_id: str
    succeeded_chunks: int
    failed_chunks: int
    total_chunks: int
    partial_result: Optional[ExtractionResultWithMeta] = None
    failed_chunk_indices: List[int]
    error_summary: str

class ExtractResponse(BaseModel):
    success: bool
    request_id: str
    result: Union[ExtractionResultWithMeta, PartialExtractionFailure]
