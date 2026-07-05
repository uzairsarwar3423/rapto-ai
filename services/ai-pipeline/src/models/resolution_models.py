"""
models/resolution_models.py
────────────────────────────────────────────────────────────────────────────────
Vocaply AI Pipeline — Resolution Pydantic Models
Day 53 + Day 54 Extension | Principal Engineer Edition

  DetectionStatus       — enum: RESOLVED / NOT_RESOLVED / DETECTION_FAILED
  ResolutionDetectionModelResponse — OpenAI structured output schema (Pydantic)
  DetectionResult       — complete detector output (Stage 1 + optional Stage 2)

PRINCIPAL DESIGN NOTE — DETECTION_FAILED AS A DISTINCT STATUS:
  DETECTION_FAILED is never collapsed into NOT_RESOLVED. A GPT-4.1 Mini outage
  during Stage 2 must NOT silently leave all commitments as PENDING without
  observable signal. The Node.js orchestrator can pattern-match on DETECTION_FAILED
  to trigger retries, alerts, or graceful degradation — whichever the operational
  policy dictates. Conflating infrastructure failure with data-level determination
  is an architectural anti-pattern that makes production debugging impossible.
"""

from __future__ import annotations

from datetime import datetime
import logging
from enum import Enum
from typing import List, Optional, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from src.models.common import CostRecord
from src.models.similarity_models import PrefixMatchResult, SimilarityBreakdown
from src.services.extraction.commitment_parser import ParsedCommitment

logger = logging.getLogger(__name__)


# ─── Day 53: Historical Commitment Model ──────────────────────────────────────

class HistoricalCommitment(BaseModel):
    """An open commitment from a previous meeting, retrieved from the database.

    Sent by the Node.js orchestrator as part of the historical pool.
    """

    id: str = Field(..., min_length=1, description="PostgreSQL commitment UUID.")
    owner_id: str = Field(..., min_length=1, description="Platform user ID of the commitment maker.")
    owner_name: str = Field(..., min_length=1, description="Display name of the commitment maker.")
    text: str = Field(..., min_length=1, description="Verbatim commitment text.")
    normalized_text: str = Field(
        ...,
        description="Pre-computed normalized text form for matching."
    )
    status: Literal["PENDING", "DEFERRED"] = Field(
        ...,
        description="Only open statuses are valid inputs."
    )
    due_date_utc: Optional[datetime] = Field(
        None,
        description="Resolved deadline, if any."
    )
    created_at: datetime = Field(..., description="When the commitment was first extracted.")
    meeting_id: str = Field(..., min_length=1, description="ID of the source meeting.")
    source_meeting_date: Optional[datetime] = Field(
        None,
        description="When the source meeting occurred."
    )

    @model_validator(mode="after")
    def check_empty_normalized_text(self) -> "HistoricalCommitment":
        """Log a warning if normalized_text is empty but raw text is present."""
        if not self.normalized_text.strip() and self.text.strip():
            logger.warning(
                "Data quality warning: historical commitment %s has empty normalized_text.",
                self.id
            )
        return self


# ─── Day 53: Resolution Input ─────────────────────────────────────────────────

class ResolutionInput(BaseModel):
    """Input payload containing the current meeting metadata and historical commitments.

    Used by the Node.js backend to invoke the resolver.
    """

    meeting_id: str = Field(..., min_length=1, description="ID of the current meeting.")
    team_id: str = Field(..., min_length=1, description="Tenant organization/team ID.")
    meeting_date: datetime = Field(..., description="Chronological date of the current meeting.")
    new_commitments: List[ParsedCommitment] = Field(
        default_factory=list,
        description="Newly extracted commitments from the current meeting."
    )
    historical_commitments: List[HistoricalCommitment] = Field(
        default_factory=list,
        description="Active historical commitments for the team."
    )

    @model_validator(mode="after")
    def enforce_same_meeting_exclusion(self) -> "ResolutionInput":
        """Enforce same-meeting exclusion safeguard defensively."""
        filtered = []
        for hc in self.historical_commitments:
            if hc.meeting_id == self.meeting_id:
                logger.warning(
                    "Defensive safeguard: historical commitment %s belongs to the current meeting %s. "
                    "Filtering it out to prevent self-matching.",
                    hc.id,
                    self.meeting_id,
                )
            else:
                filtered.append(hc)
        self.historical_commitments = filtered
        return self


# ─── Day 53: Internal Match Candidate ──────────────────────────────────────────

class MatchCandidate(BaseModel):
    """Internal comparison metadata for tracking pairwise matches."""

    new_commitment_id: str
    historical_commitment_id: str
    raw_similarity_score: float
    prefix_match: PrefixMatchResult
    boosted_score: float
    above_threshold: bool
    similarity_breakdown: SimilarityBreakdown


# ─── Day 53: Matched Commitment ───────────────────────────────────────────────

class MatchedCommitment(BaseModel):
    """A confirmed link between a new statement and a historical commitment."""

    new_commitment: ParsedCommitment = Field(..., description="The newly stated commitment.")
    historical_commitment: HistoricalCommitment = Field(..., description="The matched open commitment.")
    similarity_score: float = Field(..., ge=0.0, le=1.0, description="The final boosted score.")
    similarity_breakdown: SimilarityBreakdown = Field(..., description="Breakdown of similarity scores.")
    prefix_boost_applied: bool = Field(
        ...,
        description="True if the prefix boost was the deciding factor in making this a match."
    )


# ─── Day 53: Resolution Statistics ────────────────────────────────────────────

class ResolutionStats(BaseModel):
    """Processing metadata containing count, performance, and warning information."""

    new_commitments_count: int = Field(..., ge=0)
    matched_commitments_count: int = Field(..., ge=0)
    unchanged_commitments_count: int = Field(..., ge=0)
    total_owners_processed: int = Field(..., ge=0)
    total_comparisons_made: int = Field(..., ge=0)
    prefix_boosts_applied: int = Field(..., ge=0)
    conflicts_detected: int = Field(..., ge=0)
    owner_fallback_count: int = Field(..., ge=0)
    pool_truncations: int = Field(..., ge=0)
    processing_time_ms: float = Field(..., ge=0.0)
    data_quality_warnings: List[str] = Field(default_factory=list)


# ─── Day 53: Resolution Result ────────────────────────────────────────────────

class ResolutionResult(BaseModel):
    """The canonical output structure returned by the commitment resolver."""

    meeting_id: str
    team_id: str
    new_commitments: List[ParsedCommitment] = Field(
        default_factory=list,
        description="Commitments that did not match any historical commitment."
    )
    matched_commitments: List[MatchedCommitment] = Field(
        default_factory=list,
        description="Linkings of new statements to existing historical commitments."
    )
    unchanged_commitments: List[HistoricalCommitment] = Field(
        default_factory=list,
        description="Historical commitments untouched in the current meeting."
    )
    stats: ResolutionStats


# ═══════════════════════════════════════════════════════════════════════════════
# DAY 54: Detection Models
# ═══════════════════════════════════════════════════════════════════════════════


# ─── Day 54: Stage1Reason ─────────────────────────────────────────────────────

class Stage1Reason(str, Enum):
    """Why Stage 1 returned its result.

    Used in structured logs and DetectionResult for observability and debugging.
    Each value maps to a fixed stage1_confidence in Stage1Result.
    """

    NON_COMPLETION_PHRASE_FOUND = "non_completion_phrase_found"
    """A non-completion phrase was detected in the new statement text.

    Stage 1 returns NOT_RESOLVED regardless of whether a completion keyword
    is also present. The NCP check runs BEFORE the keyword check (Decision 2).
    stage1_confidence: 0.92 — phrase is explicit and unambiguous.
    """

    NO_COMPLETION_KEYWORD = "no_completion_keyword"
    """No completion keyword was found after the non-completion check.

    No evidence of completion in the text at all.
    stage1_confidence: 0.88 — absence of completion vocabulary is strong signal.
    """

    COMPLETION_KEYWORD_FOUND = "completion_keyword_found"
    """A completion keyword was found AND no non-completion phrase was present.

    Stage 1 PASSES — Stage 2 (GPT-4.1 Mini) will be invoked.
    stage1_confidence: 0.0 — Stage 1 has not determined a NOT_RESOLVED outcome;
    Stage 2 determines the final confidence. 0.0 signals "Stage 1 deferred".
    """

    TEXT_TOO_SHORT = "text_too_short"
    """The new statement text was too short (< 3 words) to contain meaningful signals.

    Returns NOT_RESOLVED conservatively. A 1-2 word statement cannot be
    reliably classified by Stage 1 keyword matching alone.
    stage1_confidence: 0.75 — "done" (1 word) might be a completion but 3-word
    minimum is enforced as a data quality gate.
    """

    EMPTY_TEXT = "empty_text"
    """The new statement text was empty or whitespace-only.

    Returns NOT_RESOLVED immediately. Defensive edge case — extraction should
    never produce empty commitment text, but the detector handles it gracefully.
    stage1_confidence: 0.75 — same rationale as TEXT_TOO_SHORT.
    """


# ─── Day 54: Stage1Result ─────────────────────────────────────────────────────

class Stage1Result(BaseModel):
    """The complete output of Stage 1 (keyword gate) analysis.

    Pure, synchronous, sub-millisecond. No I/O, no model calls.
    Always populated in DetectionResult — whether Stage 2 was invoked or not.
    """

    passed: bool = Field(
        ...,
        description=(
            "True if Stage 2 should be invoked. "
            "False if NOT_RESOLVED is already determined by Stage 1."
        ),
    )
    reason: Stage1Reason = Field(
        ...,
        description="Which condition determined the Stage 1 outcome.",
    )
    matched_phrase: Optional[str] = Field(
        None,
        description=(
            "The exact non-completion phrase matched, when "
            "reason == NON_COMPLETION_PHRASE_FOUND. "
            "Used in structured logs for operator diagnostics."
        ),
    )
    matched_keyword: Optional[str] = Field(
        None,
        description=(
            "The exact completion keyword matched, when "
            "reason == COMPLETION_KEYWORD_FOUND. "
            "Used in structured logs and audit trail."
        ),
    )
    stage1_confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description=(
            "Confidence in Stage 1's NOT_RESOLVED determination. "
            "0.0 when passed=True (Stage 2 determines final confidence). "
            "Fixed values per Stage1Reason: "
            "NON_COMPLETION_PHRASE_FOUND=0.92, NO_COMPLETION_KEYWORD=0.88, "
            "TEXT_TOO_SHORT/EMPTY_TEXT=0.75, COMPLETION_KEYWORD_FOUND=0.0."
        ),
    )

    @model_validator(mode="after")
    def _validate_consistency(self) -> "Stage1Result":
        """Enforce structural invariants between passed and reason/confidence."""
        if self.passed:
            # When passed=True, Stage 2 determines confidence — Stage 1 defers
            if self.stage1_confidence != 0.0:
                raise ValueError(
                    "stage1_confidence must be 0.0 when passed=True "
                    "(Stage 2 will determine the final confidence)."
                )
            if self.reason != Stage1Reason.COMPLETION_KEYWORD_FOUND:
                raise ValueError(
                    "passed=True requires reason=COMPLETION_KEYWORD_FOUND."
                )
            if self.matched_keyword is None:
                raise ValueError(
                    "matched_keyword must be set when passed=True."
                )
        else:
            # When passed=False, confidence must be non-zero
            if self.stage1_confidence == 0.0:
                raise ValueError(
                    "stage1_confidence must be > 0.0 when passed=False."
                )
        return self


# ─── Day 54: DetectionStatus ──────────────────────────────────────────────────

class DetectionStatus(str, Enum):
    """The final determination of the Resolution Detector.

    Three-way enum — DETECTION_FAILED is kept distinct from NOT_RESOLVED
    because infrastructure failure and a deliberate NOT_RESOLVED determination
    must be handled differently by downstream consumers (Node.js orchestrator).
    """

    RESOLVED = "RESOLVED"
    """Stage 2 confirmed completion with confidence >= STAGE2_CONFIDENCE_THRESHOLD.

    Action: mark commitment status=FULFILLED in PostgreSQL, remove from
    open-commitment pool, trigger commitment-met Socket.io notification.
    """

    NOT_RESOLVED = "NOT_RESOLVED"
    """Stage 1 rejected, Stage 2 returned NO, or Stage 2 YES was below threshold.

    Action: leave status=PENDING, continue reminders, update last_referenced_at.
    """

    DETECTION_FAILED = "DETECTION_FAILED"
    """Stage 2 was invoked but failed after all retries (infrastructure failure).

    NEVER conflated with NOT_RESOLVED. The Node.js side should:
      - Retry the whole resolve job later, OR
      - Alert the on-call team, OR
      - Degrade gracefully with "resolution detection unavailable" notification.
    A GPT-4.1 Mini outage must NOT silently leave all commitments as PENDING.
    """


# ─── Day 54: ResolutionDetectionModelResponse ────────────────────────────────

class ResolutionDetectionModelResponse(BaseModel):
    """OpenAI Structured Output schema for Stage 2 (GPT-4.1 Mini) calls.

    Used as the response_format in client.beta.chat.completions.parse().
    Native OpenAI Structured Outputs — the most reliable JSON extraction
    mechanism available. The schema constrains the model's output regardless
    of any prompt injection attempts in the user-supplied texts.

    SCHEMA DESIGN NOTES:
      - resolved: bool (not Literal["resolved", "not_resolved"]) — bool is the
        most stable primitive for binary classification in JSON schema mode
        across OpenAI model versions. Literal union types have exhibited
        occasional schema adherence issues.
      - confidence: float with [0.0, 1.0] range constraint via Pydantic Field.
      - reason: str with max_length=200 — logs and audit trail, never surfaced
        in the product UI. Length limit prevents unexpectedly verbose model output
        from polluting log aggregation.
      - key_signal: str | None with max_length=100 — the specific phrase in the
        new statement that most strongly supports the model's determination.
        Used for eval harness analysis on Day 60. Optional — the model may not
        always identify a single key phrase.
    """

    resolved: bool = Field(
        ...,
        description=(
            "True if the new statement explicitly confirms the commitment was "
            "COMPLETED and DELIVERED. False otherwise. When in doubt: false."
        ),
    )
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description=(
            "Model's confidence in its resolved/not-resolved determination. "
            "1.0 = unambiguously clear. 0.70-0.84 = likely with some uncertainty. "
            "0.50-0.69 = ambiguous (system treats as NOT_RESOLVED regardless). "
            "0.10-0.29 = clearly not resolved."
        ),
    )
    reason: str = Field(
        ...,
        max_length=200,
        description=(
            "Brief explanation of the model's determination. "
            "Used for logging and audit trail. Never surfaced in the product UI."
        ),
    )
    key_signal: Optional[str] = Field(
        None,
        max_length=100,
        description=(
            "The specific phrase in the new statement that most strongly "
            "supports the determination. Used for eval harness analysis. "
            "Null if no single phrase dominates."
        ),
    )

    @field_validator("confidence")
    @classmethod
    def validate_confidence_range(cls, v: float) -> float:
        """Redundant guard (Field ge/le handles this) — explicit for IDE clarity."""
        if not 0.0 <= v <= 1.0:
            raise ValueError(f"confidence must be in [0.0, 1.0], got {v}")
        return v


# ─── Day 54: DetectionResult ──────────────────────────────────────────────────

class DetectionResult(BaseModel):
    """The complete output of the Resolution Detector (Stage 1 + optional Stage 2).

    The single canonical output type for both detect_resolution() and detect_many().
    Carries the full audit trail: stage1 result, stage2 result (if invoked),
    cost record, and the original texts that were analyzed.

    AUDIT TRAIL COMPLETENESS RATIONALE:
      When a commitment is marked FULFILLED in the database and a user disputes it
      ("I never said I was done"), this DetectionResult — combined with the
      structured log entry — provides the non-repudiable evidence for why the
      system made that decision:
        - new_statement_text: what the model analyzed
        - historical_commitment_text: what it was compared to
        - stage2_result: the model's full raw response including reason
        - stage2_cost: confirms a real API call was made (not a shortcut)
        - status + confidence: the final determination

      Without this, the decision is opaque and un-auditable — unacceptable for
      a professional accountability system.
    """

    status: DetectionStatus = Field(
        ...,
        description="The final determination: RESOLVED, NOT_RESOLVED, or DETECTION_FAILED.",
    )
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description=(
            "Final confidence in the determination. "
            "If Stage 1 blocked: stage1_result.stage1_confidence. "
            "If Stage 2 RESOLVED: model confidence, capped at 0.95 "
            "(perfect confidence is epistemically dishonest for model decisions). "
            "If Stage 2 NOT_RESOLVED: model confidence (preserved for diagnostics). "
            "If below_threshold_conservative=True: stage2 confidence preserved "
            "(status overridden to NOT_RESOLVED, confidence not falsely inflated). "
            "If DETECTION_FAILED: 0.0."
        ),
    )
    stage1_result: Stage1Result = Field(
        ...,
        description="Always populated. The complete Stage 1 keyword gate output.",
    )
    stage2_invoked: bool = Field(
        ...,
        description="True if Stage 2 (GPT-4.1 Mini) was called. False if Stage 1 resolved the case.",
    )
    stage2_result: Optional[ResolutionDetectionModelResponse] = Field(
        None,
        description=(
            "Populated only when stage2_invoked=True AND the call succeeded. "
            "This is the raw model response — the primary audit trail artifact."
        ),
    )
    stage2_cost: Optional[CostRecord] = Field(
        None,
        description=(
            "Cost of the Stage 2 call, from the OpenAI client's cost tracking. "
            "None if Stage 2 was not invoked. "
            "Populated even on DETECTION_FAILED if the cost was partially incurred "
            "(e.g., network call was made but response parsing failed)."
        ),
    )
    below_threshold_conservative: bool = Field(
        ...,
        description=(
            "True when Stage 2 returned resolved=True but confidence was below "
            "STAGE2_CONFIDENCE_THRESHOLD. Status is forced to NOT_RESOLVED "
            "by the conservative bias policy. "
            "KEY METRIC for Day 60's threshold calibration eval: measures how "
            "often the threshold is the deciding factor vs. the model saying NO."
        ),
    )
    new_statement_text: str = Field(
        ...,
        description=(
            "The full new statement text that was analyzed. "
            "Preserved in the result itself (not only in logs) for the audit trail."
        ),
    )
    historical_commitment_text: str = Field(
        ...,
        description=(
            "The historical commitment text that was compared against. "
            "Preserved for the audit trail."
        ),
    )

    @model_validator(mode="after")
    def _validate_status_consistency(self) -> "DetectionResult":
        """Enforce structural invariants across status, stage2, and confidence fields."""
        if self.status == DetectionStatus.RESOLVED:
            if not self.stage2_invoked:
                raise ValueError(
                    "RESOLVED status requires stage2_invoked=True "
                    "(only Stage 2 can confirm resolution)."
                )
            if self.stage2_result is None:
                raise ValueError(
                    "RESOLVED status requires stage2_result to be populated "
                    "(audit trail completeness requirement)."
                )
            if self.below_threshold_conservative:
                raise ValueError(
                    "RESOLVED status is incompatible with below_threshold_conservative=True "
                    "(conservative bias forces NOT_RESOLVED in that case)."
                )
            if self.confidence > 0.95:
                raise ValueError(
                    "confidence must be <= 0.95 for RESOLVED status "
                    "(perfect confidence is capped at 0.95 — epistemically dishonest otherwise)."
                )

        if self.status == DetectionStatus.DETECTION_FAILED:
            if not self.stage2_invoked:
                raise ValueError(
                    "DETECTION_FAILED requires stage2_invoked=True "
                    "(Stage 2 must have been attempted to fail)."
                )
            if self.stage2_result is not None:
                raise ValueError(
                    "DETECTION_FAILED is incompatible with a populated stage2_result "
                    "(the call failed — no valid result was produced)."
                )
            if self.confidence != 0.0:
                raise ValueError(
                    "DETECTION_FAILED must have confidence=0.0 "
                    "(infrastructure failure has no meaningful confidence value)."
                )

        return self
