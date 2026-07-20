"""
services/resolution/resolution_detector.py
────────────────────────────────────────────────────────────────────────────────
Vocaply AI Pipeline — Two-Stage Resolution Detector
Day 54 | Principal Engineer + Principal AI/RAG Engineer Edition

Implements the commitment resolution detector described in AI-PIPELINE-DAY54-DEEP.

ARCHITECTURE (two-stage with hard boolean gate):
  Stage 1 — Keyword Gate (pure Python, sync, sub-ms):
    Input: new_statement_text (str)
    Logic:
      1. Empty/short text guard (< 3 words → NOT_RESOLVED, conservative)
      2. Non-completion phrase detection (NCP check MUST run first — Decision 2)
      3. Completion keyword detection (word-boundary regex)
    Output: Stage1Result (passed: bool + rich diagnostic metadata)

  Stage 2 — GPT-4.1 Mini Binary Classification (async, ~400-800ms):
    Invoked ONLY when Stage 1 passes.
    Input: both full original texts (not normalized — Decision 5)
    Output: ResolutionDetectionModelResponse via OpenAI Structured Outputs
    Conservative bias: YES < 0.70 confidence → NOT_RESOLVED (Decision 3)

MODULE INITIALIZATION (fail-fast, same pattern as all prompt modules):
  1. Both prompt files loaded once at import time (PromptLoadError if missing)
  2. _non_completion_regex compiled: single alternation regex, NCP phrases
     ordered by length descending (longer phrases first in alternation)
  3. _completion_keyword_regex compiled: word-boundary regex from COMPLETION_KEYWORDS

PUBLIC INTERFACE:
  detect_resolution(new_statement_text, historical_commitment_text, openai_client)
    → DetectionResult   (single pair, async)

  detect_many(pairs, openai_client)
    → list[DetectionResult]   (batch, async, concurrent with semaphore)

SECURITY:
  - Text truncated at MAX_TEXT_LENGTH_FOR_DETECTION (word-boundary, no mid-word)
  - User texts quoted in prompt template (prompt injection mitigation)
  - OpenAI Structured Outputs constrains response to schema (injection can't
    override the binary output constraint)
  - PII logging policy: full texts only at DEBUG; INFO uses 50-char preview

CONSERVATIVE BIAS DESIGN (asymmetry-of-harm):
  FALSE POSITIVE (wrongly RESOLVED) → catastrophic: commitment disappears,
    work not done, accountability corrupted
  FALSE NEGATIVE (wrongly NOT_RESOLVED) → mild: one extra reminder, self-corrects
  Therefore: every uncertain case → NOT_RESOLVED. The model must be ≥70%
  confident in YES for RESOLVED to fire.
"""

from __future__ import annotations

import asyncio
import os
import re
from pathlib import Path
from typing import Optional

import structlog

from src.config.logging import get_logger
from src.config.resolution_config import (
    COMPLETION_KEYWORDS,
    MAX_TEXT_LENGTH_FOR_DETECTION,
    NON_COMPLETION_PHRASES,
    RESOLUTION_PROMPT_VERSION_PATH,
    RESOLUTION_USER_PROMPT_PATH,
    STAGE1_CONFIDENCE_NO_KEYWORD,
    STAGE1_CONFIDENCE_NON_COMPLETION_PHRASE,
    STAGE1_CONFIDENCE_SHORT_TEXT,
    STAGE2_CONFIDENCE_THRESHOLD,
    STAGE2_MAX_CONCURRENT_CALLS,
)

# ─── Process-level Stage 2 semaphore ─────────────────────────────────────────
# CRITICAL: This semaphore MUST be process-level (module-level), not per-call.
# If it were created inside detect_many(), concurrent resolution jobs
# (multiple meetings processed simultaneously) would each get their own
# semaphore, effectively making STAGE2_MAX_CONCURRENT_CALLS per-job, not
# process-wide. At N concurrent jobs, that's N * STAGE2_MAX_CONCURRENT_CALLS
# simultaneous OpenAI calls — violating the rate-limit contract.
_STAGE2_SEMAPHORE: asyncio.Semaphore = asyncio.Semaphore(STAGE2_MAX_CONCURRENT_CALLS)
from src.models.common import CostRecord, TaskType
from src.models.exceptions import (
    AINonRetryableError,
    AIRateLimitExhaustedError,
    AISchemaValidationError,
    AITimeoutError,
)
from src.models.resolution_models import (
    DetectionResult,
    DetectionStatus,
    ResolutionDetectionModelResponse,
    Stage1Reason,
    Stage1Result,
)
from src.services.openai_client import OpenAIClient

log: structlog.BoundLogger = get_logger(__name__)

# ─── Module-level constants for minimum text word length ──────────────────────

_STAGE1_MIN_WORD_COUNT: int = 3
"""Minimum number of whitespace-delimited tokens for a statement to be classified
by Stage 1 keyword matching. Below this, the statement is too short for reliable
classification (a 1-word 'done' could be completion but we can't verify context).
"""

# ─── Percentage-partial detection regex ───────────────────────────────────────
# Handles "50% done", "80 percent complete" etc. — these are quantified partials
# NOT in NON_COMPLETION_PHRASES (which is a plain-string list) because they
# require a regex pattern, not substring matching.
_PERCENTAGE_PARTIAL_RE: re.Pattern[str] = re.compile(
    r"\b(\d{1,3})\s*(?:percent|%)\s*(?:done|complete|finished|through|ready)\b",
    re.IGNORECASE,
)
"""Matches quantified partial-completion claims like '50% done', '80 percent complete'.

These are NOT in NON_COMPLETION_PHRASES (which uses substring matching) because they
require a parametric regex pattern. This check runs BEFORE completion keyword detection,
as part of the Stage 1 NCP pass (extended to cover percentage-partial claims).
"""


# ─── Module Initialization ────────────────────────────────────────────────────
# Fail-fast at import time — missing prompt files are a deployment error, not a
# runtime error. The same pattern is used by all prompt-loading modules in this service.

def _load_prompt_file(relative_path: str) -> str:
    """Load a prompt file from the prompts/ directory relative to the src root.

    Raises FileNotFoundError with a clear message if missing — fail-fast at boot.
    """
    # Resolve relative to this file's location (services/resolution/) → go up 3 levels to src
    src_root = Path(__file__).parent.parent.parent  # src/
    full_path = src_root / relative_path
    if not full_path.exists():
        raise FileNotFoundError(
            f"Required prompt file not found: {full_path}. "
            f"Resolution detector cannot start without {relative_path}. "
            "Ensure the file exists and is committed to the repository."
        )
    return full_path.read_text(encoding="utf-8").strip()


# Load both prompts at module init — stored as module-level constants
_resolution_system_prompt: str = _load_prompt_file(RESOLUTION_PROMPT_VERSION_PATH)
_resolution_user_template: str = _load_prompt_file(RESOLUTION_USER_PROMPT_PATH)

# Extract version tag from the first line (# prompt_version: resolution-v1.0)
_resolution_prompt_version: str = "unknown"
for _line in _resolution_system_prompt.splitlines():
    if _line.strip().startswith("# prompt_version:"):
        _resolution_prompt_version = _line.strip().split(":", 1)[1].strip()
        break

log.info(
    "resolution_detector_initialized",
    prompt_version=_resolution_prompt_version,
    system_prompt_chars=len(_resolution_system_prompt),
    user_template_chars=len(_resolution_user_template),
)


# ─── Pre-compiled Regex Patterns ──────────────────────────────────────────────
# Built once at module init — NOT per-call. A single compiled regex pass over the
# input text is faster than N sequential string operations for N patterns.

# NCP regex: alternation ordered by phrase length descending.
# Longer phrases must appear before their shorter substrings in alternation to
# prevent shorter substring matches from triggering before more-specific longer ones.
_sorted_ncp_phrases: list[str] = sorted(NON_COMPLETION_PHRASES, key=len, reverse=True)
_non_completion_regex: re.Pattern[str] = re.compile(
    "|".join(re.escape(phrase) for phrase in _sorted_ncp_phrases),
    re.IGNORECASE,
)
"""Pre-compiled non-completion phrase regex. Single alternation pass, case-insensitive.

Ordered by phrase length descending: 'haven't finished' is checked before 'finished'
appears in a keyword check; 'not quite done' is checked before 'done'.
"""

# Keyword regex: word-boundary anchored to prevent substring false positives.
# "unfinished" must NOT match "finished"; "unresolved" must NOT match "resolved".
# Keywords sorted by length descending to match longer multi-word phrases first
# (e.g., "wrapped up" before "up").
_sorted_keywords: list[str] = sorted(COMPLETION_KEYWORDS, key=len, reverse=True)
_completion_keyword_regex: re.Pattern[str] = re.compile(
    r"\b(" + "|".join(re.escape(kw) for kw in _sorted_keywords) + r")\b",
    re.IGNORECASE,
)
"""Pre-compiled completion keyword regex with word-boundary anchors.

Word boundaries (\\b) are critical: "finished" matches but "unfinished" does not.
"resolved" matches but "unresolved" does not.
"""


# ─── Private Helpers ──────────────────────────────────────────────────────────


def _truncate_text(text: str, max_chars: int) -> tuple[str, bool]:
    """Truncate text at the last word boundary before max_chars.

    Returns (truncated_text, was_truncated: bool).

    Word-boundary truncation: never cuts mid-word. Uses rsplit(' ', 1) to find
    the last space before the character limit — guaranteed to produce a clean
    substring that ends at a word boundary.

    No truncation marker ('...') is added — the Stage 2 prompt does not reference
    truncation; the model sees clean text. Truncation is logged at DEBUG level by
    the caller (_invoke_stage2).

    Args:
        text: The text to potentially truncate.
        max_chars: Maximum character length.

    Returns:
        (text, False) if no truncation needed.
        (truncated_text, True) if truncation was applied.
    """
    if len(text) <= max_chars:
        return text, False

    # Find last space before max_chars — no mid-word truncation
    truncated = text[:max_chars].rsplit(" ", 1)[0]
    return truncated, True


def _run_stage1(new_statement_text: str) -> Stage1Result:
    """Stage 1 keyword gate — pure Python, synchronous, sub-millisecond.

    Runs three checks in strict order (order is a correctness requirement, not style):

    CHECK 1 — Empty/short text guard:
      Fires before any regex. A too-short or empty text cannot be reliably
      classified by keyword matching — conservative NOT_RESOLVED.

    CHECK 2 — Non-completion phrase detection (MUST RUN BEFORE keyword check):
      Decision 2 from the Day 54 plan: NCP detection runs BEFORE completion
      keyword detection. "I almost finished it" contains BOTH "almost" (NCP)
      and "finished" (keyword) — without ordering priority, this would ambiguously
      pass the gate. With NCP-first, "almost" fires first → NOT_RESOLVED.
      Linguistic principle: hedging/negation semantically dominates completion
      claims. The NCP wins at Stage 1; Stage 2 is not invoked.

    CHECK 3 — Completion keyword detection:
      Only runs if CHECK 2 found no NCP. Word-boundary regex ensures "finished"
      matches but "unfinished" does not; "resolved" matches but "unresolved" does not.

    Args:
        new_statement_text: The new statement to gate.

    Returns:
        Stage1Result with passed=True (send to Stage 2) or passed=False (NOT_RESOLVED).
    """
    # ── CHECK 1: Empty / too-short guard ─────────────────────────────────────
    text: str = new_statement_text.strip()

    if not text:
        return Stage1Result(
            passed=False,
            reason=Stage1Reason.EMPTY_TEXT,
            matched_phrase=None,
            matched_keyword=None,
            stage1_confidence=STAGE1_CONFIDENCE_SHORT_TEXT,
        )

    word_count: int = len(text.split())
    if word_count < _STAGE1_MIN_WORD_COUNT:
        return Stage1Result(
            passed=False,
            reason=Stage1Reason.TEXT_TOO_SHORT,
            matched_phrase=None,
            matched_keyword=None,
            stage1_confidence=STAGE1_CONFIDENCE_SHORT_TEXT,
        )

    # ── CHECK 2: Non-completion phrase detection (runs FIRST — Decision 2) ───
    ncp_match: re.Match[str] | None = _non_completion_regex.search(text)
    if ncp_match is not None:
        matched_phrase: str = ncp_match.group(0)
        return Stage1Result(
            passed=False,
            reason=Stage1Reason.NON_COMPLETION_PHRASE_FOUND,
            matched_phrase=matched_phrase,
            matched_keyword=None,
            stage1_confidence=STAGE1_CONFIDENCE_NON_COMPLETION_PHRASE,
        )

    # Percentage-partial check (extended NCP pass, requires regex not substring)
    pct_match: re.Match[str] | None = _PERCENTAGE_PARTIAL_RE.search(text)
    if pct_match is not None:
        return Stage1Result(
            passed=False,
            reason=Stage1Reason.NON_COMPLETION_PHRASE_FOUND,
            matched_phrase=pct_match.group(0),
            matched_keyword=None,
            stage1_confidence=STAGE1_CONFIDENCE_NON_COMPLETION_PHRASE,
        )

    # ── CHECK 3: Completion keyword detection ─────────────────────────────────
    kw_match: re.Match[str] | None = _completion_keyword_regex.search(text)
    if kw_match is None:
        return Stage1Result(
            passed=False,
            reason=Stage1Reason.NO_COMPLETION_KEYWORD,
            matched_phrase=None,
            matched_keyword=None,
            stage1_confidence=STAGE1_CONFIDENCE_NO_KEYWORD,
        )

    matched_keyword: str = kw_match.group(0)
    return Stage1Result(
        passed=True,
        reason=Stage1Reason.COMPLETION_KEYWORD_FOUND,
        matched_phrase=None,
        matched_keyword=matched_keyword,
        stage1_confidence=0.0,  # Stage 1 defers — Stage 2 determines final confidence
    )


async def _invoke_stage2(
    new_text: str,
    historical_text: str,
    openai_client: OpenAIClient,
) -> tuple[Optional[ResolutionDetectionModelResponse], Optional[CostRecord]]:
    """Invoke GPT-4.1 Mini for binary resolution classification (Stage 2).

    Called ONLY when Stage 1 has passed — i.e., the statement is at minimum
    'completion-flavored.' Stage 2 determines whether it constitutes actual completion.

    Uses the ORIGINAL, full texts (not normalized forms) — Decision 5 from the plan:
    the model needs full semantic content to correctly determine if a specific
    statement constitutes completion of a specific commitment. Normalized 5-token
    forms lose the linguistic nuance Stage 2 needs.

    Returns (None, None) if the call failed due to timeout or rate-limit exhaustion.
    Returns (None, cost_record) if the call failed due to schema validation failure
    (cost may have been partially incurred).
    Re-raises AINonRetryableError (auth/config errors — surfaces to global handler).

    Args:
        new_text: The new statement text (truncated if needed).
        historical_text: The historical commitment text (truncated if needed).
        openai_client: The OpenAI client instance.

    Returns:
        (ResolutionDetectionModelResponse | None, CostRecord | None)
    """
    # ── Step 1: Text truncation ───────────────────────────────────────────────
    truncated_new, new_was_truncated = _truncate_text(new_text, MAX_TEXT_LENGTH_FOR_DETECTION)
    truncated_hist, hist_was_truncated = _truncate_text(historical_text, MAX_TEXT_LENGTH_FOR_DETECTION)

    if new_was_truncated:
        log.debug(
            "resolution_stage2_text_truncated",
            field="new_statement",
            original_chars=len(new_text),
            truncated_chars=len(truncated_new),
            max_chars=MAX_TEXT_LENGTH_FOR_DETECTION,
        )
    if hist_was_truncated:
        log.debug(
            "resolution_stage2_text_truncated",
            field="historical_commitment",
            original_chars=len(historical_text),
            truncated_chars=len(truncated_hist),
            max_chars=MAX_TEXT_LENGTH_FOR_DETECTION,
        )

    # ── Step 2: User prompt construction ─────────────────────────────────────
    user_prompt: str = _resolution_user_template.format(
        historical_commitment_text=truncated_hist,
        new_statement_text=truncated_new,
    )

    # ── Step 3: OpenAI structured output call ─────────────────────────────────
    try:
        result = await openai_client.generate_structured(
            task_type=TaskType.RESOLUTION_CHECK,
            system_prompt=_resolution_system_prompt,
            user_prompt=user_prompt,
            response_schema=ResolutionDetectionModelResponse,
        )
        return result.data, result.cost

    # ── Step 4: Error handling ────────────────────────────────────────────────
    except AISchemaValidationError as exc:
        # Call was made (cost may have been incurred) but response was unusable.
        # Return (None, cost) so caller can set DETECTION_FAILED with partial cost info.
        log.warning(
            "resolution_stage2_schema_validation_failed",
            error=str(exc.validation_error)[:200],
            prompt_version=_resolution_prompt_version,
        )
        return None, None  # cost not accessible from exception at this level

    except (AITimeoutError, AIRateLimitExhaustedError) as exc:
        # Infrastructure failure — no cost if call failed before getting a response.
        log.warning(
            "resolution_stage2_infrastructure_failure",
            error_type=type(exc).__name__,
            error=str(exc)[:200],
        )
        return None, None

    except AINonRetryableError:
        # Auth/config error — re-raise to surface to the global error handler.
        # This is not a per-call failure; it indicates a configuration problem
        # that will affect all calls and must not be silently swallowed.
        raise


# ─── Public Interface ──────────────────────────────────────────────────────────


async def detect_resolution(
    new_statement_text: str,
    historical_commitment_text: str,
    openai_client: OpenAIClient,
) -> DetectionResult:
    """Detect whether a new statement confirms resolution of a historical commitment.

    The primary public function — called by Day 55's resolver_pipeline.py for
    each matched pair. Accepts a single pair (not a batch) because:
      a. Each pair is independent — no shared context needed
      b. Concurrent dispatch (detect_many with asyncio.gather + semaphore) handles
         fan-out correctly for N pairs
      c. A batch API would require a more complex response schema (list of results,
         order preservation) for marginal benefit at typical meeting scale (0-5 calls)

    Stage 1 is synchronous and runs inline. Stage 2 is async and awaited only
    when Stage 1 passes (which is ~20-25% of matched pairs in production).

    Args:
        new_statement_text: The new statement from the current meeting.
            Use ParsedCommitment.text (post-cleanup, pre-normalization) — Decision 7.
            NOT cleaned_text, NOT normalized_text.
        historical_commitment_text: The historical commitment's full text.
            Use HistoricalCommitment.text.
        openai_client: The OpenAI client instance (injected for testability).

    Returns:
        DetectionResult with full audit trail.
    """
    # ── Stage 1: Keyword gate (synchronous, sub-ms) ───────────────────────────
    stage1: Stage1Result = _run_stage1(new_statement_text)

    # ── Stage 1 blocked: return NOT_RESOLVED immediately ─────────────────────
    if not stage1.passed:
        return DetectionResult(
            status=DetectionStatus.NOT_RESOLVED,
            confidence=stage1.stage1_confidence,
            stage1_result=stage1,
            stage2_invoked=False,
            stage2_result=None,
            stage2_cost=None,
            below_threshold_conservative=False,
            new_statement_text=new_statement_text,
            historical_commitment_text=historical_commitment_text,
        )

    # ── Stage 1 passed: log + invoke Stage 2 ─────────────────────────────────
    log.info(
        "resolution_stage2_invoked",
        keyword=stage1.matched_keyword,
        new_text_preview=new_statement_text[:50],
        prompt_version=_resolution_prompt_version,
    )

    model_response, cost_record = await _invoke_stage2(
        new_text=new_statement_text,
        historical_text=historical_commitment_text,
        openai_client=openai_client,
    )

    # ── Stage 2 failed: DETECTION_FAILED (distinct from NOT_RESOLVED) ────────
    if model_response is None:
        log.warning(
            "resolution_stage2_failed",
            reason="model_response_is_none",
            new_text_preview=new_statement_text[:50],
        )
        return DetectionResult(
            status=DetectionStatus.DETECTION_FAILED,
            confidence=0.0,
            stage1_result=stage1,
            stage2_invoked=True,
            stage2_result=None,
            stage2_cost=cost_record,
            below_threshold_conservative=False,
            new_statement_text=new_statement_text,
            historical_commitment_text=historical_commitment_text,
        )

    # ── Apply confidence threshold + conservative bias (Decision 3) ──────────
    resolved_by_model: bool = model_response.resolved
    model_confidence: float = model_response.confidence

    if resolved_by_model and model_confidence >= STAGE2_CONFIDENCE_THRESHOLD:
        # HIGH-CONFIDENCE YES: the only path to RESOLVED
        final_confidence = min(0.95, model_confidence)  # cap at 0.95 — epistemic honesty
        log.info(
            "resolution_detected",
            status="RESOLVED",
            confidence=final_confidence,
            key_signal=model_response.key_signal,
            reason_preview=model_response.reason[:100],
            prompt_version=_resolution_prompt_version,
        )
        return DetectionResult(
            status=DetectionStatus.RESOLVED,
            confidence=final_confidence,
            stage1_result=stage1,
            stage2_invoked=True,
            stage2_result=model_response,
            stage2_cost=cost_record,
            below_threshold_conservative=False,
            new_statement_text=new_statement_text,
            historical_commitment_text=historical_commitment_text,
        )

    elif resolved_by_model and model_confidence < STAGE2_CONFIDENCE_THRESHOLD:
        # LOW-CONFIDENCE YES: conservative bias forces NOT_RESOLVED
        # This is the PRIMARY metric for threshold calibration on Day 60.
        log.info(
            "resolution_below_threshold_conservative",
            model_said_yes=True,
            confidence=model_confidence,
            threshold=STAGE2_CONFIDENCE_THRESHOLD,
            key_signal=model_response.key_signal,
            prompt_version=_resolution_prompt_version,
        )
        return DetectionResult(
            status=DetectionStatus.NOT_RESOLVED,
            confidence=model_confidence,  # preserved for diagnostic value
            stage1_result=stage1,
            stage2_invoked=True,
            stage2_result=model_response,
            stage2_cost=cost_record,
            below_threshold_conservative=True,
            new_statement_text=new_statement_text,
            historical_commitment_text=historical_commitment_text,
        )

    else:
        # Model returned NO (resolved=False): NOT_RESOLVED
        return DetectionResult(
            status=DetectionStatus.NOT_RESOLVED,
            confidence=model_confidence,
            stage1_result=stage1,
            stage2_invoked=True,
            stage2_result=model_response,
            stage2_cost=cost_record,
            below_threshold_conservative=False,
            new_statement_text=new_statement_text,
            historical_commitment_text=historical_commitment_text,
        )


async def detect_many(
    pairs: list[tuple[str, str]],
    openai_client: OpenAIClient,
) -> list[DetectionResult]:
    """Batch detection for multiple (new_statement, historical_commitment) pairs.

    Called by Day 55's resolver_pipeline.py to process all matched pairs from a
    single meeting's resolution job. Results are returned in the SAME ORDER as
    the input pairs (not completion order) — critical for correct index mapping.

    IMPLEMENTATION STRATEGY (two-phase for efficiency):
    Phase 1 — Run Stage 1 for ALL pairs synchronously (pure Python, no I/O).
      Identifies which pairs need Stage 2. Runs serially — sub-ms total for
      typical meeting (0-10 pairs). Separates the fast/free gate from the costly
      async I/O.

    Phase 2 — Dispatch Stage 2 calls concurrently for passed pairs.
      Uses asyncio.Semaphore(STAGE2_MAX_CONCURRENT_CALLS=5) to cap concurrent
      OpenAI calls. For typical meetings (0-5 Stage 2 calls), the semaphore is
      never hit. For stress-test scenarios (large batch resolutions), it prevents
      overwhelming the OpenAI rate limit.

    Result ordering: pre-allocate result list indexed by input position, then
    fill Stage 2 results back by index after gather(). Stage 1 results are
    filled immediately (Phase 1, serial order).

    Args:
        pairs: List of (new_statement_text, historical_commitment_text) tuples.
        openai_client: The OpenAI client instance.

    Returns:
        List of DetectionResult, same order and length as pairs.
    """
    if not pairs:
        return []

    # ── Phase 1: Run Stage 1 for all pairs synchronously ─────────────────────
    stage1_results: list[Stage1Result] = [_run_stage1(p[0]) for p in pairs]

    # Identify which pairs passed Stage 1 and need Stage 2
    stage2_indices: list[int] = [
        i for i, s1 in enumerate(stage1_results) if s1.passed
    ]

    # Pre-allocate results list (will be filled by index)
    results: list[Optional[DetectionResult]] = [None] * len(pairs)

    # Fill Stage-1-blocked results immediately (no async needed)
    for i, s1 in enumerate(stage1_results):
        if not s1.passed:
            results[i] = DetectionResult(
                status=DetectionStatus.NOT_RESOLVED,
                confidence=s1.stage1_confidence,
                stage1_result=s1,
                stage2_invoked=False,
                stage2_result=None,
                stage2_cost=None,
                below_threshold_conservative=False,
                new_statement_text=pairs[i][0],
                historical_commitment_text=pairs[i][1],
            )

    if not stage2_indices:
        # No pairs passed Stage 1 — return all Stage-1-blocked results
        return results  # type: ignore[return-value]

    log.info(
        "resolution_detect_many_stage2_dispatch",
        total_pairs=len(pairs),
        stage1_passed_count=len(stage2_indices),
        stage1_blocked_count=len(pairs) - len(stage2_indices),
    )

    # ── Phase 2: Concurrent Stage 2 dispatch (process-level semaphore) ────────
    # Using the module-level _STAGE2_SEMAPHORE (not a new one per call).
    # This enforces the rate-limit contract across ALL concurrent resolution jobs.

    async def _bounded_detect(index: int) -> DetectionResult:
        """Semaphore-bounded single-pair detection for concurrent dispatch."""
        async with _STAGE2_SEMAPHORE:
            return await detect_resolution(
                new_statement_text=pairs[index][0],
                historical_commitment_text=pairs[index][1],
                openai_client=openai_client,
            )

    # Dispatch all Stage 2 calls concurrently
    stage2_tasks = [_bounded_detect(i) for i in stage2_indices]
    stage2_results: list[DetectionResult] = await asyncio.gather(*stage2_tasks)

    # Fill Stage 2 results back by original index (preserves input order)
    for idx, result in zip(stage2_indices, stage2_results):
        results[idx] = result

    # All slots must be filled at this point — hard invariant check
    # NOTE: Using RuntimeError (not assert) because assert is disabled
    # when Python runs with -O (optimize flag), which Docker production
    # containers often use. This invariant MUST fire in production if violated.
    if not all(r is not None for r in results):
        raise RuntimeError(
            "detect_many invariant violation: some result slots are unfilled. "
            f"Expected {len(pairs)} results, got {sum(1 for r in results if r is not None)}. "
            "This is a bug in the Stage 1/Stage 2 dispatch logic."
        )

    log.info(
        "resolution_detect_many_complete",
        total_pairs=len(pairs),
        resolved_count=sum(1 for r in results if r and r.status == DetectionStatus.RESOLVED),
        not_resolved_count=sum(1 for r in results if r and r.status == DetectionStatus.NOT_RESOLVED),
        detection_failed_count=sum(1 for r in results if r and r.status == DetectionStatus.DETECTION_FAILED),
        stage2_invoked_count=sum(1 for r in results if r and r.stage2_invoked),
    )

    return results  # type: ignore[return-value]
