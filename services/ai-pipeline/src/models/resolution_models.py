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


# ═══════════════════════════════════════════════════════════════════════════════
# DAY 55: Route-Level Types — /resolve Endpoint Contract
# ═══════════════════════════════════════════════════════════════════════════════


# ─── Day 55: ResolveRequest ───────────────────────────────────────────────────

class ResolveRequest(BaseModel):
    """HTTP request body for POST /api/v1/resolve.

    Sent by the Node.js worker after /extract has run for the current meeting.
    The Node.js side pre-fetches historical_commitments from PostgreSQL,
    filtered to PENDING/DEFERRED status only — FULFILLED/MISSED/CANCELLED
    must never appear here.

    PRINCIPAL DESIGN: This model is the complete input contract for the entire
    resolution pipeline. The route handler passes it directly to
    run_resolution_pipeline() with zero transformation — the pipeline owns
    interpretation, not the route handler.
    """

    meeting_id: str = Field(
        ...,
        min_length=1,
        description="The current meeting's PostgreSQL UUID.",
    )
    team_id: str = Field(
        ...,
        min_length=1,
        description="Tenant team/organization ID for scoping.",
    )
    meeting_date: datetime = Field(
        ...,
        description="The meeting's scheduled UTC datetime. Used for logging and stats.",
    )
    meeting_duration_seconds: Optional[float] = Field(
        None,
        ge=0.0,
        description="Meeting duration in seconds. Optional — for diagnostics/logging.",
    )
    new_commitments: List[ParsedCommitment] = Field(
        default_factory=list,
        description=(
            "Commitments extracted from this meeting's /extract call. "
            "min_length=0: a meeting with zero extracted commitments is valid — "
            "the resolver returns all historical as unchanged."
        ),
    )
    historical_commitments: List[HistoricalCommitment] = Field(
        default_factory=list,
        description=(
            "Open commitments from all prior meetings for this team, pre-fetched from "
            "PostgreSQL. Pre-filtered by Node.js to exclude: (a) this meeting's own "
            "commitments, (b) FULFILLED/MISSED/CANCELLED status commitments. "
            "min_length=0: a new team or no prior commitments is valid."
        ),
    )
    team_timezone: str = Field(
        ...,
        min_length=1,
        description=(
            "IANA timezone string (e.g. 'America/New_York'). "
            "Already validated at /extract but re-validated here for defense-in-depth."
        ),
    )

    @model_validator(mode="after")
    def _enforce_same_meeting_exclusion(self) -> "ResolveRequest":
        """Defensive safeguard: filter any historical commitments from the current meeting.

        The Node.js side should never send these, but defense-in-depth requires
        the pipeline to handle it gracefully rather than failing or self-matching.
        """
        filtered: List[HistoricalCommitment] = []
        for hc in self.historical_commitments:
            if hc.meeting_id == self.meeting_id:
                logger.warning(
                    "ResolveRequest defensive guard: historical commitment %s belongs "
                    "to the current meeting %s. Filtering out to prevent self-matching.",
                    hc.id,
                    self.meeting_id,
                )
            else:
                filtered.append(hc)
        self.historical_commitments = filtered
        return self


# ─── Day 55: ResolvedCommitmentUpdate ────────────────────────────────────────

class ResolvedCommitmentUpdate(BaseModel):
    """A historical commitment confirmed as FULFILLED by the resolution detector.

    Returned in PipelineResult.resolved_updates. The Node.js side uses this to:
      - UPDATE commitment SET status='FULFILLED', resolved_at=now() WHERE id=historical_commitment_id
      - Log the audit trail (what was said, by who, with what confidence)
      - Trigger the commitment-met Socket.io notification

    AUDIT TRAIL DESIGN: Every field here answers a specific question in the audit log:
      - historical_commitment_id: "which commitment was resolved?"
      - historical_commitment_text: "what was the original promise?" (immutable record)
      - resolved_by_new_commitment: "what was said that resolved it?" (full metadata)
      - detection_confidence: "how confident was the AI?" (for dispute resolution)
      - similarity_score: "how similar were the texts?" (separate from AI confidence)
      - prompt_version: "which prompt version made this determination?" (version pinning)
    """

    historical_commitment_id: str = Field(
        ...,
        min_length=1,
        description="The PostgreSQL UUID of the historical commitment to mark FULFILLED.",
    )
    historical_commitment_text: str = Field(
        ...,
        min_length=1,
        description="The original commitment text — carried for the audit trail.",
    )
    resolved_by_new_commitment: ParsedCommitment = Field(
        ...,
        description=(
            "The new statement that triggered resolution, with full metadata "
            "(text, normalized_text, confidence, due_date_utc, owner_name, etc.)."
        ),
    )
    detection_confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description=(
            "The GPT-4.1 Mini confidence in the resolution determination. "
            "From DetectionResult.confidence. Stored in the audit trail. "
            "In dispute resolution: 'AI classified this as resolved with X% confidence.'"
        ),
    )
    similarity_score: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description=(
            "The similarity matching score from Day 53's resolver. "
            "Answers 'how similar were the texts?' — separate from detection_confidence "
            "which answers 'did the AI think this was a completion?'"
        ),
    )
    prompt_version: str = Field(
        ...,
        min_length=1,
        description=(
            "The exact resolution prompt version that produced this determination. "
            "Every FULFILLED status change is permanently attributable to a specific "
            "prompt version — not just 'the AI decided.' "
            "E.g. 'resolution-v1.0' from _resolution_prompt_version in resolution_detector.py."
        ),
    )


# ─── Day 55: NotResolvedReference ────────────────────────────────────────────

class NotResolvedReference(BaseModel):
    """A historical commitment that was mentioned but NOT completed.

    Two cases produce a NotResolvedReference:
      1. Stage 1 blocked (no completion keyword → definitively NOT resolved)
      2. Stage 2 returned NOT_RESOLVED or DETECTION_FAILED

    The Node.js side uses this to:
      - UPDATE commitment SET last_referenced_at=now() WHERE id=historical_commitment_id
      - Leave status as PENDING (not FULFILLED)
      - Surface in 'still open' commitment view for the team

    The detection_status field distinguishes DETECTION_FAILED (GPT-4.1 Mini
    infrastructure failure) from NOT_RESOLVED (deliberate determination).
    The Node.js side may want to retry resolution for DETECTION_FAILED items
    rather than treating them as definitively not-resolved.
    """

    historical_commitment_id: str = Field(
        ...,
        min_length=1,
        description="The PostgreSQL UUID of the historical commitment to update (last_referenced_at only).",
    )
    new_statement_text: str = Field(
        ...,
        min_length=1,
        description=(
            "What was said in this meeting about this commitment. "
            "For the Node.js audit view: 'referenced in [meeting] by: [text]'"
        ),
    )
    similarity_score: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="The similarity score from the matching step.",
    )
    detection_status: Literal["NOT_RESOLVED", "DETECTION_FAILED"] = Field(
        ...,
        description=(
            "NOT_RESOLVED: Stage 2 confirmed this was not a completion (or Stage 1 blocked). "
            "DETECTION_FAILED: GPT-4.1 Mini call failed — the Node.js side may want to retry "
            "detection separately rather than treating this as definitively not-resolved."
        ),
    )


# ─── Day 55: PartialResolutionFailure ────────────────────────────────────────

class PartialResolutionFailure(BaseModel):
    """Structured partial-failure descriptor when some detection calls failed.

    Decision 2 from Day 55 architectural decisions: partial failure is a
    first-class outcome. When N-of-M detection calls fail, the service does NOT:
      a. Fail the entire job (losing successfully-processed data)
      b. Silently treat DETECTION_FAILED as NOT_RESOLVED (losing the failure signal)
    Instead: return a PipelineResult with partial_failure populated.

    The route handler maps this to HTTP 206 Partial Content with
    X-Resolve-Partial: true, allowing the Node.js side to use the partial data
    AND retry detection for the failed IDs in a subsequent job.
    """

    total_matched: int = Field(
        ...,
        ge=0,
        description="Total number of matched pairs that attempted detection.",
    )
    detection_succeeded: int = Field(
        ...,
        ge=0,
        description="Number of detection calls that completed successfully.",
    )
    detection_failed: int = Field(
        ...,
        ge=0,
        description="Number of detection calls that failed (infrastructure failure).",
    )
    failed_historical_ids: List[str] = Field(
        default_factory=list,
        description=(
            "Historical commitment IDs that had DETECTION_FAILED outcomes. "
            "The Node.js side can retry resolution for these specific IDs."
        ),
    )
    partial_result: Optional["PipelineResult"] = Field(
        None,
        description=(
            "The result from succeeded detections. "
            "None only if ALL detections failed (total failure case)."
        ),
    )

    @model_validator(mode="after")
    def _validate_counts(self) -> "PartialResolutionFailure":
        """Ensure detection_succeeded + detection_failed == total_matched."""
        if self.detection_succeeded + self.detection_failed != self.total_matched:
            raise ValueError(
                f"PartialResolutionFailure count invariant: "
                f"detection_succeeded ({self.detection_succeeded}) + "
                f"detection_failed ({self.detection_failed}) != "
                f"total_matched ({self.total_matched})"
            )
        return self


# ─── Day 55: ResolvePipelineStats ────────────────────────────────────────────

class ResolvePipelineStats(BaseModel):
    """Pipeline-level processing metadata for the resolution job.

    Every field here maps to a specific operational dashboard metric.
    The route handler logs this entire object as a single structured INFO event
    so production dashboards have all metrics in one log line per meeting.

    KEY COST-EFFICIENCY METRICS:
      stage1_blocks: how many matched pairs were resolved WITHOUT a GPT-4.1 Mini call.
        A high ratio (stage1_blocks / detection_calls_made + stage1_blocks) indicates
        the keyword gate is working efficiently. Monitor for keyword list quality.

      below_threshold_conservatives: how many times did Stage 2 say YES but confidence
        was below the threshold (defaulting to NOT_RESOLVED). Primary calibration
        metric for Day 60's threshold tuning evaluation.

    KEY LATENCY DECOMPOSITION:
      resolver_time_ms: purely the Day 53 similarity-based matching (O(N×M), Python).
        Expected: 1-50ms for typical team sizes.
      detector_time_ms: wall-clock time for ALL Stage 2 calls (including concurrency
        benefit). Expected: ~500ms per Stage 2 call, concurrent, so 4 calls in ~600ms.
      total_pipeline_time_ms: end-to-end from pipeline entry to PipelineResult return.
    """

    new_commitments_count: int = Field(..., ge=0, description="Commitments classified as brand-new.")
    resolved_count: int = Field(..., ge=0, description="Commitments confirmed as FULFILLED.")
    not_resolved_references_count: int = Field(..., ge=0, description="Matched but not completed references.")
    unchanged_count: int = Field(..., ge=0, description="Historical commitments not mentioned at all.")
    detection_calls_made: int = Field(..., ge=0, description="Total GPT-4.1 Mini Stage 2 calls dispatched.")
    detection_calls_succeeded: int = Field(..., ge=0, description="Stage 2 calls that completed successfully.")
    detection_calls_failed: int = Field(..., ge=0, description="Stage 2 calls that failed (DETECTION_FAILED).")
    total_detection_cost: CostRecord = Field(
        ...,
        description="Aggregated cost across all successful Stage 2 detection calls.",
    )
    resolver_time_ms: float = Field(
        ...,
        ge=0.0,
        description="Time for Day 53's resolver alone (similarity-based matching, synchronous).",
    )
    detector_time_ms: float = Field(
        ...,
        ge=0.0,
        description="Wall-clock time for all Stage 2 detection calls (concurrent benefit included).",
    )
    total_pipeline_time_ms: float = Field(
        ...,
        ge=0.0,
        description="End-to-end pipeline time from ResolveRequest to PipelineResult.",
    )
    stage1_blocks: int = Field(
        ...,
        ge=0,
        description=(
            "Matched pairs blocked by Stage 1 (no Stage 2 call needed). "
            "KEY COST-EFFICIENCY METRIC: high ratio = keyword gate is saving API calls."
        ),
    )
    below_threshold_conservatives: int = Field(
        ...,
        ge=0,
        description=(
            "Pairs where Stage 2 returned YES but confidence < STAGE2_CONFIDENCE_THRESHOLD. "
            "Status forced to NOT_RESOLVED by conservative bias. "
            "PRIMARY METRIC for Day 60 threshold calibration evaluation."
        ),
    )


# ─── Day 55: PipelineResult ───────────────────────────────────────────────────

class PipelineResult(BaseModel):
    """The complete output of a successful resolution pipeline run.

    ADDITIVE RESPONSE DESIGN (Decision 4): ALL four commitment categories are
    always present — even if empty. The Node.js side receives a complete picture
    of every commitment's status after this meeting. It never needs to 'infer'
    what's unchanged — unchanged_commitments is explicit.

    This allows the Node.js worker to:
      - INSERT new_commitments as new DB records
      - UPDATE resolved_updates to status=FULFILLED
      - UPDATE not_resolved_references to update last_referenced_at
      - Leave unchanged_commitments untouched (no DB write needed)
    All in one atomic worker transaction without re-querying the AI pipeline.
    """

    meeting_id: str = Field(..., min_length=1)
    team_id: str = Field(..., min_length=1)
    new_commitments: List[ParsedCommitment] = Field(
        default_factory=list,
        description="Commitments not matched to any historical commitment — to be inserted as new DB records.",
    )
    resolved_updates: List[ResolvedCommitmentUpdate] = Field(
        default_factory=list,
        description="Historical commitments confirmed FULFILLED — to be marked FULFILLED in PostgreSQL.",
    )
    not_resolved_references: List[NotResolvedReference] = Field(
        default_factory=list,
        description=(
            "Matched commitments not confirmed as completed — "
            "update last_referenced_at, leave status as PENDING."
        ),
    )
    unchanged_commitments: List[HistoricalCommitment] = Field(
        default_factory=list,
        description="Historical commitments not mentioned in this meeting — no DB action needed.",
    )
    partial_failure: Optional[PartialResolutionFailure] = Field(
        None,
        description=(
            "Populated if some Stage 2 detection calls failed. "
            "None if all detection calls succeeded (happy path). "
            "Route handler maps this to HTTP 206 with X-Resolve-Partial: true."
        ),
    )
    stats: ResolvePipelineStats = Field(
        ...,
        description="Full pipeline-level processing metadata and cost aggregation.",
    )


# ─── Day 55: ResolveResponse ──────────────────────────────────────────────────

class ResolveResponse(BaseModel):
    """HTTP response envelope for POST /api/v1/resolve.

    PRINCIPAL DESIGN — The three-state outcome model:
      1. Full success (partial=False, result populated): HTTP 200
      2. Partial failure (partial=True, result has partial_failure): HTTP 206
      3. Total failure (success=False, result=None, error populated): HTTP 422 or 500

    The success/partial boolean pair gives the Node.js side a clear
    machine-readable signal without needing to inspect HTTP status codes
    (though those are also set correctly for caches, retries, and monitoring).

    NODE.JS INTEGRATION CONTRACT (identical format to /extract):
      Partial (HTTP 206): use the data from result, log partial_failure.failed_historical_ids,
        schedule a retry job for those specific commitment IDs.
      Total failure (HTTP 422 from OpenAI, HTTP 500 from invariant bug):
        HTTP 422 → retry the entire job (transient OpenAI failure).
        HTTP 500 → alert, do NOT retry (invariant bug, will recur).
    """

    success: bool = Field(
        ...,
        description=(
            "True for full success or partial failure (partial is still usable). "
            "False only on total pipeline failure (resolver crashed or all detection calls failed)."
        ),
    )
    partial: bool = Field(
        ...,
        description="True if partial_failure is populated in result (some detection calls failed).",
    )
    request_id: str = Field(
        ...,
        description="From the X-Request-ID middleware. For log correlation.",
    )
    result: Optional[PipelineResult] = Field(
        None,
        description="The pipeline result. None only in total failure cases.",
    )
    error: Optional["ErrorEnvelopePayload"] = Field(
        None,
        description="Populated only on total failure. None on success or partial failure.",
    )


# ─── Day 55: ErrorEnvelopePayload ────────────────────────────────────────────

class ErrorEnvelopePayload(BaseModel):
    """Error detail carried in ResolveResponse.error for failure cases.

    Distinct from common.ErrorEnvelope to avoid a circular import with
    the route-level response model. Carries the fields that the Node.js
    side needs to decide: should it retry this job?

    non_retryable=True: ResolverInvariantError — a logic bug, not a transient failure.
    non_retryable=False: OpenAI total failure — retry after backoff.
    """

    error_code: str = Field(..., min_length=1)
    message: str = Field(..., min_length=1)
    non_retryable: bool = Field(
        ...,
        description=(
            "True if retrying this exact job will produce the same failure "
            "(e.g. ResolverInvariantError — a code bug). "
            "False if retry may succeed (e.g. transient OpenAI failure)."
        ),
    )
    details: Optional[dict] = None


# Forward reference resolution for PartialResolutionFailure.partial_result
PartialResolutionFailure.model_rebuild()
