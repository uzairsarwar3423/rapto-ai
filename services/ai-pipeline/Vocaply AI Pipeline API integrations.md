# Vocaply — AI Pipeline ↔ API Service Integration Plan
## Node.js API Service → FastAPI AI Pipeline: Complete Connection Architecture
> Principal Backend Engineer (25+ yrs) + Principal AI/RAG Engineer Edition
> Stack: Node.js (TypeScript) · FastAPI (Python) · BullMQ · Axios · Redis · Docker
> Document: AI-PIPELINE-INTEGRATION-001 | Version 1.0 | Planning Only — No Code

---

## 0. Integration at a Glance

```
┌─────────────────────────────────────────────────────────────────────┐
│                         VOCAPLY PLATFORM                             │
│                                                                       │
│  ┌─────────────────────┐          ┌──────────────────────────────┐   │
│  │   NODE.JS API        │          │   PYTHON AI PIPELINE          │   │
│  │   SERVICE            │          │   SERVICE                     │   │
│  │                     │  HTTP    │                               │   │
│  │  ┌───────────────┐  │◄────────►│  POST /transcripts/cleanup    │   │
│  │  │transcribe     │  │  POST    │  POST /extract                │   │
│  │  │.worker.ts     │  │  JSON    │  POST /resolve                │   │
│  │  └───────────────┘  │  +Auth   │  GET  /health                 │   │
│  │  ┌───────────────┐  │          │  GET  /ready                  │   │
│  │  │extract        │  │          │                               │   │
│  │  │.worker.ts     │  │          │  ┌─────────────────────────┐  │   │
│  │  └───────────────┘  │          │  │  OpenAI GPT-4.1 Mini    │  │   │
│  │  ┌───────────────┐  │          │  │  GPT-4.1 (full model)   │  │   │
│  │  │resolve        │  │          │  └─────────────────────────┘  │   │
│  │  │.worker.ts     │  │          └──────────────────────────────┘   │
│  │  └───────────────┘  │                                             │
│  │                     │                                             │
│  │  AI Pipeline Client │   ← The integration layer built today      │
│  │  (new: ai-pipeline  │                                             │
│  │   .client.ts)       │                                             │
│  └─────────────────────┘                                             │
│           │                              │                            │
│    ┌──────▼──────┐              ┌────────▼────────┐                  │
│    │  PostgreSQL  │              │     MongoDB      │                  │
│    │  Supabase    │              │  (Transcripts)   │                  │
│    └─────────────┘              └─────────────────┘                  │
│           │                                                           │
│    ┌──────▼──────┐                                                    │
│    │    Redis     │ ← BullMQ Queues                                   │
│    │   (BullMQ)   │                                                   │
│    └─────────────┘                                                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1. Integration Philosophy — Stated Explicitly

```
PRINCIPLE 1 — THE AI PIPELINE SERVICE IS A STATELESS COMPUTE SERVICE

  The AI Pipeline never owns data. It receives input, computes,
  returns output. Data persistence (MongoDB transcripts, PostgreSQL
  commitments) remains entirely in the Node.js service. The integration
  layer on the Node.js side is responsible for:
    a. Fetching data needed for AI calls (historical commitments from DB)
    b. Sending data to the AI service
    c. Persisting the AI service's output back to the appropriate DB

  This means the integration is ASYMMETRIC: Node.js orchestrates,
  the AI pipeline executes. Never the reverse.

PRINCIPLE 2 — WORKERS ARE THE INTEGRATION POINT, NOT THE ROUTE HANDLERS

  The Node.js HTTP route handlers (Express/Fastify routes) never call
  the AI Pipeline directly. All AI pipeline calls happen inside
  BullMQ workers. WHY: AI calls are slow (3-15 seconds), variable,
  and potentially fail. They must be async, retryable, and isolated
  from the user-facing HTTP request cycle.

PRINCIPLE 3 — EVERY AI PIPELINE CALL IS TYPED END-TO-END

  The Node.js side has TypeScript interfaces that mirror the FastAPI
  Pydantic models exactly. Any schema mismatch between the two services
  produces a TypeScript compile error on the Node.js side OR a Pydantic
  422 validation error from the FastAPI side — both are immediately
  visible, never silently wrong at runtime.

PRINCIPLE 4 — FAILURE IS EXPECTED AND DESIGNED FOR, NOT HANDLED AS
  AN AFTERTHOUGHT

  The AI Pipeline can fail for many reasons: OpenAI is rate-limited,
  the service is restarting, the network is briefly unavailable. None
  of these should result in a lost meeting or a broken user experience.
  The retry, fallback, and circuit-breaker logic built today is the
  mechanism that makes the system reliable despite unreliable components.

PRINCIPLE 5 — ONE AI PIPELINE CLIENT, USED BY ALL WORKERS

  All three workers (transcribe, extract, resolve) import and use the
  same AIPipelineClient class. This client owns: URL configuration,
  authentication header injection, request timeout, structured error
  parsing, and retry logic. No worker contains HTTP logic directly.
  The client is the single seam for changing the integration protocol,
  base URL, or auth mechanism.
```

---

## 2. What Gets Built on the Node.js Side

```
NEW FILES:
  src/services/ai-pipeline/
  ├── ai-pipeline.client.ts      ← The core HTTP client (Axios-based)
  ├── ai-pipeline.types.ts       ← TypeScript interfaces mirroring FastAPI schemas
  ├── ai-pipeline.errors.ts      ← Typed error hierarchy for AI pipeline failures
  └── ai-pipeline.circuit-breaker.ts ← Circuit breaker using opossum or custom

MODIFIED FILES:
  src/workers/transcribe.worker.ts  ← Add cleanup step after Recall.ai webhook
  src/workers/extract.worker.ts     ← Wire to /extract endpoint + DB write
  src/workers/resolve.worker.ts     ← NEW WORKER: wire to /resolve endpoint

  src/config/env.ts                 ← Add AI_PIPELINE_URL, AI_PIPELINE_SECRET
  src/queues/queue-definitions.ts   ← Add resolve queue definition

  .env.example                      ← Add AI_PIPELINE_URL, AI_PIPELINE_SECRET
  docker-compose.yml                ← Add ai-pipeline service definition

  src/monitoring/health.ts          ← Add AI pipeline readiness to /ready check
```

---

## 3. File-by-File Implementation Plan (Node.js Side)

### 3.1 `src/services/ai-pipeline/ai-pipeline.types.ts`

**Purpose:** TypeScript interfaces that are the exact counterpart to the FastAPI Pydantic models. These are the single source of truth for request/response shapes on the Node.js side. They must mirror the Python schemas byte-for-byte.

**Interfaces to define:**

```
CLEANUP REQUEST/RESPONSE:
  CleanupRequest {
    meeting_id: string
    team_id: string
    raw_transcript: RawTranscriptTurn[]   // mirrors RawTranscriptTurn Pydantic
    participants: Record<string, ParticipantInfo>  // ParticipantMap
  }
  CleanupResult {
    meeting_id: string
    team_id: string
    cleaned_transcript: CleanedTranscriptTurn[]
    metadata: CleanupMetadata
  }
  CleanedTranscriptTurn {
    turn_id: string
    cleaned_text: string
    original_text: string
    speaker_name: string
    speaker_user_id: string | null
    start_time: number
    end_time: number
    filler_words_removed: number
    was_modified: boolean
    was_modified_suspiciously: boolean
    uncertain: boolean
    confidence_detail: ConfidenceFlag
  }

EXTRACT REQUEST/RESPONSE:
  ExtractRequest {
    meeting_id: string
    team_id: string
    meeting_date: string  // ISO 8601 UTC datetime string
    meeting_title: string
    meeting_duration_seconds: number | null
    team_timezone: string  // IANA timezone string (added Day 51)
    cleaned_transcript: CleanedTranscriptTurn[]
    participants: ParticipantInfo[]
  }
  ExtractionResultWithMeta {
    meeting_id: string
    team_id: string
    commitments: ParsedCommitment[]
    action_items: ParsedActionItem[]
    decisions: ParsedDecision[]
    blockers: ParsedBlocker[]
    summary: string
    summary_scope: 'FULL' | 'PARTIAL_FIRST_CHUNK'
    extraction_model: string
    prompt_version: string
    chunks_total: number
    chunks_succeeded: number
    total_cost: CostRecord
    per_chunk_costs: CostRecord[]
    processing_time_ms: number
  }
  ParsedCommitment {
    text: string
    owner_name: string
    due_date_raw: string | null
    due_date_utc: string | null  // ISO 8601 UTC (from Day 51 date parser)
    confidence: number
    normalized_text: string
    dedup_key: string
    calibration_flag: CalibrationFlag
    due_date_resolution: DateParseResult | null
  }
  // ... ParsedActionItem, ParsedDecision, ParsedBlocker follow same pattern

RESOLVE REQUEST/RESPONSE:
  ResolveRequest {
    meeting_id: string
    team_id: string
    meeting_date: string
    meeting_duration_seconds: number | null
    team_timezone: string
    new_commitments: ParsedCommitment[]
    historical_commitments: HistoricalCommitment[]
  }
  HistoricalCommitment {
    id: string
    owner_id: string
    owner_name: string
    text: string
    normalized_text: string
    status: 'PENDING' | 'DEFERRED'
    due_date_utc: string | null
    created_at: string
    meeting_id: string
    source_meeting_date: string | null
  }
  ResolveResponse {
    success: boolean
    partial: boolean
    request_id: string
    result: PipelineResult | null
    error: ErrorEnvelope | null
  }
  PipelineResult {
    meeting_id: string
    team_id: string
    new_commitments: ParsedCommitment[]
    resolved_updates: ResolvedCommitmentUpdate[]
    not_resolved_references: NotResolvedReference[]
    unchanged_commitments: HistoricalCommitment[]
    partial_failure: PartialResolutionFailure | null
    stats: ResolvePipelineStats
  }
  ResolvedCommitmentUpdate {
    historical_commitment_id: string
    historical_commitment_text: string
    resolved_by_new_commitment: ParsedCommitment
    detection_confidence: number
    similarity_score: number
    prompt_version: string
  }

HEALTH/READY:
  HealthResponse { status: 'ok' }
  ReadyResponse {
    status: 'ready' | 'not_ready'
    checks: {
      mongodb: boolean
      redis: boolean
      openai: boolean
    }
  }

SHARED TYPES:
  CostRecord { input_tokens: number; output_tokens: number;
               total_tokens: number; estimated_cost_usd: number }
  ErrorEnvelope { error_code: string; message: string;
                  request_id: string; details: Record<string,unknown> | null;
                  non_retryable?: boolean }
  ExtractResponse {
    success: boolean
    request_id: string
    result: ExtractionResultWithMeta | PartialExtractionFailure
  }
```

**Why TypeScript interfaces mirror Python Pydantic models exactly (naming, field types, optionality):**

If a Python field is `Optional[str]` (Python None → JSON null), the TypeScript must be `string | null`, not `string | undefined`. If a Python field is `float` constrained to [0.0, 1.0], TypeScript should document this as a comment on the `number` type. The interfaces do not enforce runtime constraints (TypeScript is erased at runtime) but they make mismatches visible at compile time — the compiler becomes the contract validator.

### 3.2 `src/services/ai-pipeline/ai-pipeline.errors.ts`

**Purpose:** A typed error hierarchy so every part of the Node.js codebase that calls the AI pipeline can distinguish error types without parsing error message strings.

**Error classes:**

```
AIPipelineError (base):
  - message: string
  - requestId: string | null (from X-Request-ID response header)
  - meetingId: string | null (from the request context)

AIPipelineNetworkError extends AIPipelineError:
  - Thrown on connection refused, ECONNRESET, ETIMEDOUT
  - axiosError: AxiosError (the raw cause, for logging)
  - isRetryable: true (always — network errors are transient)

AIPipelineTimeoutError extends AIPipelineError:
  - Thrown when request exceeds the configured timeout
  - elapsedMs: number
  - isRetryable: true

AIPipelineAuthError extends AIPipelineError:
  - Thrown on HTTP 401 (wrong or missing shared secret)
  - isRetryable: false (auth errors need human intervention, not retry)

AIPipelineValidationError extends AIPipelineError:
  - Thrown on HTTP 422 (the Node.js side sent an invalid payload)
  - validationDetails: unknown (the Pydantic error detail from the response)
  - isRetryable: false (a 422 from Pydantic means the payload is structurally
    wrong — retrying with the same payload will always 422 again)

AIPipelinePartialError extends AIPipelineError:
  - Thrown when HTTP 206 is returned (partial failure)
  - partialResult: ExtractionResultWithMeta | PipelineResult (the usable partial data)
  - isRetryable: true (the partial data can be used; a retry may complete the missing parts)

AIPipelineTotalFailureError extends AIPipelineError:
  - Thrown when HTTP 422 is returned from /resolve or /extract
    (not the Pydantic-422 case — the OpenAI-total-failure-422 case)
  - isRetryable: true (this is an upstream dependency failure — retrying later may succeed)

AIPipelineInvariantError extends AIPipelineError:
  - Thrown when HTTP 500 with non_retryable: true is returned
  - isRetryable: false (internal AI pipeline bug — retrying will always 500)
  - ALERT IMMEDIATELY when this error is encountered (paged alert, not just a log)

AIPipelineCircuitOpenError extends AIPipelineError:
  - Thrown when the circuit breaker is OPEN (no call was made)
  - isRetryable: false (wait for the circuit to close — a retry timer handles this)
```

**Why a typed error hierarchy (not just `try/catch` on `AxiosError`):**

Without typed errors, every worker contains `if (error.response?.status === 422)` checks scattered across the codebase. When the API contract changes (a new error type, a new HTTP status), every one of those checks must be updated. With typed errors: the client converts all Axios errors into typed `AIPipelineError` subclasses; the workers catch specific subclasses; the error-handling policy for each type is defined once (in the worker's catch block) not repeated across workers.

### 3.3 `src/services/ai-pipeline/ai-pipeline.client.ts`

**Purpose:** The single HTTP client for all AI Pipeline calls. Wraps Axios with typed methods, auth injection, retry logic, request/response logging, and cost tracking.

**Configuration (from environment):**

```
interface AIPipelineClientConfig {
  baseUrl: string           // AI_PIPELINE_URL (e.g. http://ai-pipeline:8000)
  sharedSecret: string      // AI_PIPELINE_SECRET (the X-Internal-Service-Key value)
  timeoutMs: number         // AI_PIPELINE_TIMEOUT_MS (default: 30_000ms)
  retryAttempts: number     // AI_PIPELINE_MAX_RETRIES (default: 3)
  retryBaseDelayMs: number  // default: 1000 (exponential backoff base)
  retryMaxDelayMs: number   // default: 30_000 (maximum backoff cap)
}
```

**Core Axios instance setup:**

- `baseURL`: `config.baseUrl`
- `timeout`: `config.timeoutMs`
- Default headers on EVERY request:
  - `Content-Type: application/json`
  - `X-Internal-Service-Key: ${config.sharedSecret}` (the shared secret, always injected by the client — workers never touch auth headers)
  - `X-Service-Name: vocaply-api` (identifies the caller to the AI pipeline's logs — matches the platform-wide service identification convention)
  - `X-Request-ID: ${generateRequestId()}` (a new CUID per request — forwarded as-is by the AI pipeline, appears in both services' logs, enabling cross-service trace correlation without a dedicated trace propagation system)

**Request interceptor:**

Before every request, log a structured event:
```
{
  "event": "ai_pipeline_request_start",
  "service": "vocaply-api",
  "endpoint": req.url,
  "method": req.method,
  "meeting_id": req.data?.meeting_id,
  "request_id": req.headers['X-Request-ID'],
  "timestamp": ISO_NOW
}
```

**Response interceptor:**

After every response:
```
{
  "event": "ai_pipeline_request_complete",
  "status": res.status,
  "endpoint": res.config.url,
  "request_id": res.config.headers['X-Request-ID'],
  "latency_ms": res_timestamp - req_timestamp,
  "cost_usd": res.data?.result?.total_cost?.estimated_cost_usd ?? null
}
```

**Error interceptor → converts Axios errors to typed AIPipelineErrors:**

```
Network error (no response received) → AIPipelineNetworkError
Timeout (ETIMEDOUT, ECONNABORTED)    → AIPipelineTimeoutError
HTTP 401                             → AIPipelineAuthError (isRetryable: false)
HTTP 422 from Pydantic validation    → AIPipelineValidationError (isRetryable: false)
  (detect: response.data.detail is an array of Pydantic error objects)
HTTP 422 from OpenAI total failure   → AIPipelineTotalFailureError (isRetryable: true)
  (detect: response.data.success == false AND response.data.error.error_code != "VALIDATION")
HTTP 206                             → AIPipelinePartialError (isRetryable: true)
  (extract partial data from response before throwing)
HTTP 500 with non_retryable: true    → AIPipelineInvariantError (isRetryable: false)
HTTP 500 without non_retryable       → AIPipelineNetworkError (isRetryable: true)
  (generic 500, treat as transient)
```

**Retry logic (exponential backoff with jitter):**

```
RETRY POLICY:
  - Retry ONLY if error.isRetryable == true
  - Do NOT retry if circuit breaker is OPEN
  - Attempt N: delay = min(retryBaseDelayMs * 2^N + jitter, retryMaxDelayMs)
    where jitter = Math.random() * 1000 (prevents thundering herd)
  - After all retries exhausted: re-throw the last error (do not swallow)
  - Log each retry attempt as a structured event:
    {"event": "ai_pipeline_retry", "attempt": N, "max": retryAttempts,
     "error_type": error.constructor.name, "delay_ms": delay}

WHAT IS RETRIED:
  AIPipelineNetworkError:     YES (network blip — transient)
  AIPipelineTimeoutError:     YES (service was slow — may be momentary)
  AIPipelineTotalFailureError:YES (OpenAI was unavailable — retry later)
  AIPipelinePartialError:     YES (some chunks failed — retry may complete them)
  AIPipelineAuthError:        NO  (retrying with same wrong key is pointless)
  AIPipelineValidationError:  NO  (same payload will always fail)
  AIPipelineInvariantError:   NO  (internal bug — retry won't help)
  AIPipelineCircuitOpenError: NO  (circuit is open — respect the backoff)
```

**Public methods on AIPipelineClient:**

```typescript
// Cleanup
async cleanup(request: CleanupRequest): Promise<CleanupResult>

// Extraction
async extract(request: ExtractRequest): Promise<ExtractionResultWithMeta>
  // Returns ExtractionResultWithMeta for HTTP 200
  // Throws AIPipelinePartialError with .partialResult for HTTP 206
  // Throws AIPipelineTotalFailureError for HTTP 422 (total failure)

// Resolution
async resolve(request: ResolveRequest): Promise<PipelineResult>
  // Returns PipelineResult for HTTP 200
  // Throws AIPipelinePartialError with .partialResult for HTTP 206
  // Throws AIPipelineTotalFailureError for HTTP 422 (total failure)

// Health checks
async health(): Promise<HealthResponse>
async ready(): Promise<ReadyResponse>
```

**Singleton instantiation pattern:**

The client is instantiated once in `src/lib/ai-pipeline.ts` and exported as a module-level singleton — not re-instantiated per request, not injected via dependency injection (the existing Node.js codebase uses direct imports, not a DI container; the client follows this convention). Worker files import this singleton directly.

### 3.4 `src/services/ai-pipeline/ai-pipeline.circuit-breaker.ts`

**Purpose:** Prevents cascading failures when the AI Pipeline service is down. If N consecutive calls fail, the circuit opens — subsequent calls fail immediately (without making an HTTP request) until a probe call succeeds.

**Pattern: Three-state circuit breaker (CLOSED → OPEN → HALF_OPEN → CLOSED)**

```
CLOSED (normal operation):
  All calls go through. Failures are counted.
  If failure count >= FAILURE_THRESHOLD within FAILURE_WINDOW_MS:
    → Transition to OPEN

OPEN (service assumed down):
  All calls fail immediately with AIPipelineCircuitOpenError (no HTTP call made).
  After OPEN_TIMEOUT_MS has elapsed:
    → Transition to HALF_OPEN

HALF_OPEN (probing recovery):
  The NEXT call is allowed through (probe call).
  If probe succeeds: → Transition to CLOSED (reset failure count)
  If probe fails: → Back to OPEN (reset OPEN_TIMEOUT_MS timer)
```

**Configuration constants (in env.ts):**

```
AI_PIPELINE_CIRCUIT_FAILURE_THRESHOLD=5   // consecutive failures to open
AI_PIPELINE_CIRCUIT_WINDOW_MS=60000       // 1 minute window for counting failures
AI_PIPELINE_CIRCUIT_OPEN_TIMEOUT_MS=30000 // 30s before probing
```

**What counts as a failure (for the circuit breaker failure counter):**
- `AIPipelineNetworkError` — YES (service unreachable)
- `AIPipelineTimeoutError` — YES (service not responding)
- `AIPipelineTotalFailureError` — NO (this is an OpenAI issue, not an AI pipeline service issue — the AI pipeline IS reachable, it just couldn't call OpenAI)
- `AIPipelinePartialError` — NO (service is up and responding)
- `AIPipelineAuthError` — NO (auth issue, not service health)
- `AIPipelineValidationError` — NO (request issue, not service health)

**Circuit breaker scope:**
One circuit breaker per SERVICE (not per endpoint). If /extract is failing, /cleanup calls are also blocked — because all three endpoints are in the same service instance. If they were in separate services, separate circuit breakers would be needed.

**Integration with AIPipelineClient:**
The circuit breaker wraps every call in `AIPipelineClient`. Before making an HTTP request, the client checks the circuit state:
- OPEN → throw `AIPipelineCircuitOpenError` immediately (no network call)
- CLOSED/HALF_OPEN → make the call; on result, update circuit state

**Alert on circuit open:**
When the circuit transitions to OPEN: emit a critical structured log event AND trigger a platform alert (e.g. Slack webhook, PagerDuty — whatever the platform's alerting system supports). "AI pipeline circuit open" is an operational condition requiring human investigation, not just a log to discover later.

### 3.5 `src/config/env.ts` (Extension)

**New environment variables:**

```typescript
// AI Pipeline Service
AI_PIPELINE_URL: z.string().url()
  // default: 'http://ai-pipeline:8000' (Docker Compose service name)
  // staging: 'http://ai-pipeline-staging:8000'
  // production: 'https://ai-pipeline.internal.vocaply.com' (private network)

AI_PIPELINE_SECRET: z.string().min(32)
  // The X-Internal-Service-Key value. Must match FASTAPI's API_SHARED_SECRET.
  // Minimum 32 characters enforced — prevents accidentally using "dev" or "secret"

AI_PIPELINE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000)
  // Per-request timeout. Conservative default: 30s.
  // /transcripts/cleanup: typically 5-8s
  // /extract: typically 4-8s (single-chunk) or up to 30s (multi-chunk 2hr meeting)
  // /resolve: typically 1-3s

AI_PIPELINE_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(3)

AI_PIPELINE_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(1_000)

AI_PIPELINE_CIRCUIT_FAILURE_THRESHOLD: z.coerce.number().int().positive().default(5)

AI_PIPELINE_CIRCUIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000)

AI_PIPELINE_CIRCUIT_OPEN_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000)
```

**Fail-fast validation:**
All new variables are added to the existing Zod schema. The Node.js process fails at startup if any required variable is missing or invalid — same fail-fast discipline as the FastAPI service's `settings.py`. A missing `AI_PIPELINE_URL` discovered on the first production request is a much more expensive problem than discovering it at process boot.

### 3.6 `src/workers/transcribe.worker.ts` (Extension)

**Current state (before this plan):** Receives Recall.ai webhook, stores raw transcript in MongoDB, marks meeting status as TRANSCRIBED.

**After this plan:** Adds a cleanup step that calls the AI Pipeline before storing.

**New flow:**

```
STEP 1 (existing): Receive Recall.ai webhook payload
STEP 2 (existing): Validate and parse raw transcript
STEP 3 (existing): Look up meeting in PostgreSQL, get team_id and participant map
STEP 4 (NEW): Build CleanupRequest from raw transcript + participant map
  - Fetch participant map from the meeting's meeting_participants table
    (or from the webhook payload if Recall.ai includes it)
  - Build RawTranscriptTurn[] from Recall.ai's word-level turn objects
  - Call aipipelineClient.cleanup(request) with a 60s timeout override
    (cleanup is safe to wait longer for — it's async background work)

STEP 5 (NEW): Handle cleanup response
  SUCCESS (CleanupResult received):
    - Store BOTH raw_transcript AND cleaned_transcript in MongoDB document
      (the AI pipeline returns cleaned; the worker stores both per Day 47's plan)
    - Store cleanup_metadata (model version, prompt version, fillers removed etc.)
    - Mark meeting status: TRANSCRIBED → TRANSCRIPT_CLEANED
    - Push meeting_id onto the extract queue (BullMQ) to trigger extraction

  PARTIAL FAILURE (never expected from /cleanup, but defensive handling):
    - Log structured warning
    - Store raw_transcript only, mark status: TRANSCRIPT_CLEANUP_FAILED
    - Push to a DLQ (dead letter queue) for manual review/retry

  AIPipelineNetworkError / Timeout (after all retries):
    - Do NOT fail the entire job yet. The cleanup is retryable.
    - Bull's built-in job retry mechanism handles this: the transcribe
      job itself fails and is retried (up to job_max_attempts, separately
      from the client's own retries). The raw transcript is already in
      MongoDB from Step 2 if persisted early.
    - NOTE: if cleanup retries are exhausted after Bull's attempts:
      store raw transcript only, mark status: TRANSCRIPT_CLEANUP_DEGRADED,
      push to extract queue with cleaned=False flag (extraction works on
      raw text in degraded mode — accuracy is lower but the meeting is not lost).

  AIPipelineAuthError:
    - ALERT IMMEDIATELY. Auth errors are configuration problems.
    - Fail the job as non-retryable (Bull sets removeOnFail: false).

STEP 6 (modified): Emit Socket.io meeting:transcript_cleaned event
  (previously: meeting:transcribed — name updated to reflect new status)

QUEUE CONFIGURATION FOR transcribe.worker:
  Queue name: 'transcribe'
  Concurrency: 5 (same as before — cleanup is now part of the transcription job)
  Timeout: 90s per job (increased from previous to accommodate cleanup call)
  Retry attempts: 3 with exponential backoff
  backoffType: 'exponential'
  backoffDelay: 5000 (5s base, gives AI pipeline time to recover from transient issues)
```

### 3.7 `src/workers/extract.worker.ts` (Extension)

**Current state (before this plan):** Placeholder or basic structure.

**After this plan:** Full extraction worker.

**Trigger:** Receives a job from the `extract` queue (pushed by transcribe.worker on success).

**Job payload:**
```typescript
interface ExtractJob {
  meeting_id: string
  team_id: string
  cleaned_transcript_available: boolean  // false in degraded mode
}
```

**New flow:**

```
STEP 1: Fetch cleaned_transcript from MongoDB (by meeting_id)
  - If cleaned_transcript_available=false (degraded mode):
    fetch raw_transcript and use that instead, log a warning
    ("extracting from raw transcript — cleanup was unavailable")

STEP 2: Fetch meeting metadata from PostgreSQL
  (meeting_date, meeting_title, meeting_duration_seconds, participants,
  team_timezone from the team's settings)

STEP 3: Fetch team_timezone from team settings
  (required by /extract since Day 51's date parser integration)

STEP 4: Build ExtractRequest — construct the full request payload

STEP 5: Call aipipelineClient.extract(request)
  - Timeout: 60s (multi-chunk long meetings can approach 30s; 60s is safe)

STEP 6: Handle extraction response
  SUCCESS (ExtractionResultWithMeta received):
    - Write to PostgreSQL:
      a. Insert commitments into `commitments` table (for each ParsedCommitment)
      b. Insert action_items into `action_items` table
      c. Insert decisions into `decisions` table
      d. Insert blockers into `blockers` table
      e. Update meetings table: summary, status=EXTRACTED, extraction_model,
         prompt_version, extraction_cost_usd (from total_cost)
    - Update MongoDB meeting document: extraction_metadata
    - Push to resolve queue: { meeting_id, team_id }
    - Emit Socket.io: meeting:extracted

  PARTIAL FAILURE (HTTP 206, AIPipelinePartialError caught):
    - Use partialError.partialResult — the extraction succeeded for most chunks
    - Write partial extraction data to PostgreSQL (same DB writes, partial data)
    - Mark meeting: status=EXTRACTED_PARTIAL, partial_chunks_failed
    - Push to resolve queue with partial flag
    - Emit Socket.io: meeting:extracted_partial
    - Log as WARNING (not ERROR — partial is usable)

  TOTAL FAILURE (AIPipelineTotalFailureError):
    - Mark meeting: status=EXTRACTION_FAILED
    - Do NOT push to resolve queue
    - Fail the Bull job → Bull retries per retry policy

STEP 7: PostgreSQL writes are transactional
  All inserts (commitments, action_items, decisions, blockers, meeting update)
  happen in a single database transaction. If any insert fails:
  the transaction rolls back, the Bull job fails, Bull retries.
  Partial writes to the commitments table without a corresponding meeting
  status update are the primary consistency bug to prevent here.

QUEUE CONFIGURATION FOR extract.worker:
  Queue name: 'extract'
  Concurrency: 3 (lower than transcribe — extraction calls are heavier)
  Timeout: 120s per job
  Retry attempts: 3
  backoffType: 'exponential'
  backoffDelay: 10000 (10s base — OpenAI rate limits need more recovery time)
```

### 3.8 `src/workers/resolve.worker.ts` (NEW)

**This is a brand-new worker file.**

**Trigger:** Receives a job from the `resolve` queue (pushed by extract.worker).

**Job payload:**
```typescript
interface ResolveJob {
  meeting_id: string
  team_id: string
  partial_extraction: boolean  // from extract.worker's partial flag
}
```

**Full flow:**

```
STEP 1: Fetch new_commitments from PostgreSQL
  Query: SELECT * FROM commitments
         WHERE meeting_id = $1 AND team_id = $2
         (these were just inserted by extract.worker)
  Map to ParsedCommitment[] (using the TypeScript interface)

STEP 2: Fetch historical_commitments from PostgreSQL
  This is the critical query — must return ONLY:
    a. status IN ('PENDING', 'DEFERRED')
    b. team_id = $1 (tenant-scoped)
    c. meeting_id != current_meeting_id (exclude current meeting)
    d. owner_id IN (owners of new_commitments) — OPTIONAL optimization:
       fetching only commitments owned by people who made new commitments
       reduces pool size and network payload, since the resolver is
       already owner-scoped. This optimization is correct ONLY if the
       Node.js-side owner matching uses user_id (not name-based). If
       some new commitments have no resolved user_id (unknown speakers),
       those owners cannot be pre-filtered — fetch all historical for the team
       and let the resolver handle owner matching.
    e. ORDER BY created_at DESC LIMIT 500 per owner
       (respects the resolver's MAX_HISTORICAL_POOL_SIZE per owner)

STEP 3: Fetch team_timezone from team settings (for ResolveRequest)

STEP 4: Build ResolveRequest and call aipipelineClient.resolve(request)
  - Timeout: 30s (resolver is fast; detection adds <5s on average)

STEP 5: Handle resolution response
  SUCCESS (PipelineResult received):

    a. RESOLVED updates:
       For each ResolvedCommitmentUpdate in result.resolved_updates:
         UPDATE commitments
         SET status='FULFILLED',
             fulfilled_at=NOW(),
             fulfilled_by_statement=update.resolved_by_new_commitment.text,
             detection_confidence=update.detection_confidence,
             similarity_score=update.similarity_score,
             resolution_prompt_version=update.prompt_version
         WHERE id=update.historical_commitment_id
           AND team_id=$team_id  // tenant safety — never update without this

    b. NOT_RESOLVED references:
       For each NotResolvedReference in result.not_resolved_references:
         IF detection_status == 'NOT_RESOLVED':
           UPDATE commitments
           SET last_referenced_at=NOW(),
               reference_count=reference_count+1
           WHERE id=ref.historical_commitment_id
             AND team_id=$team_id
         IF detection_status == 'DETECTION_FAILED':
           Record in a pending_detections table for later retry
           (the detection failed due to OpenAI, not because it's not resolved)

    c. NEW commitments:
       For each ParsedCommitment in result.new_commitments:
         These were already inserted by extract.worker.
         No additional DB action needed — they're already PENDING.
         Update them with normalized_text, dedup_key from the resolver's output
         (which may have resolved more fields than the extractor returned).

    d. UNCHANGED:
       No DB action. The historical commitments remain PENDING.
       Their next_reminder_at is managed by the cron job (Day 19's plan).

    e. Update meeting status: status=RESOLVED, resolution_complete=true

    f. Emit Socket.io events:
       - meeting:resolved (with counts: new, resolved, referenced, unchanged)
       - For each FULFILLED commitment:
         commitment:fulfilled { commitment_id, owner_id, text }
         (triggers in-app notification to the commitment's owner)

  PARTIAL FAILURE (HTTP 206, some detection calls failed):
    - Apply the RESOLVED updates from the partial result (safe — these are confirmed)
    - Apply the NOT_RESOLVED references
    - For each failed detection (in partial_failure.failed_historical_ids):
      Store in pending_detections table (to retry detection later via a
      dedicated retry cron job that calls /resolve again with just the
      failed items — OR let the NEXT meeting's resolve job catch them)
    - Mark meeting: resolution_partial=true

  TOTAL FAILURE (AIPipelineTotalFailureError):
    - Mark meeting: resolution_failed=true
    - Bull retries the entire resolve job

  AIPipelineCircuitOpenError:
    - Circuit is open — do NOT fail the job immediately
    - Add a delay (wait for circuit timeout) and retry:
      Bull job options: { delay: AI_PIPELINE_CIRCUIT_OPEN_TIMEOUT_MS }
    - This effectively "parks" the resolve job until the circuit heals

STEP 6: All DB operations in a single transaction (same discipline as extract.worker)

QUEUE CONFIGURATION FOR resolve.worker:
  Queue name: 'resolve'
  Concurrency: 5 (resolve calls are cheap — fast resolver + rare Stage 2 calls)
  Timeout: 60s per job
  Retry attempts: 3
  backoffType: 'exponential'
  backoffDelay: 5000
```

### 3.9 `src/queues/queue-definitions.ts` (Extension)

The existing queue definitions file gains one new queue:

```typescript
export const QUEUES = {
  TRANSCRIBE: 'transcribe',   // existing
  EXTRACT:    'extract',      // existing or new (wired today)
  RESOLVE:    'resolve',      // NEW
} as const;

export const QUEUE_CONFIGS = {
  [QUEUES.TRANSCRIBE]: {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: false,
    },
  },
  [QUEUES.EXTRACT]: {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 10000 },
      removeOnComplete: { count: 100 },
      removeOnFail: false,
    },
  },
  [QUEUES.RESOLVE]: {                          // NEW
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 200 },
      removeOnFail: false,
    },
  },
};
```

### 3.10 `src/monitoring/health.ts` (Extension)

The existing `/ready` route handler gains an AI pipeline readiness check:

```typescript
// Existing checks: PostgreSQL, Redis, MongoDB
// NEW check: AI Pipeline /ready endpoint

const aiPipelineCheck = async (): Promise<boolean> => {
  try {
    // Use a SHORT timeout for health checks (2s) — much less than
    // the normal request timeout (30s). A health check that takes
    // 30s is useless as a readiness indicator.
    const ready = await aipipelineClient.ready({ timeoutMs: 2000 });
    return ready.status === 'ready';
  } catch {
    return false;
  }
};

// /ready response now includes:
{
  "status": "ready" | "not_ready",
  "checks": {
    "postgresql": true,
    "redis": true,
    "mongodb": true,
    "ai_pipeline": true   // NEW
  }
}
```

**Important: The Node.js /ready is NOT blocked by the AI pipeline being down.**

If `ai_pipeline: false`, the Node.js `/ready` still returns HTTP 200 with the check showing false — it does NOT return HTTP 503. WHY: the Node.js API can operate without the AI pipeline for all non-AI features (user management, meeting listing, manual commitment entry, dashboards). Making the entire API service "not ready" because the AI pipeline is unavailable would prevent ALL users from using ANY feature, not just AI features. The `ai_pipeline` check is informational; it triggers monitoring alerts but does not affect the API's own readiness.

---

## 4. Data Flow Diagrams — Per Worker

### 4.1 Transcribe Worker Data Flow

```
Recall.ai Webhook
       │
       ▼
 transcribe.worker
       │
       ├─ 1. Parse raw_transcript[]
       ├─ 2. Fetch participants from DB
       ├─ 3. POST /transcripts/cleanup ──────────────► ai-pipeline:8000
       │                                                     │
       │     ◄──────────────────────────────── CleanupResult
       │
       ├─ 4. Write to MongoDB:
       │       { raw_transcript, cleaned_transcript, cleanup_metadata }
       │
       ├─ 5. Update PostgreSQL:
       │       meetings.status = 'TRANSCRIPT_CLEANED'
       │
       └─ 6. Push to Extract Queue
               { meeting_id, team_id }
```

### 4.2 Extract Worker Data Flow

```
Extract Queue
       │
       ▼
  extract.worker
       │
       ├─ 1. Fetch cleaned_transcript from MongoDB
       ├─ 2. Fetch meeting metadata from PostgreSQL
       ├─ 3. Fetch team_timezone from team settings
       ├─ 4. POST /extract ──────────────────────────► ai-pipeline:8000
       │                                                     │
       │     ◄────────────────────────── ExtractionResultWithMeta
       │
       ├─ 5. PostgreSQL transaction:
       │       INSERT INTO commitments (...)
       │       INSERT INTO action_items (...)
       │       INSERT INTO decisions (...)
       │       INSERT INTO blockers (...)
       │       UPDATE meetings SET status='EXTRACTED', summary=...
       │
       ├─ 6. Emit Socket.io: meeting:extracted
       │
       └─ 7. Push to Resolve Queue
               { meeting_id, team_id }
```

### 4.3 Resolve Worker Data Flow

```
Resolve Queue
       │
       ▼
  resolve.worker
       │
       ├─ 1. Fetch new_commitments from PostgreSQL
       │       (just inserted by extract.worker for this meeting)
       │
       ├─ 2. Fetch historical_commitments from PostgreSQL
       │       WHERE status IN ('PENDING','DEFERRED')
       │       AND team_id = $1 AND meeting_id != current
       │
       ├─ 3. POST /resolve ──────────────────────────► ai-pipeline:8000
       │                   (new_commitments + historical_commitments)      │
       │                                                                    │
       │     ◄──────────────────────────────────── PipelineResult
       │
       ├─ 4. PostgreSQL transaction:
       │       UPDATE commitments SET status='FULFILLED' (resolved_updates)
       │       UPDATE commitments SET last_referenced_at (not_resolved_refs)
       │       UPDATE meetings SET status='RESOLVED'
       │
       ├─ 5. Emit Socket.io:
       │       meeting:resolved
       │       commitment:fulfilled (per resolved item → owner notification)
       │
       └─ 6. (Future: push to digest queue for weekly summary generation)
```

---

## 5. Docker Compose Integration

**`docker-compose.yml` (additions for local development):**

```yaml
services:
  # Existing services (api, postgres, redis, mongodb) unchanged

  ai-pipeline:
    build:
      context: ./services/ai-pipeline
      dockerfile: Dockerfile.dev
    container_name: vocaply_ai_pipeline
    ports:
      - "8001:8000"   # expose on 8001 on host (8000 is taken by Node.js API)
                       # internal service-to-service: always on port 8000
    environment:
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      OPENAI_ORG_ID: ${OPENAI_ORG_ID:-}          # optional
      MONGODB_URL: mongodb://mongodb:27017/vocaply
      REDIS_URL: redis://redis:6379
      API_SHARED_SECRET: ${AI_PIPELINE_SECRET}    # MUST match Node.js side
      ENVIRONMENT: development
      LOG_LEVEL: DEBUG
      OPENAI_GPT41_MINI_MODEL_NAME: gpt-4.1-mini
      OPENAI_GPT41_MODEL_NAME: gpt-4.1
      OPENAI_EMBEDDING_MODEL_NAME: text-embedding-3-small
    depends_on:
      mongodb:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ./services/ai-pipeline/src:/app/src:ro  # hot-reload in dev
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s  # allow FastAPI startup time
    networks:
      - vocaply_internal

  # The existing 'api' service gains:
  api:
    environment:
      AI_PIPELINE_URL: http://ai-pipeline:8000   # internal network URL
      AI_PIPELINE_SECRET: ${AI_PIPELINE_SECRET}  # same secret as above
    depends_on:
      ai-pipeline:
        condition: service_healthy  # api waits for ai-pipeline to be healthy

networks:
  vocaply_internal:
    driver: bridge
```

**Why `ai-pipeline:8000` (not `localhost:8001`) for internal communication:**

Within a Docker Compose network, services communicate by service name + internal port. The Node.js `api` service reaches the Python service at `http://ai-pipeline:8000` — the service name resolves to the container's internal IP automatically. The `8001:8000` port mapping is ONLY for accessing the service from the developer's host machine (browser, Postman, curl from the host) — it is never used for service-to-service calls.

---

## 6. Environment Configuration — Full Inventory

**`.env.example` (additions):**

```bash
# ──────────────────────────────────────────────
# AI PIPELINE SERVICE
# ──────────────────────────────────────────────
AI_PIPELINE_URL=http://ai-pipeline:8000
# For running Node.js API locally WITHOUT Docker, pointing at a separate
# ai-pipeline instance:
# AI_PIPELINE_URL=http://localhost:8001

AI_PIPELINE_SECRET=change-me-min-32-chars-in-production-please-use-a-secure-secret
# This MUST match the FastAPI service's API_SHARED_SECRET environment variable.
# Generate with: openssl rand -hex 32

AI_PIPELINE_TIMEOUT_MS=30000
AI_PIPELINE_MAX_RETRIES=3
AI_PIPELINE_RETRY_BASE_DELAY_MS=1000
AI_PIPELINE_CIRCUIT_FAILURE_THRESHOLD=5
AI_PIPELINE_CIRCUIT_WINDOW_MS=60000
AI_PIPELINE_CIRCUIT_OPEN_TIMEOUT_MS=30000

# ──────────────────────────────────────────────
# OPENAI (used by AI Pipeline service, not by Node.js API directly)
# Both are needed in .env because docker-compose.yml passes them to
# the ai-pipeline container. The Node.js API service does NOT use these.
# ──────────────────────────────────────────────
OPENAI_API_KEY=sk-proj-...
OPENAI_ORG_ID=         # leave blank for personal accounts
```

**Shared secret management:**

In staging and production: `AI_PIPELINE_SECRET` is generated once (`openssl rand -hex 32`) and stored in the platform's secrets manager (AWS Secrets Manager, Doppler, or equivalent). Both services reference the same secret value. Rotating the secret requires updating both services simultaneously — this is a coordinated deploy, documented in the runbook.

---

## 7. Observability — Cross-Service Tracing

**The correlation mechanism: X-Request-ID**

Without a full distributed tracing system (Jaeger/Zipkin/OpenTelemetry), the `X-Request-ID` header is the primary mechanism for correlating logs across the two services. The flow:

```
1. Node.js worker creates a CUID for the AI pipeline call:
   request_id = cuid()  // or uses the Bull job's ID

2. Node.js AIPipelineClient injects it:
   headers['X-Request-ID'] = request_id

3. FastAPI middleware (Day 46's request_id.py) reads and propagates it:
   - Reads X-Request-ID from the incoming request
   - Sets it on the structlog context var
   - Echoes it in the response header

4. Every FastAPI log line for this request includes:
   {"request_id": "abc123", "event": "...", ...}

5. Node.js response interceptor reads the response header:
   response.headers['x-request-id']  // should match what was sent

6. Node.js logs its own event with the same request_id:
   {"event": "ai_pipeline_request_complete", "request_id": "abc123", ...}

RESULT: searching logs for "abc123" in any log aggregation tool
  (Axiom, Datadog, Elasticsearch) returns ALL log entries from BOTH
  services for that specific AI call, in chronological order.
  This is the minimum viable distributed tracing without infrastructure cost.
```

**Structured log events across the integration:**

```
Node.js side emits:
  ai_pipeline_request_start     (before HTTP call)
  ai_pipeline_retry             (on each retry attempt)
  ai_pipeline_request_complete  (on success)
  ai_pipeline_request_failed    (on final failure after retries)
  ai_pipeline_circuit_open      (when circuit transitions to OPEN — CRITICAL)
  ai_pipeline_circuit_closed    (when circuit recovers — INFO)

FastAPI side emits:
  request_received              (by middleware — per Day 46)
  cleanup_stage1_complete       (by transcript_cleaner)
  cleanup_stage2_batch_N        (by grammar_normalizer, per batch)
  resolver_complete             (by commitment_resolver)
  resolution_stage2_invoked     (by resolution_detector — key cost event)
  resolve_request_complete      (by route handler — the summary event)

Cross-service correlation: every matching pair of node.js/fastapi events
  shares the same request_id value in their log entries.
```

---

## 8. Security — Integration-Specific Considerations

```
SHARED SECRET ROTATION:
  When rotating AI_PIPELINE_SECRET:
  1. Generate new secret: openssl rand -hex 32
  2. Deploy new FastAPI service with new API_SHARED_SECRET
     (during brief rotation window: FastAPI service rejects old calls from Node.js)
  3. Deploy Node.js API with new AI_PIPELINE_SECRET
  TOTAL DOWNTIME WINDOW: seconds (one rolling deployment).
  ZERO-DOWNTIME ROTATION: possible by configuring FastAPI to accept
  BOTH old and new secrets during a transition window — add PREVIOUS_API_SHARED_SECRET
  to settings.py, accept either in verify_internal_service_key() for 15 minutes,
  then remove the old one in a follow-up deploy. Documented in the security runbook.

NETWORK ISOLATION:
  In production: the AI Pipeline service must NOT be accessible from the
  public internet. Only the Node.js API service's private network can reach it.
  Implementation: AI Pipeline has no public load balancer or public IP.
  It exists only on the internal VPC network. The Node.js API reaches it
  via private DNS (ai-pipeline.internal.vocaply.com → private IP).

PAYLOAD SIZE LIMITS:
  A 2-hour meeting's cleaned transcript can be 50-100KB of JSON.
  Node.js API must configure a request body size limit on the routes that
  receive Recall.ai webhooks (not the route that SENDS to AI Pipeline —
  Axios handles outbound size). The AI Pipeline FastAPI must also have
  max_request_size configured in Uvicorn/Starlette settings to prevent
  oversized payloads from consuming excessive memory.

CREDENTIAL LEAKAGE IN LOGS:
  AIPipelineClient's logging interceptors must NEVER log:
    - The X-Internal-Service-Key header value (the shared secret)
    - Full request body (may contain transcript content = PII)
  Safe to log: request URL, method, Content-Type, X-Request-ID, response status,
  latency, cost (from response body). This follows Day 47's "no full content at INFO"
  policy established on the FastAPI side.
```

---

## 9. Error Recovery Patterns — Decision Matrix

```
ERROR TYPE                    NODE.JS BEHAVIOR              DATABASE STATE
──────────────────────────────────────────────────────────────────────────
AIPipelineNetworkError        Bull retry (up to max)        Unchanged
(after all retries)           → meeting status: *_FAILED    until success

AIPipelineTimeoutError        Same as NetworkError          Same

AIPipelineAuthError           Fail job as non-retryable     Unchanged
                              ALERT IMMEDIATELY
                              (config problem — needs human)

AIPipelineValidationError     Fail job as non-retryable     Unchanged
                              Log the validation detail     (request bug)
                              (check for schema drift
                               between Node.js types and
                               FastAPI models)

AIPipelinePartialError        Use partial data              Partial writes
(/extract HTTP 206)           Push to resolve with flag     (commitments from
                              meeting: EXTRACTED_PARTIAL    succeeded chunks)

AIPipelinePartialError        Use partial data              Partial FULFILLED
(/resolve HTTP 206)           Park failed IDs for retry     updates applied
                              meeting: RESOLUTION_PARTIAL

AIPipelineTotalFailureError   Bull retry                    Unchanged
(/extract HTTP 422)           If all retries fail:
                              meeting: EXTRACTION_FAILED

AIPipelineTotalFailureError   Bull retry                    Unchanged
(/resolve HTTP 422)           If all retries fail:
                              meeting: RESOLUTION_FAILED

AIPipelineInvariantError      Fail job as non-retryable     Unchanged
(500 + non_retryable: true)   ALERT IMMEDIATELY
                              (internal AI pipeline bug)

AIPipelineCircuitOpenError    Delay job (circuit timeout)   Unchanged
                              Bull reschedules with delay
                              (not a failure — just waiting)

DB Transaction Failure        Fail job, Bull retries        Rolled back
(PostgreSQL write failure)    Independent of AI pipeline    (transaction)
```

---

## 10. Testing the Integration

```
UNIT TESTS (Node.js, fully mocked):
  tests/services/ai-pipeline/
  ├── ai-pipeline.client.test.ts
  │     - Retry logic: 3 retries on network error, no retry on auth error
  │     - Circuit breaker state transitions: CLOSED → OPEN → HALF_OPEN → CLOSED
  │     - Error type mapping: HTTP 401 → AIPipelineAuthError, etc.
  │     - X-Request-ID injection and correlation
  │     - Cost extraction from response body
  │
  ├── ai-pipeline.circuit-breaker.test.ts
  │     - 5 consecutive failures → OPEN
  │     - 30s elapsed → HALF_OPEN
  │     - Successful probe → CLOSED
  │     - Failed probe → back to OPEN
  │
  └── ai-pipeline.types.test.ts
        - TypeScript compilation test: every interface correctly typed
        - JSON parse test: known AI pipeline response bodies parse into
          the TypeScript interfaces without type errors

INTEGRATION TESTS (Node.js, real AI pipeline running in Docker):
  tests/integration/
  ├── transcribe-to-extract.integration.test.ts
  │     - Simulates Recall.ai webhook → cleanup → extract chain
  │     - Verifies: MongoDB has both raw and cleaned transcript
  │     - Verifies: PostgreSQL has commitments inserted
  │     - Verifies: Extract queue job was pushed
  │
  └── extract-to-resolve.integration.test.ts
        - Uses a known fixture transcript with known historical commitments
        - Verifies: FULFILLED commitments are correctly marked in PostgreSQL
        - Verifies: new commitments remain PENDING
        - Verifies: Socket.io events emitted

CONTRACT TESTS (shared between Node.js and Python, run on both):
  tests/contracts/
  └── ai-pipeline-contract.json  (Pact contract or custom JSON schema)
        Defines the expected request/response shapes for all three endpoints.
        Both the Node.js consumer tests AND the FastAPI provider tests
        reference this contract — any schema drift is caught at CI time,
        not at production deployment time.
```

---

## 11. Deployment Considerations

```
STARTUP ORDER (critical in both Docker Compose and Kubernetes):
  MongoDB → Redis → PostgreSQL → ai-pipeline → api → workers
  
  The ai-pipeline service must be HEALTHY (returning 200 on /health)
  before the api service starts. docker-compose.yml's depends_on with
  condition: service_healthy handles this. In Kubernetes: readinessProbe
  on the api Deployment references the ai-pipeline service's /health.

ENVIRONMENT-SPECIFIC CONFIGURATION:
  Development:
    AI_PIPELINE_URL=http://ai-pipeline:8000 (Docker Compose)
    AI_PIPELINE_TIMEOUT_MS=60000 (longer for dev — model calls may be slow)
    AI_PIPELINE_CIRCUIT_FAILURE_THRESHOLD=10 (more lenient — dev is flaky)

  Staging:
    AI_PIPELINE_URL=http://ai-pipeline-staging.internal.vocaply.com
    AI_PIPELINE_TIMEOUT_MS=30000
    AI_PIPELINE_CIRCUIT_FAILURE_THRESHOLD=5

  Production:
    AI_PIPELINE_URL=http://ai-pipeline.internal.vocaply.com
    AI_PIPELINE_TIMEOUT_MS=30000
    AI_PIPELINE_CIRCUIT_FAILURE_THRESHOLD=5
    (all secrets from Secrets Manager, not .env)

SCALING CONSIDERATIONS:
  The AI Pipeline service is stateless → horizontally scalable.
  Multiple AI Pipeline instances behind a load balancer are fully
  supported. The Node.js AIPipelineClient's circuit breaker is
  PER-PROCESS (not distributed), so a single AI pipeline instance
  failure doesn't trip the circuit for all Node.js processes — only
  the specific Node.js process that experienced failures will open
  its circuit. A distributed circuit breaker (Redis-backed) is a
  future concern if scaling demands it.

  AI_PIPELINE_URL for multi-instance: point to the internal load
  balancer DNS name, not a specific instance. The AI Pipeline's
  statelessness ensures any instance can handle any request.
```

---

## 12. Rollout Plan — Integration Go-Live

```
PHASE 1 — Shadow Mode (Week 1 post-integration):
  Deploy integration code. Workers call /cleanup and /extract but
  DO NOT write AI results to PostgreSQL (write to a shadow MongoDB
  collection instead). Verify: responses are correct, latency is
  acceptable, costs are within budget. Monitor for errors.
  Gate: < 1% error rate on AI pipeline calls over 48 hours.

PHASE 2 — Canary (Week 2):
  Enable PostgreSQL writes for 10% of meetings (canary cohort —
  specific team_ids). Verify: DB consistency, Socket.io events firing,
  no duplicate commitments, correct FULFILLED status on resolved items.
  Gate: manual review of 20 meetings' extracted commitments shows ≥ 85%
  accuracy (rough human judgment, not the formal eval harness).

PHASE 3 — Full Rollout (Week 3):
  Enable for 100% of meetings. Remove shadow MongoDB writes.
  Run the formal eval harness against production data (anonymized)
  to establish the production baseline.
  Gate: eval harness Precision ≥ 91%, Recall ≥ 87% on production data.

PHASE 4 — Production Monitoring (Ongoing):
  Dashboards tracking (all from structured logs):
    - AI pipeline call success rate (target: ≥ 99%)
    - Average latency per endpoint
    - Cost per meeting (target: ≤ $0.02/meeting all-in)
    - Circuit breaker open events (target: 0 per week)
    - Stage 2 detection call rate (target: 20-35% of matched commitments)
    - below_threshold_conservative rate (threshold calibration signal)
```

---

*Document: AI-PIPELINE-INTEGRATION-001 | Vocaply | Version 1.0*
*Principal Backend Engineer + Principal AI/RAG Engineer Edition*
*Node.js API Service ↔ FastAPI AI Pipeline — Full Connection Architecture*
*Planning Document Only — No Implementation Code*
