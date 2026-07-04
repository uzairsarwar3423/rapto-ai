from enum import Enum
from typing import Optional, Literal
from datetime import datetime
from pydantic import BaseModel, Field, field_validator, model_validator
import pytz

class DateResolutionStatus(str, Enum):
    RESOLVED = "RESOLVED"
    AMBIGUOUS = "AMBIGUOUS"
    SPRINT_RELATIVE = "SPRINT_RELATIVE"
    UNRESOLVABLE = "UNRESOLVABLE"

class TemporalExpressionType(str, Enum):
    RELATIVE_WEEKDAY = "RELATIVE_WEEKDAY"
    RELATIVE_PERIOD = "RELATIVE_PERIOD"
    RELATIVE_TIME = "RELATIVE_TIME"
    ABSOLUTE_DATE = "ABSOLUTE_DATE"
    ORDINAL_DATE = "ORDINAL_DATE"
    RELATIVE_OFFSET = "RELATIVE_OFFSET"
    MEETING_REFERENCE = "MEETING_REFERENCE"
    SPRINT_MILESTONE = "SPRINT_MILESTONE"
    URGENCY_ONLY = "URGENCY_ONLY"
    UNKNOWN = "UNKNOWN"

class DateParseResult(BaseModel):
    raw_expression: str
    status: DateResolutionStatus
    expression_type: TemporalExpressionType
    resolved_datetime_utc: Optional[datetime] = None
    confidence: float = Field(..., ge=0.0, le=1.0)
    resolution_note: Optional[str] = None
    layer_used: Literal[1, 2, 3]

    @model_validator(mode="after")
    def validate_resolved_status(self) -> "DateParseResult":
        if self.status == DateResolutionStatus.RESOLVED:
            if self.resolved_datetime_utc is None:
                raise ValueError("resolved_datetime_utc must be populated when status is RESOLVED")
        else:
            if self.resolved_datetime_utc is not None:
                raise ValueError("resolved_datetime_utc must be None when status is not RESOLVED")
        return self

class DateParseRequest(BaseModel):
    raw_expression: str = Field(..., min_length=1)
    meeting_datetime_utc: datetime
    team_timezone: str = Field(..., min_length=1)
    meeting_duration_minutes: Optional[int] = Field(None, ge=0)

    @field_validator("meeting_datetime_utc")
    @classmethod
    def must_be_utc(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            raise ValueError("meeting_datetime_utc must be timezone-aware")
        if v.tzinfo.utcoffset(v) is None or v.tzinfo.utcoffset(v).total_seconds() != 0:
            raise ValueError("meeting_datetime_utc must be UTC")
        return v

    @field_validator("team_timezone")
    @classmethod
    def valid_timezone(cls, v: str) -> str:
        if v not in pytz.all_timezones:
            raise ValueError(f"Invalid IANA timezone: {v}")
        return v

class DateParseModelResponse(BaseModel):
    resolved_date: Optional[str] = None
    confidence: float = Field(..., ge=0.0, le=1.0)
    is_ambiguous: bool
    is_sprint_relative: bool
    expression_type_hint: Optional[str] = None
    resolution_note: Optional[str] = None
