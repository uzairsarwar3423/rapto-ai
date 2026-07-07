// ─────────────────────────────────────────────────────────────────────────────
// ai-pipeline.types.ts
// TypeScript interfaces that are the EXACT counterpart to FastAPI Pydantic models.
// These are the single source of truth for request/response shapes on the Node.js side.
//
// RULE: Every field maps Python types to TypeScript:
//   Optional[str]  → string | null     (NOT string | undefined)
//   float [0,1]    → number (see JSDoc)
//   datetime       → string (ISO 8601 UTC)
//   list[T]        → T[]
//   dict[str, T]   → Record<string, T>
//
// SYNC: These interfaces must be kept in sync with the FastAPI Pydantic models.
// Any drift between these types and the Python models will produce a 422 at runtime
// (Pydantic validation error). That is the intended signal — fix the types, not the
// Pydantic model.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// SHARED / PRIMITIVE TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cost tracking record returned by the AI pipeline for every LLM call.
 * estimated_cost_usd is a float — do NOT round until display.
 */
export interface CostRecord {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  /** Floating-point USD cost. May be very small (e.g. 0.00012). */
  estimated_cost_usd: number;
}

/**
 * Structured error envelope returned in response body on AI pipeline failures.
 * non_retryable: true means the AI pipeline determined that retrying will never help.
 */
export interface ErrorEnvelope {
  error_code: string;
  message: string;
  request_id: string;
  details: Record<string, unknown> | null;
  non_retryable?: boolean;
}

/**
 * Confidence flags attached to a cleaned transcript turn.
 * Maps Python's ConfidenceFlag Pydantic model.
 */
export interface ConfidenceFlag {
  flag_type: string;
  reason: string;
}

/**
 * Calibration flag attached to an extracted commitment.
 * Used to signal extraction confidence calibration metadata.
 */
export interface CalibrationFlag {
  flag_type: string;
  reason: string;
}

/**
 * Result of the date parser (Day 51 integration).
 * due_date_resolution is attached to ParsedCommitment when the extractor
 * successfully resolved a relative date expression (e.g., "by end of week").
 */
export interface DateParseResult {
  parsed_date_utc: string;   // ISO 8601 UTC
  /** Float in [0.0, 1.0] */
  confidence: number;
  reference_date: string;    // ISO 8601 — the anchor date used for relative resolution
  timezone: string;          // IANA timezone string used during parsing
  is_relative: boolean;      // true if the original expression was relative ("next Friday")
}

// ─────────────────────────────────────────────────────────────────────────────
// PARTICIPANT MAP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Info about a single participant — used both as values in the participant map
 * (for cleanup) and as array elements (for extract/resolve).
 */
export interface ParticipantInfo {
  name: string;
  user_id: string | null;
  email: string | null;
  speaker_tag: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSCRIPT — CLEANUP ENDPOINT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single raw transcript turn as received from Recall.ai.
 * Maps Python's RawTranscriptTurn Pydantic model.
 */
export interface RawTranscriptTurn {
  speaker: string;
  text: string;
  start_timestamp: number;   // Unix epoch seconds (float)
  end_timestamp: number;     // Unix epoch seconds (float)
}

/**
 * A single cleaned transcript turn returned by /transcripts/cleanup.
 * Maps Python's CleanedTranscriptTurn Pydantic model.
 */
export interface CleanedTranscriptTurn {
  turn_id: string;
  cleaned_text: string;
  original_text: string;
  speaker_name: string;
  speaker_user_id: string | null;
  start_time: number;        // Unix epoch seconds (float)
  end_time: number;          // Unix epoch seconds (float)
  filler_words_removed: number;
  was_modified: boolean;
  was_modified_suspiciously: boolean;
  uncertain: boolean;
  confidence_detail: ConfidenceFlag;
}

/**
 * Metadata returned alongside the cleaned transcript.
 * Used for observability and calibration.
 */
export interface CleanupMetadata {
  model_version: string;
  prompt_version: string;
  total_filler_words_removed: number;
  processing_time_ms: number;
}

/** Request body for POST /transcripts/cleanup */
export interface CleanupRequest {
  meeting_id: string;
  team_id: string;
  raw_transcript: RawTranscriptTurn[];
  /** Key is speaker_tag (e.g. "speaker_0"), value is participant info */
  participants: Record<string, ParticipantInfo>;
}

/** Success response body from POST /transcripts/cleanup (HTTP 200) */
export interface CleanupResult {
  meeting_id: string;
  team_id: string;
  cleaned_transcript: CleanedTranscriptTurn[];
  metadata: CleanupMetadata;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTRACTION — /extract ENDPOINT
// ─────────────────────────────────────────────────────────────────────────────

/** Request body for POST /extract */
export interface ExtractRequest {
  meeting_id: string;
  team_id: string;
  /** ISO 8601 UTC datetime string */
  meeting_date: string;
  meeting_title: string;
  meeting_duration_seconds: number | null;
  /** IANA timezone string, required for date resolution (Day 51) */
  team_timezone: string;
  cleaned_transcript: CleanedTranscriptTurn[];
  participants: ParticipantInfo[];
}

/**
 * A single extracted commitment with all enrichment fields.
 * Maps Python's ParsedCommitment Pydantic model.
 */
export interface ParsedCommitment {
  text: string;
  owner_name: string;
  due_date_raw: string | null;
  due_date_utc: string | null;         // ISO 8601 UTC
  /** Float in [0.0, 1.0] — model-assigned extraction confidence */
  confidence: number;
  normalized_text: string;
  dedup_key: string;
  calibration_flag: CalibrationFlag | null;
  due_date_resolution: DateParseResult | null;
}

/**
 * A single extracted action item.
 * Maps Python's ParsedActionItem Pydantic model.
 */
export interface ParsedActionItem {
  text: string;
  owner_name: string;
  /** Float in [0.0, 1.0] */
  confidence: number;
}

/**
 * A single extracted decision.
 * Maps Python's ParsedDecision Pydantic model.
 */
export interface ParsedDecision {
  text: string;
  context: string;
  /** Float in [0.0, 1.0] */
  confidence: number;
}

/**
 * A single extracted blocker.
 * Maps Python's ParsedBlocker Pydantic model.
 */
export interface ParsedBlocker {
  text: string;
  owner_name: string | null;
  /** Float in [0.0, 1.0] */
  confidence: number;
}

/**
 * Full extraction result with per-request cost and chunk metadata.
 * Maps Python's ExtractionResultWithMeta Pydantic model.
 * Returned on HTTP 200 from POST /extract.
 */
export interface ExtractionResultWithMeta {
  meeting_id: string;
  team_id: string;
  commitments: ParsedCommitment[];
  action_items: ParsedActionItem[];
  decisions: ParsedDecision[];
  blockers: ParsedBlocker[];
  summary: string;
  /** FULL = all transcript chunks succeeded; PARTIAL_FIRST_CHUNK = only the first chunk's summary */
  summary_scope: 'FULL' | 'PARTIAL_FIRST_CHUNK';
  extraction_model: string;
  prompt_version: string;
  chunks_total: number;
  chunks_succeeded: number;
  total_cost: CostRecord;
  per_chunk_costs: CostRecord[];
  processing_time_ms: number;
}

/**
 * Partial failure payload — returned when some (but not all) chunks failed.
 * The usable partial data is in partial_result.
 * Maps Python's PartialExtractionFailure Pydantic model.
 */
export interface PartialExtractionFailure {
  meeting_id: string;
  team_id: string;
  failed_chunks: number[];
  error_message: string;
  partial_result: ExtractionResultWithMeta;
}

/**
 * Top-level response envelope from POST /extract.
 * HTTP 200: success=true, result is ExtractionResultWithMeta
 * HTTP 206: success=true, result is PartialExtractionFailure
 * HTTP 422: success=false, result may contain partial or null
 */
export interface ExtractResponse {
  success: boolean;
  request_id: string;
  result: ExtractionResultWithMeta | PartialExtractionFailure | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// RESOLUTION — /resolve ENDPOINT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A historical commitment from PostgreSQL, shaped for the resolver.
 * Maps Python's HistoricalCommitment Pydantic model.
 * IMPORTANT: owner_id and owner_name are BOTH required — the resolver uses
 * owner_name for matching (names appear in transcripts, not IDs).
 */
export interface HistoricalCommitment {
  id: string;
  owner_id: string;
  owner_name: string;
  text: string;
  normalized_text: string;
  status: 'PENDING' | 'DEFERRED';
  due_date_utc: string | null;         // ISO 8601 UTC
  created_at: string;                  // ISO 8601 UTC
  meeting_id: string;
  source_meeting_date: string | null;  // ISO 8601 UTC
}

/** Request body for POST /resolve */
export interface ResolveRequest {
  meeting_id: string;
  team_id: string;
  /** ISO 8601 UTC datetime string */
  meeting_date: string;
  meeting_duration_seconds: number | null;
  /** IANA timezone string */
  team_timezone: string;
  new_commitments: ParsedCommitment[];
  historical_commitments: HistoricalCommitment[];
}

/**
 * A resolved commitment pair — one historical commitment matched to a new
 * commitment that fulfills it, with detection metadata.
 * Maps Python's ResolvedCommitmentUpdate Pydantic model.
 */
export interface ResolvedCommitmentUpdate {
  historical_commitment_id: string;
  historical_commitment_text: string;
  resolved_by_new_commitment: ParsedCommitment;
  /** Float in [0.0, 1.0] — Stage 2 detection confidence (or 1.0 for Stage 1 only) */
  detection_confidence: number;
  /** Float in [0.0, 1.0] — embedding cosine similarity from Stage 1 */
  similarity_score: number;
  prompt_version: string;
}

/**
 * A historical commitment that was referenced in the current meeting
 * but NOT resolved. detection_status distinguishes between:
 *   NOT_RESOLVED — the model looked and determined it was not resolved
 *   DETECTION_FAILED — the Stage 2 call to OpenAI failed; unknown status
 */
export interface NotResolvedReference {
  historical_commitment_id: string;
  historical_commitment_text: string;
  referenced_by_new_commitment: ParsedCommitment;
  detection_status: 'NOT_RESOLVED' | 'DETECTION_FAILED';
}

/**
 * Aggregate stats from the resolution pipeline run.
 * Used for observability and cost monitoring.
 */
export interface ResolvePipelineStats {
  new_commitments_count: number;
  historical_pool_size: number;
  resolved_count: number;
  not_resolved_count: number;
  stage1_matches: number;
  stage2_calls: number;
  processing_time_ms: number;
}

/**
 * Partial failure metadata — used when some detection calls failed.
 * These commitment IDs go into pending_detections for later retry.
 */
export interface PartialResolutionFailure {
  failed_historical_ids: string[];
  error_message: string;
}

/**
 * Full pipeline result from POST /resolve (HTTP 200 or HTTP 206).
 * Maps Python's PipelineResult Pydantic model.
 */
export interface PipelineResult {
  meeting_id: string;
  team_id: string;
  /** The new commitments from this meeting (possibly enriched by the resolver) */
  new_commitments: ParsedCommitment[];
  /** Historical commitments that were resolved in this meeting */
  resolved_updates: ResolvedCommitmentUpdate[];
  /** Historical commitments that were referenced but NOT resolved */
  not_resolved_references: NotResolvedReference[];
  /** Historical commitments with no reference in this meeting — status unchanged */
  unchanged_commitments: HistoricalCommitment[];
  /** Non-null on HTTP 206 — contains IDs of commitments whose detection failed */
  partial_failure: PartialResolutionFailure | null;
  stats: ResolvePipelineStats;
}

/**
 * Top-level response envelope from POST /resolve.
 * HTTP 200: success=true, partial=false, result is PipelineResult
 * HTTP 206: success=true, partial=true, result is PipelineResult with partial_failure set
 * HTTP 422: success=false, result=null, error is ErrorEnvelope
 */
export interface ResolveResponse {
  success: boolean;
  partial: boolean;
  request_id: string;
  result: PipelineResult | null;
  error: ErrorEnvelope | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// HEALTH / READINESS
// ─────────────────────────────────────────────────────────────────────────────

/** Response from GET /health */
export interface HealthResponse {
  status: 'ok';
}

/** Response from GET /ready */
export interface ReadyResponse {
  status: 'ready' | 'not_ready';
  checks: {
    mongodb: boolean;
    redis: boolean;
    openai: boolean;
  };
}
