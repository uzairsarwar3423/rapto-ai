// ─────────────────────────────────────────────────────────────────────────────
// ai-pipeline.errors.ts
// Typed error hierarchy for AI Pipeline failures.
//
// DESIGN: Every error that can originate from the AIPipelineClient is a subclass
// of AIPipelineError. This means callers catch by TYPE (instanceof), not by
// parsing error message strings. The isRetryable flag on each class is the
// canonical source of retry policy — workers read it without switch/if chains.
//
// RETRYABILITY INVARIANTS:
//   Network/Timeout errors   → isRetryable: true  (transient infrastructure)
//   Auth errors              → isRetryable: false (config bug — human must fix)
//   Validation errors        → isRetryable: false (payload bug — same payload always fails)
//   Invariant errors         → isRetryable: false (AI pipeline internal bug)
//   Circuit open errors      → isRetryable: false (wait for circuit timer, not a retry)
//   Total failure (OpenAI)   → isRetryable: true  (OpenAI is down — retry later)
//   Partial errors           → isRetryable: true  (partial data usable; retry may complete)
// ─────────────────────────────────────────────────────────────────────────────

import type { AxiosError } from 'axios';
import type { ExtractionResultWithMeta, PipelineResult } from './ai-pipeline.types';

// ─────────────────────────────────────────────────────────────────────────────
// BASE ERROR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Base class for all AI Pipeline errors.
 * All subclasses must pass isRetryable to super() — it must never be undefined.
 */
export class AIPipelineError extends Error {
  /** The X-Request-ID from the AI pipeline response (enables log correlation) */
  public readonly requestId: string | null;
  /** The meeting_id from the request context (enables alert correlation) */
  public readonly meetingId: string | null;
  /**
   * Canonical retry flag — workers inspect this, never the HTTP status or
   * class name. isRetryable === false means Bull should set the job as permanently
   * failed (after this attempt); true means Bull should retry per its backoff policy.
   */
  public readonly isRetryable: boolean;

  constructor(
    message: string,
    isRetryable: boolean,
    requestId: string | null = null,
    meetingId: string | null = null
  ) {
    super(message);
    this.name = this.constructor.name;
    this.isRetryable = isRetryable;
    this.requestId = requestId;
    this.meetingId = meetingId;
    // Maintains proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NETWORK & TRANSPORT ERRORS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Thrown when the HTTP call cannot reach the AI pipeline service.
 * Causes: connection refused, ECONNRESET, ENOTFOUND, DNS failure,
 *         generic HTTP 500 (treated as transient infrastructure failure).
 * isRetryable: true — network blips are always transient.
 */
export class AIPipelineNetworkError extends AIPipelineError {
  /** The raw Axios error, preserved for structured logging (do NOT log headers — auth leak) */
  public readonly axiosError: AxiosError;

  constructor(
    message: string,
    axiosError: AxiosError,
    requestId: string | null = null,
    meetingId: string | null = null
  ) {
    super(message, true, requestId, meetingId);
    this.axiosError = axiosError;
  }
}

/**
 * Thrown when the HTTP call exceeds the configured timeout.
 * Causes: AI pipeline is slow (large meeting, OpenAI latency spike), network congestion.
 * isRetryable: true — the service may be momentarily overloaded.
 */
export class AIPipelineTimeoutError extends AIPipelineError {
  /** Milliseconds elapsed before timeout fired — useful for threshold tuning */
  public readonly elapsedMs: number;

  constructor(
    message: string,
    elapsedMs: number,
    requestId: string | null = null,
    meetingId: string | null = null
  ) {
    super(message, true, requestId, meetingId);
    this.elapsedMs = elapsedMs;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH ERRORS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Thrown on HTTP 401 from the AI pipeline.
 * Cause: AI_PIPELINE_SECRET does not match the FastAPI API_SHARED_SECRET.
 * isRetryable: false — retrying with the same wrong key will always 401.
 * OPERATIONAL ACTION: page on-call immediately. This is a configuration bug.
 */
export class AIPipelineAuthError extends AIPipelineError {
  constructor(
    message: string,
    requestId: string | null = null,
    meetingId: string | null = null
  ) {
    super(message, false, requestId, meetingId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION ERRORS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Thrown on HTTP 422 when the response body contains a Pydantic validation error array.
 * This means the Node.js side sent a structurally invalid request payload.
 * isRetryable: false — the SAME payload will always fail.
 * OPERATIONAL ACTION: fix the TypeScript request builder. Check for schema drift
 * (Python Pydantic models changed without updating these TypeScript interfaces).
 */
export class AIPipelineValidationError extends AIPipelineError {
  /** The raw Pydantic error detail array from the response body */
  public readonly validationDetails: unknown;

  constructor(
    message: string,
    validationDetails: unknown,
    requestId: string | null = null,
    meetingId: string | null = null
  ) {
    super(message, false, requestId, meetingId);
    this.validationDetails = validationDetails;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PARTIAL & TOTAL FAILURE ERRORS (upstream dependency failures)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Thrown on HTTP 206 (partial success) from /extract or /resolve.
 * Some chunks / detection calls succeeded, some failed.
 * The partialResult contains the usable data from the succeeded portion.
 * isRetryable: true — retrying may complete the failed portions.
 *
 * WORKER BEHAVIOR: catch this, use partialResult, mark meeting as PARTIAL.
 * Do NOT re-throw unless the worker cannot handle partial data.
 */
export class AIPipelinePartialError extends AIPipelineError {
  /** The partial result — ALWAYS use this data, never discard it */
  public readonly partialResult: ExtractionResultWithMeta | PipelineResult;

  constructor(
    message: string,
    partialResult: ExtractionResultWithMeta | PipelineResult,
    requestId: string | null = null,
    meetingId: string | null = null
  ) {
    super(message, true, requestId, meetingId);
    this.partialResult = partialResult;
  }
}

/**
 * Thrown on HTTP 422 when the error is NOT a Pydantic validation error —
 * specifically when the AI pipeline itself failed because OpenAI was unavailable,
 * rate-limited, or returned a malformed response.
 * isRetryable: true — the AI pipeline service is up and healthy; OpenAI may recover.
 *
 * Distinguished from AIPipelineValidationError by: response.data.success === false
 * AND response.data.error.error_code !== 'VALIDATION'.
 */
export class AIPipelineTotalFailureError extends AIPipelineError {
  constructor(
    message: string,
    requestId: string | null = null,
    meetingId: string | null = null
  ) {
    super(message, true, requestId, meetingId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INVARIANT ERRORS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Thrown on HTTP 500 with non_retryable: true in the error envelope.
 * This means the AI pipeline has a known invariant violation (an internal bug
 * the pipeline itself detected and classified as non-retryable).
 * isRetryable: false — retrying will always 500.
 * OPERATIONAL ACTION: page the on-call team IMMEDIATELY. This is an AI pipeline bug.
 */
export class AIPipelineInvariantError extends AIPipelineError {
  constructor(
    message: string,
    requestId: string | null = null,
    meetingId: string | null = null
  ) {
    super(message, false, requestId, meetingId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CIRCUIT BREAKER ERRORS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Thrown when the circuit breaker is OPEN and no HTTP call was made.
 * isRetryable: false — the worker should delay the Bull job (park it) and wait
 * for the circuit's openTimeoutMs before the circuit enters HALF_OPEN.
 * Do NOT set Bull retry on this — instead use job.moveToDelayed().
 */
export class AIPipelineCircuitOpenError extends AIPipelineError {
  /** How long (ms) until the circuit will probe again */
  public readonly waitMs: number;

  constructor(message: string, waitMs: number = 30_000) {
    super(message, false, null, null);
    this.waitMs = waitMs;
  }
}
