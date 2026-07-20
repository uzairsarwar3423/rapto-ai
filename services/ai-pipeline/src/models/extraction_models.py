from enum import Enum
from typing import List, Optional, Any, Literal, Union, Tuple
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
    decision_type: DecisionType
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
    blocked_work: str = Field(..., min_length=1)
    affected_name: Optional[str] = None
    blocking_party: Optional[str] = None
    severity: SeverityLevel
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
    description: str = Field(..., min_length=1)
    category: RiskCategory
    raised_by: Optional[str] = None
    impact: str = Field(..., min_length=1)
    trigger_condition: str = Field(..., min_length=1)
    confidence: float = Field(..., ge=0.0, le=1.0)

    @model_validator(mode='after')
    def validate_fields(self):
        if not self.text.strip():
            raise ValueError("text cannot be empty or just whitespace")
        return self

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
    summary: Optional[str] = None
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
    summary: str
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
