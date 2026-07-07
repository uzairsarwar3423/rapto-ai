# Vocaply — AI Pipeline: Day 55 Deep Build Plan
## `/resolve` Endpoint · Resolver Pipeline · Phase 4 Evaluation Harness · Full Integration
> Principal Backend Engineer (25+ yrs) + Principal AI/RAG Engineer Edition
> Stack: Python 3.12 · FastAPI · Pydantic v2 · OpenAI GPT-4.1 Mini · asyncio · httpx (eval)
> Document: AI-PIPELINE-DAY55-DEEP | Version 1.0 | Planning Only — No Code

---

## 0. What Day 55 Is (and What It Is Not)

Day 55 is **Phase 4's closing day**. Every module built since Day 46 converges here:

```
WHAT DAY 55 BUILDS:
  1. resolver_pipeline.py — orchestrates Day 53's resolver + Day 54's detector
     into a single, callable, production-ready function with bounded concurrency,
     typed partial-failure, and full cost aggregation
  2. POST /resolve — the third and final public endpoint the Node.js backend
     needs from this service; the API contract that completes Phase 4
  3. run_extraction_eval.py — the formal evaluation harness that produces
     Phase 4's accuracy baseline (Precision ≥ 91%, Recall ≥ 87%, F1 ≥ 89%)
  4. run_resolution_eval.py — measures resolver match accuracy + detector
     detection accuracy against all golden dataset fixtures
  5. Extended golden dataset (standup_02 fixture, resolution_fixture_03)
  6. Full end-to-end pipeline test: raw transcript → /cleanup → /extract
     → /resolve → human spot-check

WHAT DAY 55 IS NOT:
  - A "whatever didn't fit in Days 46-54" catch-up day. Every piece today
    has a defined place in the architecture and a specific contract with
    other components.
  - The RAG/embeddings work (Day 56+). Day 55 delivers the AI pipeline's
    extraction-and-resolution capabilities. RAG is a separate capability
    not built until Day 56+.
  - Day 60's complete eval run. Today's eval harness produces the FIRST
    formal measurement. Day 60's eval run is a re-run after any tuning,
    on a larger golden dataset, as the official Phase 4 sign-off.

OPENAI USAGE TODAY:
  GPT-4.1 Mini: called indirectly via resolver_pipeline.py → resolution_detector.py
    (Day 54's detect_resolution() is called for matched pairs that pass Stage 1)
    Temperature: 0.0 (inherited from Day 54's configuration)
  GPT-4.1 (full model): NOT used today.
    No task in Day 55 requires the full model's reasoning capability.
    All model-involving work is the same resolution detection from Day 54.
```

---

## 1. Objective & Why This Day Matters at the Platform Level

Day 55 is the day the AI Pipeline service crosses from **"collection of individually-proven modules"** to **"a production-shippable service with three callable endpoints."** The significance:

```
BEFORE DAY 55:
  - /transcripts/cleanup: ✓ (Day 47-48)
  - /extract: ✓ (Day 50, with date enrichment from Day 51)
  - /resolve: ✗ (not yet wired)
  - Accuracy measured informally (Day 49's prompt testing): ~informal
  - Phase 4 accuracy claims: unverified

AFTER DAY 55:
  - /transcripts/cleanup: ✓
  - /extract: ✓
  - /resolve: ✓
  - Accuracy formally measured: Precision, Recall, F1 with ground truth
  - Phase 4 accuracy claims: verified against golden dataset
  - Full pipeline chain: raw transcript → clean → extract → resolve: ✓
  - Node.js integration contract: complete for all three endpoints

THE BUSINESS CONSEQUENCE OF DAY 55:
  After today, the Node.js backend team can begin integrating these three
  endpoints into the production worker pipeline (the extract.worker.ts and
  the future resolve.worker.ts). The AI pipeline service is no longer a
  "work in progress" — it is a deliverable. Every subsequent day (56+)
  adds capability on top of a stable, proven foundation.
```

---

## 2. Architectural Decisions Made Today

```
DECISION 1 — resolver_pipeline.py IS THE SINGLE INTEGRATION POINT FOR
  THE ENTIRE RESOLUTION CHAIN; ROUTE HANDLER CALLS NOTHING ELSE

  The resolution pipeline has three components: resolver (Day 53),
  detector (Day 54), and pipeline orchestrator (today). The route handler
  calls ONLY the pipeline orchestrator. It does not call the resolver
  directly, then manually call the detector, then manually aggregate results.
  The orchestrator owns the entire flow, the concurrency, and the
  partial-failure semantics.

  WHY THIS MATTERS FOR FUTURE MAINTENANCE:
    If the resolution pipeline gains a fourth stage (e.g. a "resolution
    confidence booster" that uses meeting context to increase detection
    confidence), that stage is added to resolver_pipeline.py, not to
    the route handler. The route handler is a routing concern; the
    pipeline is a business-logic concern. These must never merge.

DECISION 2 — PARTIAL FAILURE IN THE PIPELINE IS A FIRST-CLASS OUTCOME

  If some (but not all) detection calls fail (DETECTION_FAILED status),
  the pipeline does not:
    a. Fail the entire job (losing successfully-processed data)
    b. Silently treat DETECTION_FAILED as NOT_RESOLVED (losing the
       information that a failure occurred)
  Instead: it returns a PipelineResult with a partial_failures field
  that lists which MatchedCommitments produced DETECTION_FAILED results.
  The route handler maps this to HTTP 206 with X-Resolve-Partial: true.
  Same pattern established in Day 50 for extraction partial failures —
  consistency across the service's failure semantics.

DECISION 3 — COST AGGREGATION AT THE PIPELINE LEVEL, NOT THE ROUTE LEVEL

  The route handler receives a PipelineResult and knows nothing about
  the internal cost of individual detection calls. All CostRecord
  aggregation (sum across all Stage 2 calls, per-call breakdown list)
  happens in resolver_pipeline.py before the result is returned.
  This mirrors Day 50's cost aggregation design for /extract.

DECISION 4 — THE /resolve RESPONSE SHAPE IS ADDITIVE, NOT SUBTRACTIVE

  The response includes ALL four commitment categories:
    new_commitments: list — to be inserted as new DB records
    resolved_updates: list — existing commitments to mark FULFILLED
    not_resolved_references: list — matched but not completed (update last_referenced_at)
    unchanged_commitments: list — historical open items not mentioned
  Sending ALL four lists (not just the ones with data) gives the Node.js
  side a complete picture of every commitment's status after this meeting.
  The Node.js side never needs to "infer" what's unchanged — it's explicit.

DECISION 5 — run_extraction_eval.py AND run_resolution_eval.py ARE
  STANDALONE SCRIPTS, NOT PYTEST TEST FILES

  The eval harness is not run as part of the normal test suite (pytest).
  It makes real API calls against a running service instance and measures
  against labeled golden data — it is a MEASUREMENT TOOL, not a
  regression test. It is run:
    a. Today, to establish the Phase 4 baseline
    b. On Day 60, for the formal phase sign-off
    c. After any prompt change, to verify no regression
  Running it in CI pytest would require a running service + OpenAI
  quota + significant time. It is a separate, intentionally-invoked
  measurement script.

DECISION 6 — EVAL HARNESS USES httpx, NOT THE SERVICE'S INTERNAL MODULES

  The eval harness tests the service AS A BLACK BOX through its HTTP
  interface — the same interface the Node.js side will use. It does not
  import and call internal service modules directly. This approach:
    a. Tests the complete request/response cycle (including auth, middleware,
       serialization) rather than just business logic
    b. Catches integration bugs that unit tests on individual modules miss
    c. Validates the actual API contract, not a hypothetical internal one
    d. Can be run from any machine that can reach the service + has OpenAI
       quota — not coupled to the service's Python environment

DECISION 7 — Phase 4 BASELINE METRICS ARE WRITTEN TO A FILE, NOT JUST STDOUT

  eval/results/ directory is created today. Every eval run produces a
  timestamped JSON file (e.g. eval/results/extraction_eval_2026-06-15T14:32:00Z.json)
  containing the full metrics. This creates a permanent, comparable record
  of Phase 4's baseline — critical for Day 60's comparison ("the precision
  was 91.2% on Day 55; after prompt tuning it's 92.8% on Day 60").
  Without persistent results, the Day 55 baseline exists only in memory
  and can never be compared objectively against Day 60's measurement.
```

---

## 3. Hour-by-Hour Execution Plan (8-Hour Day)

```
9:00 – 9:30    models/resolution_models.py (final extension): ResolveRequest,
               ResolveResponse, PipelineResult, ResolvedCommitmentUpdate,
               NotResolvedReference, ResolvePipelineStats; all route-level types
9:30 – 10:45   services/resolution/resolver_pipeline.py — full orchestration:
               resolver → detector fan-out → result classification →
               cost aggregation → PipelineResult assembly
10:45 – 11:15  api/routes/resolve.py — POST /resolve endpoint, HTTP status
               mapping for full/partial/total-failure outcomes
11:15 – 11:30  api/main.py (extension): register resolve.router
11:30 – 12:30  Golden dataset extensions:
               eval/golden_dataset/standup_02_cleaned.json + expected.json
               eval/golden_dataset/resolution_fixture_03.json
12:30 – 1:15   Lunch
1:15 – 2:30    eval/run_extraction_eval.py — full extraction eval script:
               loads all fixtures, calls /extract, measures P/R/F1,
               writes to eval/results/
2:30 – 3:30    eval/run_resolution_eval.py — resolver + detector eval:
               loads resolver fixtures, calls /resolve, measures match
               accuracy and detection accuracy, writes to eval/results/
3:30 – 4:00    eval/eval_report.py — aggregate report generator:
               reads eval/results/*.json, produces comparison summary
4:00 – 5:00    Unit tests (test_resolver_pipeline.py, test_resolve_endpoint.py)
5:00 – 5:30    RUN eval harness: extraction eval, resolution eval —
               FIRST FORMAL ACCURACY MEASUREMENT of Phase 4
5:30 – 5:50    Full end-to-end chain test: raw transcript → cleanup
               → extract → resolve; human spot-check of final output
5:50 – 6:00    Phase 4 sign-off checklist (§9) + document baseline metrics
```

---

## 4. Full File Structure (Day 55 Scope Only)

```
services/ai-pipeline/src/
│
├── services/resolution/
│   ├── __init__.py                    ← (extended) exports resolver_pipeline.run_resolution_pipeline
│   └── resolver_pipeline.py           ← Core: full resolution orchestration
│
├── models/
│   └── resolution_models.py           ← (final extension) route-level types:
│                                          ResolveRequest, ResolveResponse,
│                                          PipelineResult, ResolvedCommitmentUpdate,
│                                          NotResolvedReference, ResolvePipelineStats,
│                                          PartialResolutionFailure
│
└── api/
    ├── main.py                         ← (extended) resolve.router registered
    └── routes/
        └── resolve.py                  ← POST /resolve endpoint

services/ai-pipeline/eval/
├── __init__.py
├── eval_schema.py                      ← (Day 49 scaffolded, confirmed complete today)
├── run_extraction_eval.py              ← Extraction P/R/F1 harness
├── run_resolution_eval.py              ← Resolver match + detector accuracy harness
├── eval_report.py                      ← Aggregate report across multiple eval runs
├── results/                            ← Directory for timestamped eval output files
│   └── .gitkeep                        ← Keeps directory in git; actual result files
│                                           are .gitignored (they're measurement artifacts)
└── golden_dataset/
    ├── standup_01_cleaned.json         ← (Day 49)
    ├── standup_01_expected.json        ← (Day 49)
    ├── sprint_review_01_cleaned.json   ← (Day 49)
    ├── sprint_review_01_expected.json  ← (Day 49)
    ├── ambiguous_cases_cleaned.json    ← (Day 49)
    ├── standup_02_cleaned.json         ← NEW today
    ├── standup_02_expected.json        ← NEW today
    ├── resolver_fixture_01.json        ← (Day 52)
    ├── resolver_fixture_02.json        ← (Day 53)
    └── resolution_fixture_03.json     ← NEW today (full-pipeline fixture)

services/ai-pipeline/tests/
├── test_resolver_pipeline.py          ← Orchestration unit tests (mocked)
└── test_resolve_endpoint.py           ← Route-level integration tests
```

---

## 5. Detailed Implementation Logic — File by File

### 5.1 `models/resolution_models.py` — Final Extensions

**`ResolveRequest(BaseModel)` — what the Node.js worker sends to POST /resolve:**

- `meeting_id: str` — `min_length=1`. The current meeting's ID.
- `team_id: str` — `min_length=1`. Tenant scoping.
- `meeting_date: datetime` — the meeting's scheduled UTC datetime. Used for logging and the stats output.
- `meeting_duration_seconds: float | None = None` — optional, for logging/diagnostics.
- `new_commitments: list[ParsedCommitment]` — from the immediately preceding `/extract` call for this same meeting. `min_length=0` (a meeting with no extracted commitments is valid — the resolver returns all historical as unchanged).
- `historical_commitments: list[HistoricalCommitment]` — open commitments from all prior meetings for this team, pre-fetched by Node.js from PostgreSQL. Pre-filtered to exclude: (a) the current meeting's own commitments, (b) FULFILLED/MISSED/CANCELLED status commitments. `min_length=0` (a new team or a team with no prior open commitments is valid).
- `team_timezone: str` — IANA timezone, for logging/audit context. Already validated at the `/extract` layer but re-validated here for defense-in-depth.

**`ResolvedCommitmentUpdate(BaseModel)` — a FULFILLED commitment record:**

- `historical_commitment_id: str` — the PostgreSQL UUID to update.
- `historical_commitment_text: str` — carried for the audit trail (what was the commitment that got resolved?).
- `resolved_by_new_commitment: ParsedCommitment` — the new statement that triggered the resolution, with its full metadata (text, normalized_text, confidence, due_date_utc etc.).
- `detection_confidence: float` — from `DetectionResult.confidence`. The confidence of the resolution determination. Stored alongside the update for the platform's audit trail.
- `similarity_score: float` — from the matching step. Documents how similar the new statement was to the historical commitment at the similarity level (separate from the detection confidence — these answer different questions).
- `prompt_version: str` — from `_resolution_prompt_version` in resolution_detector.py. The exact prompt version that produced this determination — the resolution audit trail must be permanently attributable to a specific prompt version, not just "the AI decided."

**`NotResolvedReference(BaseModel)` — a matched-but-not-completed commitment:**

A new statement matched a historical commitment above threshold (Day 53) but the resolution detector determined it was NOT a completion (Day 54). This represents "Ahmed mentioned the login feature again but it's still open."

- `historical_commitment_id: str` — the PostgreSQL UUID to update (`last_referenced_at` timestamp, leave status as PENDING).
- `new_statement_text: str` — what Ahmed said (for display in the Node.js audit view: "referenced in [meeting name] by this statement: [text]").
- `similarity_score: float` — how similar the reference was.
- `detection_status: Literal["NOT_RESOLVED", "DETECTION_FAILED"]` — which of the two NOT-RESOLVED cases this was. `DETECTION_FAILED` means the GPT-4.1 Mini call failed; the Node.js side may want to retry detection separately rather than treating this definitively as not-resolved.

**`PartialResolutionFailure(BaseModel)` — when some detection calls failed:**

- `total_matched: int`
- `detection_succeeded: int`
- `detection_failed: int`
- `failed_historical_ids: list[str]` — which historical commitment IDs had detection failures. The Node.js side can retry resolution for these specific IDs in a subsequent job.
- `partial_result: PipelineResult | None` — the result from succeeded detections. `None` only if ALL detections failed.

**`ResolvePipelineStats(BaseModel)` — pipeline-level processing metadata:**

- `new_commitments_count: int` — commitments classified as brand-new.
- `resolved_count: int` — commitments confirmed as FULFILLED.
- `not_resolved_references_count: int` — matched but not completed references.
- `unchanged_count: int` — historical commitments not mentioned at all.
- `detection_calls_made: int` — how many GPT-4.1 Mini Stage 2 calls were made.
- `detection_calls_succeeded: int`
- `detection_calls_failed: int`
- `total_detection_cost: CostRecord` — sum of all successful detection calls' costs.
- `resolver_time_ms: float` — time for Day 53's resolver alone.
- `detector_time_ms: float` — time for all detection calls (wall-clock, including concurrency benefit).
- `total_pipeline_time_ms: float` — end-to-end.
- `stage1_blocks: int` — how many matched pairs were blocked by Stage 1 (no Stage 2 call needed). Key cost-efficiency metric.
- `below_threshold_conservatives: int` — how many pairs had Stage 2 say YES but below the confidence threshold. Key threshold-calibration metric for Day 60.

**`PipelineResult(BaseModel)` — the full successful pipeline output:**

- `meeting_id: str`
- `team_id: str`
- `new_commitments: list[ParsedCommitment]` — to be inserted as new DB records.
- `resolved_updates: list[ResolvedCommitmentUpdate]` — to be marked FULFILLED.
- `not_resolved_references: list[NotResolvedReference]` — to have `last_referenced_at` updated.
- `unchanged_commitments: list[HistoricalCommitment]` — no action needed on these.
- `partial_failure: PartialResolutionFailure | None` — populated if some detection calls failed. `None` if all succeeded.
- `stats: ResolvePipelineStats`

**`ResolveResponse(BaseModel)` — the HTTP response envelope:**

- `success: bool` — True for full success or partial failure (partial is still a usable result), False only if total pipeline failure (resolver itself crashed).
- `partial: bool` — True if `partial_failure` is not None (some detection calls failed).
- `request_id: str` — from Day 46's X-Request-ID middleware.
- `result: PipelineResult | None` — the pipeline result. `None` only in total failure cases.
- `error: ErrorEnvelope | None` — populated only on total failure.

### 5.2 `services/resolution/resolver_pipeline.py` — The Orchestrator

**Public function:**
`async def run_resolution_pipeline(request: ResolveRequest, openai_client: OpenAIClient) -> PipelineResult`

**Logic in six sequential phases:**

---

**(Phase 1) Build ResolutionInput and invoke the Day 53 resolver:**

- Start `total_pipeline_timer`.
- Build `ResolutionInput(meeting_id=request.meeting_id, team_id=request.team_id, meeting_date=request.meeting_date, new_commitments=request.new_commitments, historical_commitments=request.historical_commitments)`.
- Start `resolver_timer`.
- Call `resolve(resolution_input)` → `ResolutionResult` (Day 53's function, synchronous, fast).
- Stop `resolver_timer`. Record `resolver_time_ms`.
- Log one structured INFO event: `{"event": "resolver_complete", "meeting_id": ..., "team_id": ..., "new_count": ..., "matched_count": ..., "unchanged_count": ..., "comparisons_made": ..., "resolver_time_ms": ...}`. This single log line is the operational dashboard's primary data source for "how many new vs. matched commitments per meeting."

---

**(Phase 2) Stage 1 pre-screening on all matched pairs (synchronous, free):**

- For each `matched: MatchedCommitment` in `resolution_result.matched_commitments`:
  - Call `_run_stage1(matched.new_commitment.text)` — imported from Day 54's `resolution_detector._run_stage1`. This is a private function but imported directly (same Python package) for efficiency.
  - Store result in `stage1_results: dict[str, Stage1Result]` keyed by `matched.historical_commitment.id`.
  - If `not stage1.passed`: this matched pair will NOT go to Stage 2. It is immediately classified as a `NotResolvedReference`. Count it in `stage1_blocks`.
  - If `stage1.passed`: add to `pairs_needing_stage2` list.
- Count `stage1_blocks = len(matched) - len(pairs_needing_stage2)`.

**WHY STAGE 1 PRE-SCREENING IN THE PIPELINE (not just in detect_resolution()):**

Stage 1 is already inside `detect_resolution()`. Running it here too might seem redundant, but it is not: by running Stage 1 synchronously up front on ALL matched pairs, the pipeline knows EXACTLY how many Stage 2 calls will be dispatched BEFORE any async call starts. This allows:
- A single structured log event stating "N pairs need Stage 2 out of M matched" — extremely valuable for cost monitoring.
- More predictable semaphore behavior (all goroutines are created simultaneously, not as a cascade).
- The ability to compute `stage1_blocks` for `ResolvePipelineStats` without introspecting DetectionResult objects after the fact.

---

**(Phase 3) Stage 2 concurrent detection for pairs that passed Stage 1:**

- Start `detector_timer`.
- Build a list of coroutines: `[detect_resolution(pair.new_commitment.text, pair.historical_commitment.text, openai_client) for pair in pairs_needing_stage2]`.
- Use `asyncio.Semaphore(STAGE2_MAX_CONCURRENT_CALLS)` — imported from Day 54's `resolution_config`. Each coroutine is wrapped with this semaphore (same bounded-concurrency pattern from Day 50's extractor and Day 51's date parser).
- `asyncio.gather(*semaphore_wrapped_coroutines, return_exceptions=False)` — `return_exceptions=False` is correct here for the same reason documented in Day 50: `detect_resolution()` already converts all exceptions into typed `DetectionResult` values (with `DetectionStatus.DETECTION_FAILED`), so `gather` never sees an unhandled exception in the normal-degradation case.
- Results list is in the same order as `pairs_needing_stage2` (asyncio.gather ordering guarantee, documented in the function's source comment).
- Stop `detector_timer`. Record `detector_time_ms`.
- Log: `{"event": "detection_complete", "pairs_attempted": len(pairs_needing_stage2), "succeeded": ..., "failed": ..., "stage1_blocks": stage1_blocks, "detector_time_ms": ...}`.

---

**(Phase 4) Result classification into four output lists:**

Process three groups:

**Group A: Stage 1-blocked pairs** (pairs_that_did_not_need_stage2):
- Build `NotResolvedReference(historical_commitment_id=matched.historical_commitment.id, new_statement_text=matched.new_commitment.text, similarity_score=matched.similarity_score, detection_status="NOT_RESOLVED")`.
- Append to `not_resolved_references`.

**Group B: Stage 2 pairs** — iterate detection results in order:

For each `(matched_pair, detection_result)` in `zip(pairs_needing_stage2, stage2_results)`:
- `DetectionStatus.RESOLVED`:
  - Build `ResolvedCommitmentUpdate(historical_commitment_id=matched_pair.historical_commitment.id, historical_commitment_text=matched_pair.historical_commitment.text, resolved_by_new_commitment=matched_pair.new_commitment, detection_confidence=detection_result.confidence, similarity_score=matched_pair.similarity_score, prompt_version=_resolution_prompt_version)`.
  - Append to `resolved_updates`.
- `DetectionStatus.NOT_RESOLVED`:
  - Build `NotResolvedReference(... detection_status="NOT_RESOLVED")`.
  - Append to `not_resolved_references`.
- `DetectionStatus.DETECTION_FAILED`:
  - Build `NotResolvedReference(... detection_status="DETECTION_FAILED")`.
  - Append to `not_resolved_references`.
  - Add `matched_pair.historical_commitment.id` to `failed_historical_ids`.
  - Increment `detection_calls_failed`.

**Group C: Resolver new_commitments** — pass through directly:
- `new_commitments = resolution_result.new_commitments` (no further processing needed at this pipeline stage).

**Group D: Unchanged**:
- `unchanged_commitments = resolution_result.unchanged_commitments` (pass through from resolver).

---

**(Phase 5) Cost aggregation and partial-failure assembly:**

- `total_cost = CostRecord(input_tokens=0, output_tokens=0, total_tokens=0, estimated_cost_usd=0.0)` — accumulate.
- For each detection_result where `stage2_invoked=True` and `stage2_cost is not None`: add its cost fields to the accumulator.
- Build `ResolvePipelineStats(new_commitments_count=len(new_commitments), resolved_count=len(resolved_updates), not_resolved_references_count=len(not_resolved_references), unchanged_count=len(unchanged_commitments), detection_calls_made=len(pairs_needing_stage2), detection_calls_succeeded=len(pairs_needing_stage2) - detection_calls_failed, detection_calls_failed=detection_calls_failed, total_detection_cost=total_cost, resolver_time_ms=resolver_time_ms, detector_time_ms=detector_time_ms, total_pipeline_time_ms=elapsed(total_pipeline_timer), stage1_blocks=stage1_blocks, below_threshold_conservatives=count of below_threshold_conservative=True in stage2_results)`.
- Build `partial_failure = None` if `detection_calls_failed == 0` else `PartialResolutionFailure(total_matched=len(matched_commitments), detection_succeeded=..., detection_failed=detection_calls_failed, failed_historical_ids=failed_historical_ids, partial_result=None if len(resolved_updates)+len(not_resolved_refs)-len(failed)==0 else pipeline_result_so_far)`.

---

**(Phase 6) Final invariant assertion and result assembly:**

Invariant (same discipline as Day 53's resolver invariant):
```
assert (len(new_commitments) + len(resolved_updates) + len(not_resolved_references)
        == len(request.new_commitments))
```
Every new commitment from the request must appear in exactly one of the three outcome lists. If not: raise `ResolverInvariantError` (the same typed error class from Day 53 — extended to cover the pipeline level).

Build and return `PipelineResult(meeting_id=..., team_id=..., new_commitments=..., resolved_updates=..., not_resolved_references=..., unchanged_commitments=..., partial_failure=..., stats=stats)`.

### 5.3 `api/routes/resolve.py`

**Route: `POST /api/v1/resolve`**

Protected by Day 46's `verify_internal_service_key` dependency. Request body: `ResolveRequest`. Thin handler — all logic in `resolver_pipeline.py`.

**HTTP Status Mapping (the Response Contract):**

The route handler maps `PipelineResult` outcomes to HTTP responses with deliberate, documented semantics:

```
FULL SUCCESS (partial_failure is None):
  HTTP 200
  ResolveResponse(success=True, partial=False, result=pipeline_result)
  X-Resolve-Partial: false

PARTIAL FAILURE (partial_failure is not None, partial_result is not None):
  HTTP 206 Partial Content
  X-Resolve-Partial: true
  X-Resolve-Failed-Ids: comma-separated failed historical IDs (for Node.js logging)
  ResolveResponse(success=True, partial=True, result=pipeline_result)
  WHY 206: same reasoning as Day 50's partial extraction — the service
  processed successfully but could not complete all parts. The caller
  receives usable partial results. Treating this as a 200 would hide
  the failure; treating it as 4xx/5xx would prevent Node.js from
  using the partial data.

TOTAL DETECTION FAILURE (all detection calls failed, partial_result is None):
  HTTP 422 Unprocessable Entity
  ResolveResponse(success=False, partial=False, result=None, error=ErrorEnvelope)
  WHY 422: the request was valid; the data was processable by the resolver;
  but the detection step (external dependency: OpenAI) could not complete.
  This is not a server error (500) — the service functioned correctly.
  It is not a client error — the client sent valid data. 422 signals
  "valid request, unprocessable due to upstream dependency failure."
  Node.js's existing job-retry logic handles 422 as a retryable failure.

RESOLVER INVARIANT ERROR (ResolverInvariantError raised):
  HTTP 500
  ErrorEnvelope with non_retryable: true (Day 53's §10 decision implemented today)
  WHY 500 AND non_retryable: this is a service internal bug, not a
  transient failure. Retrying would produce the same invariant violation.
  The Node.js side should alert, not retry.

AUTH FAILURE: HTTP 401 (from Day 46's verify_internal_service_key)
REQUEST VALIDATION FAILURE: HTTP 422 (from Pydantic)
```

**Route-level logging:**

The route handler logs one INFO event per request completion (not inside the pipeline — the pipeline has its own events):
```json
{
  "event": "resolve_request_complete",
  "meeting_id": "...",
  "team_id": "...",
  "http_status": 200,
  "new_count": 3,
  "resolved_count": 1,
  "unchanged_count": 5,
  "detection_cost_usd": 0.0001,
  "total_time_ms": 847
}
```
This single log line per meeting is the primary data source for production dashboards. Every metric that matters operationally is in this one event.

### 5.4 `api/main.py` (Extension)

- `from api.routes.resolve import router as resolve_router` added to imports.
- `app.include_router(resolve_router, prefix="/api/v1")` added to the router registration block, alongside the existing cleanup and extract router registrations.
- Comment added explaining the three-endpoint structure: "Phase 4 complete: /transcripts/cleanup, /extract, /resolve."

### 5.5 `eval/run_extraction_eval.py` — The Formal Extraction Eval

**Architecture: standalone script, not a pytest test.**

**Configuration section (at top of script, not hardcoded):**
```
SERVICE_BASE_URL = os.getenv("AI_PIPELINE_URL", "http://localhost:8000")
API_KEY = os.getenv("API_SHARED_SECRET", "dev-secret")
GOLDEN_DATASET_DIR = Path(__file__).parent / "golden_dataset"
RESULTS_DIR = Path(__file__).parent / "results"
EVAL_TARGETS = {
    "precision_min": 0.91,
    "recall_min": 0.87,
    "f1_min": 0.89,
    "anti_pattern_max_commitments": 0,
}
```

**Core algorithm:**

1. Load all `*_cleaned.json` fixtures from golden_dataset (the cleaned transcripts — input to /extract).
2. Load their corresponding `*_expected.json` files (the labeled ground truth — `EvalCase` objects from Day 49's `eval_schema.py`).
3. For each fixture with `expected_zero_commitments=True` (the anti-pattern fixture):
   - POST to `/extract` with the fixture's cleaned transcript and metadata.
   - Assert: `len(response.commitments) == 0`. If non-zero: ANTI_PATTERN_FAIL — immediate abort of this eval run (zero tolerance, Day 49 principle upheld at the harness level, not just in dev testing).
4. For each fixture with expected commitment/action-item labels:
   - POST to `/extract`.
   - For each `expected_commitment` in `eval_case.expected_commitments`:
     - Attempt to match against the extracted commitments. Matching logic: any extracted commitment where `expected.text_contains` appears as a case-insensitive substring of `extracted.text` AND `expected.owner_name_contains` appears as a case-insensitive substring of `extracted.owner_name`. If `expected.confidence_min` is set, also verify `extracted.confidence >= expected.confidence_min`.
     - If match found: `true_positives += 1`.
     - If no match: `false_negatives += 1` (expected but not found — recall failure).
   - `false_positives = len(extracted_commitments) - true_positives` (extracted commitments with no corresponding expected entry — precision failure). Note: this is a simplification for the text-overlap matching approach; it counts unmatched extracted items as false positives.
5. Aggregate across all fixtures: `precision = tp / (tp + fp)`, `recall = tp / (tp + fn)`, `f1 = 2 * (precision * recall) / (precision + recall)`.
6. Compare against `EVAL_TARGETS`. Print per-fixture and aggregate results to stdout.
7. Write results to `eval/results/extraction_eval_{timestamp}.json` (the permanent, comparable record per Decision 7).

**Output file schema:**
```json
{
  "timestamp": "2026-06-15T14:32:00Z",
  "service_version": "from /health response",
  "prompt_version": "from any ExtractionResultWithMeta.prompt_version in responses",
  "per_fixture": [
    {
      "fixture_id": "standup_01",
      "precision": 0.93,
      "recall": 0.88,
      "f1": 0.906,
      "extracted_count": 3,
      "expected_count": 3,
      "tp": 3, "fp": 0, "fn": 0
    }
  ],
  "aggregate": {
    "precision": 0.917,
    "recall": 0.882,
    "f1": 0.899,
    "target_precision": 0.91,
    "target_recall": 0.87,
    "target_f1": 0.89,
    "precision_pass": true,
    "recall_pass": true,
    "f1_pass": true
  },
  "anti_pattern_result": {
    "fixture": "ambiguous_cases",
    "extracted_commitments": 0,
    "pass": true
  },
  "overall_pass": true
}
```

### 5.6 `eval/run_resolution_eval.py` — The Resolution Eval

**Core algorithm:**

1. Load all `resolver_fixture_*.json` and `resolution_fixture_*.json` from golden_dataset.
2. For MATCHING accuracy (uses resolver fixtures):
   - POST to `/resolve` with each fixture's new_commitments + historical_commitments.
   - For each `expected_match` pair in the fixture:
     - Check if the pair appears in `response.result.resolved_updates` OR `response.result.not_resolved_references` (either means the resolver MATCHED them — the detection outcome doesn't affect whether matching happened).
     - `correct_matches += 1` if found; `incorrect_missed_matches += 1` if not.
   - For each `expected_no_match` pair:
     - Check that the new_commitment appears in `response.result.new_commitments` (not matched against any historical).
     - `correct_no_matches += 1` if in new_commitments; `false_matches += 1` if wrongly matched.
   - `match_accuracy = (correct_matches + correct_no_matches) / total_expected_decisions`.
3. For DETECTION accuracy (uses resolution fixture_03 full-pipeline fixture):
   - POST to `/resolve` with the fixture.
   - For each pair labeled `expected_resolved=True`: check if it appears in `resolved_updates`. `true_detections += 1` if yes; `missed_detections += 1` if no.
   - For each pair labeled `expected_resolved=False`: check if it appears in `not_resolved_references` (NOT in `resolved_updates`). `correct_rejections += 1` if yes; `false_detections += 1` if no.
   - `detection_accuracy = (true_detections + correct_rejections) / total_labeled_pairs`.
4. Write to `eval/results/resolution_eval_{timestamp}.json`.

**Targets:**
- Match Accuracy: ≥ 85%
- Detection Accuracy: ≥ 90% (weighted toward TNR per Day 54's asymmetry-of-harm principle)
- False Positive Rate (wrongly RESOLVED): ≤ 5% (stricter than general accuracy — false positives are the most harmful error)

### 5.7 `eval/eval_report.py` — Aggregate Report

A simple script that reads all JSON files from `eval/results/` and produces a Markdown-formatted comparison table:

```
Phase 4 Evaluation Report
Generated: 2026-06-15T17:45:00Z

Extraction Accuracy:
┌────────────────────────────────────────────────────────────────┐
│ Run Date        │ Precision │ Recall │ F1     │ Anti-Pattern │ Pass │
├────────────────────────────────────────────────────────────────┤
│ Day 55 Baseline │ 91.7%     │ 88.2%  │ 89.9%  │ PASS (0)     │ ✓    │
└────────────────────────────────────────────────────────────────┘

Resolution Accuracy:
┌────────────────────────────────────────────────────────────────┐
│ Run Date        │ Match Acc │ Detection │ FPR    │ Pass │
├────────────────────────────────────────────────────────────────┤
│ Day 55 Baseline │ 87.5%     │ 91.2%     │ 2.1%   │ ✓    │
└────────────────────────────────────────────────────────────────┘
```

This report is the permanent, shareable artifact that documents Phase 4's measured accuracy baseline.

### 5.8 `eval/golden_dataset/standup_02_cleaned.json` + `standup_02_expected.json`

A second standup fixture (different from standup_01) to expand the precision/recall measurement surface. Design:

```
MEETING: Wednesday engineering standup, 6-person team
DURATION: 20 minutes
CONTENT DESIGN:
  5 genuine commitments at varied confidence levels:
    - Clear high-confidence: "I'll submit the PR for the search feature today"
    - High-confidence with deadline: "I'll finish the DB migration by Thursday"
    - Medium-confidence conditional: "I should be able to review Ali's PR today"
    - Low-confidence (just above 0.3): "I'll try to look at the mobile bug"
    - Dual extraction (commitment + action item): "I'll handle the customer escalation"
  2 genuine action items (third-party assigned):
    - "Sara, can you review my PR today?"
    - "Ahmed, please check the monitoring alerts"
  1 decision: "We're pushing the release to next Monday"
  2 documented anti-patterns (must NOT be extracted as commitments):
    - "We should probably look at improving the test coverage"
    - "Someone needs to follow up with the client"

EXPECTED OUTPUT FORMAT:
  5 EvalExpectedCommitment objects (one per genuine commitment)
  Each with text_contains, owner_name_contains, confidence_min
  2 EvalExpectedActionItem objects
  expected_zero_commitments: false
  expected_commitment_count: 5
```

This second standup fixture tests that the extraction model generalizes beyond standup_01 — it is a different meeting, different speakers, different topics, but the same extraction rules apply.

### 5.9 `eval/golden_dataset/resolution_fixture_03.json` — Full Pipeline Fixture

The most complex fixture — a complete scenario that exercises the entire resolution pipeline from new_commitments to final detection:

```
SCENARIO: A team's Tuesday standup, 5 days after Monday's standup

HISTORICAL OPEN COMMITMENTS (from Monday's standup):
  hist_01: Ahmed — "finish the login feature" [PENDING]
  hist_02: Ahmed — "fix the payment gateway timeout" [PENDING]
  hist_03: Sara — "send updated wireframes to engineering" [PENDING]
  hist_04: Sara — "review Ali's PR" [PENDING]
  hist_05: Ali — "set up Redis caching for the API" [PENDING]

NEW COMMITMENTS (from Tuesday's standup extraction):
  new_01: Ahmed — "I finished the login feature and it's been merged"
          (text evidence: "finished", "merged" → clear completion)
          EXPECTED: RESOLVED → hist_01
  new_02: Ahmed — "I'm still working on the payment timeout, should have it done by Thursday"
          (text evidence: "still working on" → non-completion phrase)
          EXPECTED: NOT_RESOLVED reference → hist_02
  new_03: Sara — "I sent the wireframes to the engineering team yesterday"
          (text evidence: "sent" → completion keyword)
          EXPECTED: RESOLVED → hist_03
  new_04: Sara — "I'll review Ali's PR today"
          (text evidence: "review" → completion keyword? BUT "I'll" prefix → future tense)
          This is a TRICKY CASE: "I'll review" (future intent, not past completion)
          The resolution_system.txt prompt's examples should handle this correctly.
          EXPECTED: NOT_RESOLVED reference → hist_04 (re-commitment, not completion)
  new_05: Ali — "I'll configure the Redis caching this week"
          (text evidence: no completion keyword → Stage 1 blocks immediately)
          EXPECTED: NOT_RESOLVED reference → hist_05

  new_06: Ahmed — "I'll write the unit tests for the login feature"
          (no historical match — login-feature-tests wasn't a prior commitment)
          EXPECTED: new_commitment (no historical match above threshold)

EXPECTED RESOLUTION RESULTS:
  resolved_updates: [hist_01 (by new_01), hist_03 (by new_03)]
  not_resolved_references: [hist_02 (by new_02), hist_04 (by new_04), hist_05 (by new_05)]
  new_commitments: [new_06]
  unchanged_commitments: []

LABELED DETECTION PAIRS (for detection accuracy measurement):
  (new_01, hist_01): expected_resolved=True (clear completion)
  (new_03, hist_03): expected_resolved=True (delivery completed)
  (new_02, hist_02): expected_resolved=False (status update + re-commitment)
  (new_04, hist_04): expected_resolved=False (future intent "I'll review")
  (new_05, hist_05): expected_resolved=False (Stage 1 blocks — future intent)
```

---

## 6. End-to-End Pipeline Demonstration

The Day 55 schedule includes a **full end-to-end chain test at 5:30 PM** using a raw, previously-unseen messy ASR transcript. This is the capstone demonstration of Phase 4 working as a complete system:

```
STEP 1 — POST /transcripts/cleanup
  Input: raw_messy_standup_raw.json (a new, unreleased fixture of
         deliberately messy ASR — fragmented turns, filler words,
         low-confidence segments)
  Expected output: CleanupResult with cleaned_transcript, confidence
    flags, timestamp-validated turns

STEP 2 — POST /extract
  Input: the CleanupResult's cleaned_transcript + meeting metadata
         (team_id, meeting_date, team_timezone, participants)
  Expected output: ExtractionResultWithMeta with commitments,
    action_items, decisions, blockers, due_date_utc populated
    for dated commitments, summary

STEP 3 — POST /resolve
  Input: ExtractionResultWithMeta.commitments as new_commitments +
         a pre-prepared historical_commitments list (matching the
         scenario in the raw transcript)
  Expected output: ResolveResponse with at least one resolved_update
    and at least one new_commitment

HUMAN SPOT-CHECK CRITERIA:
  A second engineer (not the author of today's code) reviews:
    - Are the extracted commitments genuine first-person promises? (no "we should")
    - Are the resolved updates credible? (do they describe genuine completions?)
    - Is the summary coherent and useful?
    - Are the due dates reasonable? (no past dates, no dates 2 years in the future)
    - Is the cost-per-meeting measurement reasonable vs. the HLD budget?
  This spot-check is the final human-judgment gate for Phase 4.
  A "yes" on all criteria = Phase 4 complete.
```

---

## 7. Performance & Cost Baselines Established Today

```
TODAY'S MEASUREMENTS MUST BE RECORDED (not just observed):

LATENCY PER ENDPOINT (P95 on 5 representative fixtures):
  /transcripts/cleanup (30-min standup): target < 8s
  /extract (30-min standup, single chunk): target < 5s
  /resolve (5 new commitments, 15 historical): target < 2s
    (resolver: < 50ms, detector: < 1s for the one Stage 2 call on average)

COST PER MEETING (extraction step):
  New baseline post-GPT-4.1 Mini migration (Day migration plan §2.2):
  Target: < $0.015/meeting for cleanup + extraction combined
  Actual: measured today from the eval harness runs (sum of all
  ExtractionResultWithMeta.total_cost.estimated_cost_usd / meeting count)

COST PER RESOLVE CALL:
  Target: < $0.002/resolve call (≈ 0.5 Stage 2 calls × $0.0001 each +
  overhead — negligible)
  Actual: measured from ResolvePipelineStats.total_detection_cost across
  all resolution eval runs

THESE MEASUREMENTS ARE THE OPERATIONAL BASELINE:
  Any future prompt change, model change, or algorithm change must be
  compared against these Day 55 baselines. If a change increases cost
  by > 20% OR increases latency by > 30%, it requires explicit approval
  with documented justification before merging.
```

---

## 8. Security Considerations

```
/resolve ENDPOINT SURFACE:
  Accepts historical_commitments[] from Node.js — this data comes from
  PostgreSQL (trusted, internal) but traverses the internal network.
  The X-Internal-Service-Key authentication (Day 46) ensures only the
  Node.js API can call this endpoint. No additional authentication is
  needed for the historical_commitments payload itself, because:
    a. The service is internal-only (not internet-facing)
    b. The payload is type-validated by Pydantic (schema-checked at the HTTP layer)
    c. The resolver's owner-scoping ensures cross-owner contamination is impossible
       even if a malformed payload contained mixed-owner data

AUDIT TRAIL FOR FULFILLED COMMITMENTS:
  Every ResolvedCommitmentUpdate carries:
    - The specific prompt version that made the determination
    - The detection confidence
    - The full text of both the new statement and historical commitment
  This is written to the Node.js database alongside the FULFILLED status update.
  In a dispute ("the system said I fulfilled this but I didn't"), the audit
  trail can produce: "On 2026-06-15 at 14:32 UTC, the statement 'I finished
  the login feature and it's merged' was matched with 87% similarity to
  historical commitment 'finish the login feature'. GPT-4.1 Mini (resolution-v1.0)
  classified this as resolved with 92% confidence."
  This is the professional standard for an AI-generated accountability determination.

EVAL HARNESS SECURITY:
  run_extraction_eval.py uses API_SHARED_SECRET from environment variable
  (not hardcoded). The eval script must never be committed with a hardcoded
  secret. The .env.example includes a note that this secret is required for
  the eval harness to function. Eval results (eval/results/*.json) are
  .gitignored — they may contain cost data and meeting-summary-level
  content from golden fixtures that should not be committed to version control.
```

---

## 9. End-of-Day Testing & Definition of Done — The Phase 4 Checklist

```
UNIT TESTS — resolver_pipeline.py (mocked Day 53 resolver + Day 54 detector):

  Happy path:
  [ ] resolver returns 3 matched + 2 new + 4 unchanged; all detections succeed;
      1 RESOLVED + 2 NOT_RESOLVED references → PipelineResult with correct counts
  [ ] resolved_updates has 1 entry, not_resolved_references has 2 entries,
      new_commitments has 2 entries, unchanged_commitments has 4 entries
  [ ] total_pipeline_time_ms is positive and populated

  Stage 1 pre-screening savings:
  [ ] 5 matched pairs; 4 blocked by Stage 1; 1 passes to Stage 2
      → exactly 1 openai_client mock call (Stage 2 for the 1 passing pair)
      → stage1_blocks = 4 in stats

  Partial failure path:
  [ ] 3 matched pairs pass Stage 1; 1 returns DETECTION_FAILED
      → partial_failure is not None
      → partial_failure.detection_failed = 1
      → failed_historical_ids contains the failed pair's historical_commitment.id
      → the 2 successful detections' results are still in the PipelineResult

  Total detection failure:
  [ ] 0 matched pairs (resolver found no matches) → partial_failure is None,
      stats.detection_calls_made == 0

  Invariant assertion:
  [ ] Deliberate bug simulation: mocked resolver drops one new_commitment
      from both new_commitments and matched_commitments → ResolverInvariantError raised
  [ ] Normal cases: assertion passes silently

  Cost aggregation:
  [ ] 3 Stage 2 calls with known mock costs → total_cost.estimated_cost_usd
      == sum of the 3 individual costs (to 6 decimal places)

UNIT TESTS — resolve.py route:

  HTTP status mapping:
  [ ] PipelineResult(partial_failure=None) → HTTP 200, success=True, partial=False
  [ ] PipelineResult(partial_failure is not None) → HTTP 206,
      X-Resolve-Partial: true, success=True, partial=True
  [ ] ResolverInvariantError raised → HTTP 500, ErrorEnvelope,
      error.non_retryable=True
  [ ] Missing auth header → HTTP 401
  [ ] Invalid ResolveRequest body → HTTP 422

  Response schema:
  [ ] HTTP 200 response body validates against ResolveResponse schema
  [ ] request_id in response matches X-Request-ID from request (middleware test)

INTEGRATION TESTS (live OpenAI calls via the full endpoint):

  /resolve with resolution_fixture_03.json:
  [ ] HTTP 200 response
  [ ] resolved_updates has exactly 2 entries (hist_01 and hist_03)
  [ ] not_resolved_references has exactly 3 entries (hist_02, hist_04, hist_05)
  [ ] new_commitments has exactly 1 entry (new_06)
  [ ] unchanged_commitments is empty
  [ ] The "I'll review Ali's PR" case (new_04) correctly produces
      NOT_RESOLVED reference (not RESOLVED — the tricky future-tense case)
  [ ] stats.stage1_blocks >= 1 (at least new_05 was blocked by Stage 1)
  [ ] stats.detection_calls_made >= 2 (at least new_01 and new_03 invoked Stage 2)

EVALUATION HARNESS (THE FORMAL PHASE 4 GATES — these MUST PASS):

  Extraction eval (run_extraction_eval.py):
  [ ] Anti-pattern fixture: extracted_commitments == 0 (ZERO TOLERANCE)
  [ ] Aggregate Precision ≥ 91%
  [ ] Aggregate Recall ≥ 87%
  [ ] Aggregate F1 ≥ 89%
  [ ] Results written to eval/results/extraction_eval_{timestamp}.json

  Resolution eval (run_resolution_eval.py):
  [ ] Match Accuracy ≥ 85%
  [ ] Detection Accuracy ≥ 90%
  [ ] False Positive Rate (wrongly RESOLVED) ≤ 5%
  [ ] Results written to eval/results/resolution_eval_{timestamp}.json

  Report generation:
  [ ] eval_report.py runs without error and produces a Markdown table
      showing today's results

PERFORMANCE GATES (measured, not just estimated):
  [ ] /extract P95 < 8s for standup fixtures (measured across eval run)
  [ ] /resolve P95 < 3s for resolution_fixture_03 (measured)
  [ ] Cost per extraction: measured and recorded in eval results file
  [ ] Cost per resolve: measured and recorded

FULL PIPELINE CAPSTONE TEST:
  [ ] Raw messy transcript → /cleanup → /extract → /resolve: full chain
      executes without exception
  [ ] Human reviewer confirms: commitments are genuine, resolutions are
      credible, summary is coherent
  [ ] At least one resolved_update in the chain result (demonstrates
      the full pipeline's ability to detect completion end-to-end)

PHASE 4 COMPLETION CRITERIA (ALL must be true to sign off):
  ✓ Three endpoints functional and authenticated: /transcripts/cleanup,
    /extract, /resolve
  ✓ Extraction eval gates passed (P/R/F1 + anti-pattern)
  ✓ Resolution eval gates passed (match accuracy + detection accuracy + FPR)
  ✓ Full pipeline capstone test: human "correct" judgment
  ✓ Day 55 baseline metrics permanently recorded in eval/results/
  ✓ eval_report.py produces the Phase 4 comparison table
  ✓ api/main.py has all three routers registered
  ✓ services/resolution/__init__.py exports the complete public API
    of the resolution package: resolve(), detect_resolution(), detect_many(),
    run_resolution_pipeline()
  ✓ README.md updated to document the three endpoint contracts and
    how to run the eval harness (a second engineer can invoke the eval
    from the README instructions alone)
  ✓ Node.js integration contract for /resolve documented in resolve.py
    (same format as Day 50's /extract integration contract comment block)
```

---

## 10. Phase 4 Handoff — What Passes to Day 56+

```
STABLE CONTRACTS THAT DAY 56+ MUST NOT BREAK:
  POST /transcripts/cleanup request/response schema — frozen
  POST /extract request/response schema — frozen (team_timezone added Day 51)
  POST /resolve request/response schema — frozen as of today
  normalize_text() algorithm — frozen (similarity engine + resolver depend on it)
  golden_dataset/ fixtures — frozen as the Day 55 baseline reference

WHAT DAY 56+ BUILDS ON:
  Day 56: pgvector embedding infrastructure + Supabase migration
    → imports chunker.py (Day 48) — unchanged
    → imports openai_client.py (Day 46) — uses TaskType.EMBEDDING → ModelTier.EMBED
    → imports extraction_models.py (Day 49) — uses ParsedCommitment for what to embed
  Day 57: RAG retrieval + re-ranking
    → builds on Day 56's embedding infrastructure
  Day 58: AI Intelligence chat (RAG-grounded)
    → builds on Day 57's retrieval layer
    → first use of GPT-4.1 (full model) in the service (heavier reasoning for chat)
  Days 59-60: Frontend integration, eval expansion, phase sign-off

WHAT TODAY'S CODE DOES NOT NEED TO KNOW ABOUT DAYS 56+:
  The resolution pipeline, the extraction pipeline, and the cleanup pipeline
  are complete as-is. They will continue to process meetings independently
  of the RAG/chat features being added. The embedding and RAG work is
  additive (new endpoints, new models, new tables) — it does not modify
  the Phase 4 components.
```

---

## 11. Risks and Open Decisions

```
RISK / DECISION                              RESOLUTION TODAY / DEFERRED TO
──────────────────────────────────────────────────────────────────────────
Eval fails to meet targets on first run      Primary lever: add more examples
(Precision < 91% or Recall < 87%)           to commitment_examples.txt (Day
                                              49's few-shot examples). Secondary:
                                              refine extraction_system.txt
                                              SECTION 5 anti-patterns with
                                              the specific false-positive cases
                                              from the eval run. Bump prompt
                                              version tag after any change.
                                              Escalation path if prompt tuning
                                              insufficient: upgrade extraction
                                              to GPT-4.1 (full model) for
                                              one week, measure again, decide.

Resolution false positive rate > 5%         Primary lever: raise
(wrongly RESOLVED commitments)               STAGE2_CONFIDENCE_THRESHOLD
                                              from 0.70 to 0.75 (one-line
                                              config change). Re-run eval.
                                              If still > 5%: review Stage 1
                                              completion keyword list for
                                              ambiguous keywords (e.g. "reviewed")
                                              that are passing through to Stage 2
                                              with insufficient Stage 2 filtering.

new_04 ("I'll review Ali's PR") detection    If the full model incorrectly
— future-tense "I'll review" is a           returns resolved=True for this
known tricky case for the model              case: add it as a explicit example
                                              to resolution_system.txt SECTION 4
                                              (SECTION 4 CASE 8: Re-commitment).
                                              Test verifies this case specifically.
                                              Treat any incorrect detection here
                                              as a prompt quality issue requiring
                                              an immediate fix before Day 55 sign-off.

eval/results/*.json gitignore:               Add "eval/results/*.json" to
result files may be accidentally committed   .gitignore explicitly today.
if .gitignore isn't configured               Keep eval/results/.gitkeep in
                                              git (empty file to preserve
                                              the directory). Verify before
                                              commit.

Performance: resolver_pipeline.py          The primary risk is not the
under load (multiple concurrent /resolve    Python algorithm (O(N×M),
calls — e.g. 10 meetings processed          fast) but the Stage 2 OpenAI
in parallel by Node.js Bull queue)          calls. With STAGE2_MAX_CONCURRENT_CALLS=5
                                              and Day 46's global process-wide
                                              Gemini/OpenAI semaphore, the
                                              service handles concurrent resolve
                                              calls without exceeding the API's
                                              rate limits. Load test with 5
                                              concurrent /resolve calls is the
                                              Day 56's first operational
                                              concern — not Day 55's scope.
```

---

*Document: AI-PIPELINE-DAY55-DEEP | Vocaply | Version 1.0*
*Principal Backend Engineer + Principal AI/RAG Engineer Edition*
*`/resolve` Endpoint · Resolver Pipeline · Phase 4 Evaluation Harness · Full Integration*
*OpenAI GPT-4.1 Mini (Detection) · Phase 4 Closing Day*
*Planning Document Only — No Implementation Code*
