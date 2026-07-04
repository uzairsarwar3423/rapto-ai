# Vocaply — AI Pipeline: Day 50 Deep Build Plan
## Full `/extract` Endpoint — Orchestration, Multi-Chunk Handling, Merge/Dedup, Partial Failure
> Principal Backend Engineer (25+ yrs) + Principal AI/RAG Engineer Edition
> Stack: Python 3.12 · FastAPI · Pydantic v2 · OpenRouter → Gemini 2.5 Flash-Lite · asyncio · tenacity
> Document: AI-PIPELINE-DAY50-DEEP | Version 1.0 | Planning Only — No Code

---

## 0. What This Day Actually Is

Day 50 is the day the AI pipeline's front door opens. Every piece built across Days 46–49 — the `GeminiClient`, the transcript cleanup pipeline, the chunker, the extraction schema, the parsers — has been built in isolation, tested in isolation, and proven in isolation. Today is the first day a single HTTP call can traverse the entire chain and produce real, structured, business-valuable output from a real meeting transcript.

But "wiring things together" undersells what this day actually is. The orchestration logic in `extractor.py` is itself a non-trivial engineering problem: long meetings must be split across multiple model calls and their results merged without loss or duplication; model calls must run concurrently but within a budget; partial failures must be isolated without destroying successful work; the endpoint must handle the full range of meeting sizes from a 10-minute one-on-one to a 3-hour planning session. None of these properties emerge automatically from connecting the Day 46–49 modules — they must be explicitly designed into the orchestrator.

This is also the day the **Node.js extraction worker integration contract** is locked down. The shape of what `POST /extract` accepts and returns is not just a FastAPI implementation detail — it is the API the existing Node.js `extract.worker.ts` (already scaffolded in the platform's backend, per the Day 17-18 plans) must be updated to call. Any shape mismatch discovered after Day 50 requires coordinated changes across two services in two languages. Getting this right today matters.

---

## 1. Architectural Decisions Made Today

```
DECISION 1 — extractor.py is the ONLY file that knows about chunking,
  concurrent dispatch, and cross-chunk merge; callers see a single
  async function
  extract(request: ExtractRequest, gemini_client: GeminiClient)
    -> ExtractionResultWithMeta
  Everything below that signature — how many chunks, how they run,
  how their results merge — is an implementation detail hidden from
  the route handler, hidden from the Node.js caller, and hidden from
  the parsers. This encapsulation is what allows the chunking strategy,
  the concurrency level, or the merge algorithm to be changed without
  touching the HTTP layer or the Node.js side.

DECISION 2 — The endpoint accepts CLEANED transcript, never raw
  POST /extract requires CleanedTranscriptTurn[] as its input shape,
  not RawTranscriptTurn[]. This is enforced at the Pydantic model level,
  not just by convention. WHY: the extraction prompt and parsers are
  designed for cleaned text (no fillers, no ASR artifacts, coherent
  speaker attribution). Feeding raw text would silently degrade accuracy
  in ways that are hard to measure and easy to overlook. Making the
  boundary explicit and typed means a Node.js caller that accidentally
  sends raw transcript gets a 422 immediately, not subtly wrong
  extraction results.

DECISION 3 — Bounded concurrency at the EXTRACTOR level, not just the
  client level
  Day 46's GeminiClient has a process-wide semaphore. Today's extractor
  adds a SECOND, extractor-scope concurrency limit on chunk dispatch.
  WHY two levels: the process-wide semaphore protects against all
  concurrent callers from all endpoints saturating Gemini together.
  The extractor-scope limit protects against a single very large meeting
  (many chunks) monopolizing the entire process-wide concurrency budget,
  starving other smaller concurrent meetings. This is the "noisy neighbor
  within a single service" problem — the two-level approach solves it
  without complex per-meeting resource partitioning.

DECISION 4 — PartialExtractionFailure is a FIRST-CLASS RESPONSE, not
  an exception
  When one or more chunks fail (after Day 46's internal retries are
  exhausted) but other chunks succeed, the extractor returns a
  PartialExtractionFailure value object — NOT a raised exception.
  The HTTP route maps this to a specific, non-500 status code (206
  Partial Content — or a custom application-level code if 206's HTTP
  semantics are too ambiguous in this context — the exact HTTP status
  is a decision point discussed in §5.8). WHY: the Node.js caller has
  its own job-retry logic (per the Day 18 plan) and can decide whether
  to accept a partial result (e.g. for a large meeting where 9 of 10
  chunks succeeded) or retry the whole job. Making this a first-class
  return value rather than an exception gives the caller all the
  information it needs to make that decision — how many chunks failed,
  which ones, what partial data exists — without having to parse an
  exception message.

DECISION 5 — Summary comes from the FIRST chunk, not re-generated
  This is a deliberate quality/cost trade-off. Generating a single
  coherent summary from a multi-chunk meeting would require either:
  (a) A second model call on concatenated summaries from all chunks
      (additional cost, additional latency), or
  (b) Having the first chunk's summary cover the whole meeting (impossible
      when the first chunk is only 1/8 of a long all-hands)
  The CORRECT design for a production meeting intelligence tool is:
  the per-chunk extraction produces SHORT NOTES per chunk (not a
  full summary) and a dedicated /summarize endpoint (scaffolded in the
  broader phase plan, built later) produces the real meeting summary
  from the full cleaned transcript. Today's `summary` field in
  ExtractionResponse is therefore a FIRST-CHUNK EXECUTIVE NOTE —
  useful for short meetings where the first chunk is the whole meeting,
  honest-but-limited for multi-chunk meetings. The ExtractionResultWithMeta
  explicitly carries a `summary_scope: Literal["full","partial_first_chunk"]`
  field so callers know which they received. This is not a deferred
  problem to fix later — it is an explicit, documented, intentional
  limitation that the Node.js side and the frontend must understand
  and handle.

DECISION 6 — Token/cost metadata is aggregated per meeting call, not
  hidden inside each chunk
  ExtractionResultWithMeta carries a single CostRecord summed across
  all chunk calls, plus a per_chunk_costs: list[CostRecord] for
  debugging/audit. This makes the cost of extracting one meeting
  immediately visible in a single log line (meeting_id + total cost)
  while still allowing per-chunk investigation when needed. The
  aggregation is done in the extractor, not the route handler — the
  route handler never touches cost data, consistent with the separation
  established on Day 46.
```

---

## 2. Hour-by-Hour Execution Plan (8-Hour Day)

```
9:00 – 9:30    models/extraction_models.py — ExtractRequest,
               ExtractionResultWithMeta, PartialExtractionFailure,
               ChunkExtractionResult (internal), extend models from
               Day 49 to add orchestration-layer types
9:30 – 10:15   services/extraction/extractor.py — ChunkExtractRequest
               builder, prompt assembly, single-chunk extraction
               function (the atomic unit)
10:15 – 11:15  services/extraction/extractor.py — multi-chunk dispatch
               (bounded concurrency, asyncio.gather, exception-isolation
               per chunk)
11:15 – 12:15  services/extraction/extractor.py — cross-chunk merge
               algorithm (commitment dedup, action item dedup, decision/
               blocker concat, summary scope logic, cost aggregation)
12:15 – 1:00   Lunch
1:00 – 1:45    services/extraction/extractor.py — partial failure
               assembly, PartialExtractionFailure construction,
               final ExtractionResultWithMeta assembly
1:45 – 2:30    api/routes/extract.py — POST /extract endpoint,
               PartialExtractionFailure HTTP mapping, request/
               response model wiring
2:30 – 3:15    tests/test_extractor.py — orchestration unit tests
               (fully mocked GeminiClient), all decision branches
3:15 – 4:00    tests/test_extract_endpoint.py — API-level integration
               tests, partial failure response shape, auth
4:00 – 5:00    End-to-end smoke test: raw fixture → cleanup pipeline
               (Day 46-48) → extract pipeline (Day 49-50), full chain
               verified with live OpenRouter calls
5:00 – 5:45    Long-meeting multi-chunk integration test: 2-hour-
               equivalent fixture, verify multi-chunk path is exercised,
               dedup and merge verified
5:45 – 6:00    End-of-day checklist run-through (§8) + sign-off
```

---

## 3. Full File Structure (Day 50 Scope Only)

```
services/ai-pipeline/src/
│
├── services/extraction/
│   └── extractor.py                   ← THE orchestrator (core of the day)
│
├── models/
│   └── extraction_models.py           ← (extended today) ExtractRequest,
│                                          ExtractResponse (HTTP response envelope),
│                                          ExtractionResultWithMeta,
│                                          PartialExtractionFailure,
│                                          ChunkExtractionResult (internal),
│                                          SummaryScopeType
│
├── config/
│   └── extraction_config.py           ← NEW today: extraction-specific tuning constants
│                                          (extractor-scope concurrency limit, chunk
│                                          token budget, overlap settings specific to
│                                          extraction as opposed to the generic chunker defaults)
│
└── api/routes/
    └── extract.py                     ← POST /extract

services/ai-pipeline/tests/
├── test_extractor.py                  ← Orchestration logic tests (mocked GeminiClient)
├── test_extract_endpoint.py           ← API-level tests
└── fixtures/
    ├── short_meeting_cleaned.json     ← < 3000 tokens, fits in one chunk (single-chunk path)
    ├── long_meeting_cleaned.json      ← > max_chunk_tokens × 2, forces multi-chunk path
    └── expected_short_extraction.json ← Ground truth for short meeting
```

### Why `extraction_config.py` is added beyond the original file list

The original Day 50 brief implies extraction tuning constants (chunk token budget, extractor concurrency) live in `cleanup_config.py` by inheritance. A principal-level review separates them: these are extraction-specific knobs that have no relationship to the cleanup pipeline's tuning constants. Co-locating them in `cleanup_config.py` would create an increasingly sprawling config file as the pipeline grows, and would make it unclear which constants govern which pipeline stage. A dedicated `extraction_config.py` mirrors the module-level separation already established between `services/cleanup/` and `services/extraction/`.

---

## 4. Dependency Map: What Day 50 Consumes

Before describing what gets built today, it is worth being explicit about what it depends on — specifically, the contracts from prior days that `extractor.py` imports and calls:

```
FROM Day 46 (gemini_client.py):
  GeminiClient.generate_structured(
    task_type=TaskType.EXTRACTION,
    system_prompt: str,
    user_prompt: str,
    response_schema=ExtractionResponse,
    temperature_override: float | None    ← Day 49 established this can be
  ) -> GeminiCallResult[ExtractionResponse]  overridden per task; extractor
                                              uses 0.1 for extraction calls

FROM Day 48 (chunker.py):
  chunk_content(
    content: TranscriptContent,
    strategy=ChunkingStrategy.SPEAKER_TURN_GROUPED,
    max_tokens: int,
    overlap_turn_count: int
  ) -> tuple[list[TextChunk], ChunkMetadata]

FROM Day 49 (extraction_models.py):
  ExtractionResponse         ← schema sent to GeminiClient
  ExtractedCommitment        ← raw model output type
  ExtractedActionItem        ← raw model output type

FROM Day 49 (commitment_parser.py, action_item_parser.py,
             decision_parser.py, blocker_parser.py):
  parse_commitment(raw) -> ParsedCommitment
  parse_action_item(raw) -> ParsedActionItem
  parse_decision(raw) -> ParsedDecision
  parse_blocker(raw) -> ParsedBlocker

FROM Day 47 (cleanup_models.py):
  CleanedTranscriptTurn      ← what ExtractRequest.cleaned_transcript contains

FROM Day 46 (models/common.py):
  CostRecord                 ← cost aggregation
  GeminiCallResult           ← return type from GeminiClient

FROM Day 49 (prompts/):
  extraction_system.txt      ← system prompt (loaded once at module init)
  extraction_user.txt        ← user message template
  commitment_examples.txt    ← injected into system prompt
  action_item_examples.txt   ← injected into system prompt
```

---

## 5. Detailed Implementation Logic — File by File

### 5.1 `config/extraction_config.py`

**Logic:**
- `EXTRACTION_CHUNK_MAX_TOKENS: int = 90_000` — the token budget per extraction chunk. Deliberately set well below the model's actual context window ceiling (Gemini 2.5 Flash-Lite's published context window as of June 2026) with a safety margin for the system prompt + few-shot examples + output tokens. This is a conservative value by design — the cost of being too conservative (one extra chunk on a borderline-length meeting) is far lower than the cost of being too aggressive (a silent truncation or a model context-overflow error mid-extraction). Expressly NOT a copy of the cleanup batch token budget (which is smaller, ~2000 tokens — that was for a single GRAMMAR NORMALIZATION batch; this is the available window for feeding an entire chunk of MEETING CONTENT to the extraction model, an entirely different scale).
- `EXTRACTION_CHUNK_OVERLAP_TURNS: int = 3` — number of turns from chunk N to prepend to chunk N+1, per Day 48's overlap design. Set to 3 (not the cleanup batch's overlap convention) because extraction's concern is commitment phrases that straddle a chunk boundary — a typical commitment is expressed in 1-2 turns, so 3-turn overlap provides adequate context coverage without excessive duplication.
- `EXTRACTOR_CHUNK_CONCURRENCY: int = 3` — the extractor-scope concurrency limit (Decision 3's second level). Set lower than the process-wide GeminiClient semaphore limit to leave headroom for other concurrent meetings, as discussed in Decision 3's rationale.
- `EXTRACTION_PROMPT_CACHE: bool = True` — a flag controlling whether the assembled system prompt string is cached at module level after first load (the prompt is read from .txt files, combined, and memoized) or re-assembled on every call. Memoized-by-default because the system prompt content is static and re-reading files on every extraction call is pure waste; the flag allows disabling cache during development/prompt-iteration sessions without code changes.
- `CONFIDENCE_FLOOR: float = 0.3` — the minimum confidence for a commitment to survive post-processing. Extracted from `models/extraction_models.py`'s model_validator (which enforces it at the schema level) and mirrored here as an explicit config constant so the value is visible in one place and the parser's dedup logic can reference the same constant rather than re-hardcoding it.

### 5.2 `models/extraction_models.py` (extended for Day 50)

**New types added today (all orchestration-layer types, not raw-model types):**

**(a) `ExtractRequest(BaseModel)` — the public input contract:**
- `meeting_id: str` — the Vocaply meeting identifier. `min_length=1`. Carried through the entire pipeline for logging/tracing but never used to look up data (this service is stateless — it receives everything it needs in the request).
- `team_id: str` — tenant identifier. `min_length=1`. Carried for structured logging and cost-attribution (per Day 46's cost tracking design, every logged cost record carries `team_id` so cost can be aggregated per team in the billing pipeline).
- `meeting_date: datetime` — the meeting's scheduled datetime in UTC. Used by the extraction user-prompt template (§5.5) to give the model a relative-date anchor. Used later by the date parser (Day 51). Required (not optional) because date context materially affects extraction quality.
- `meeting_title: str` — injected into the user prompt for context. `max_length=500`.
- `cleaned_transcript: list[CleanedTranscriptTurn]` — the extraction input. Type-enforced to be cleaned transcript (not raw), as per Decision 2. `min_length=1` (an empty transcript is a caller error, not a normal empty-result case).
- `participants: list[ParticipantInfo]` — the resolved participant list, injected into the user prompt to give the model display-name context for owner attribution. The same `ParticipantInfo` type from Day 47's `cleanup_models.py` — shared type, not duplicated.
- `meeting_duration_seconds: float` — total meeting duration. Used by today's orchestrator for one specific purpose: logging and metadata only (not for re-running Day 48's timestamp validation — that is the cleanup pipeline's job, already completed before this request arrives). Carried as part of request metadata for completeness.

**(b) `ChunkExtractionResult(BaseModel)` — internal per-chunk result (never exposed in API responses):**
- `chunk_id: str` — from `TextChunk.chunk_id`, for dedup-key lookups and logging.
- `chunk_index: int` — position in the chunk sequence, for ordered reassembly.
- `succeeded: bool`.
- `parsed_commitments: list[ParsedCommitment] | None`.
- `parsed_action_items: list[ParsedActionItem] | None`.
- `parsed_decisions: list[ParsedDecision] | None`.
- `parsed_blockers: list[ParsedBlocker] | None`.
- `summary: str | None` — the per-chunk summary from `ExtractionResponse.summary`.
- `cost: CostRecord | None` — populated on success, None on failure.
- `error: str | None` — failure description, None on success.
- `is_first_chunk: bool` — flags the chunk whose summary becomes the meeting-level summary in `ExtractionResultWithMeta` (per Decision 5's first-chunk summary logic).

**(c) `SummaryScopeType(str, Enum)`: `FULL`, `PARTIAL_FIRST_CHUNK`:**
- `FULL` means: the cleaned_transcript fit in one chunk — the summary covers the entire meeting.
- `PARTIAL_FIRST_CHUNK` means: the meeting was multi-chunk — the summary covers only the first chunk's content. The Node.js caller and frontend must handle these two cases differently (e.g. show a "summary covers first portion of meeting; full summary available via /summarize" UI indicator for `PARTIAL_FIRST_CHUNK`).

**(d) `ExtractionResultWithMeta(BaseModel)` — successful full response:**
- `meeting_id: str`, `team_id: str`.
- `commitments: list[ParsedCommitment]` — merged, deduped across all chunks.
- `action_items: list[ParsedActionItem]` — merged, deduped.
- `decisions: list[ParsedDecision]` — concatenated across chunks.
- `blockers: list[ParsedBlocker]` — concatenated across chunks.
- `summary: str` — per Decision 5's logic.
- `summary_scope: SummaryScopeType`.
- `extraction_model: str` — the OpenRouter model string actually used (from `model_routing.py`'s resolved value, carried back through `GeminiCallResult`), for audit/version-tracking.
- `prompt_version: str` — the version tag read from `extraction_system.txt`'s first-line version marker (per Day 49's versioning convention).
- `chunks_total: int`, `chunks_succeeded: int`.
- `total_cost: CostRecord` — sum across all chunks.
- `per_chunk_costs: list[CostRecord]` — per Decision 6, for debugging.
- `processing_time_ms: float`.

**(e) `PartialExtractionFailure(BaseModel)` — first-class partial failure response (Decision 4):**
- `meeting_id: str`, `team_id: str`.
- `succeeded_chunks: int`, `failed_chunks: int`, `total_chunks: int`.
- `partial_result: ExtractionResultWithMeta | None` — if at least one chunk succeeded, the partial result assembled from succeeded chunks is included here. `None` only if every chunk failed.
- `failed_chunk_indices: list[int]` — which chunks failed, for the Node.js caller's retry strategy (it may choose to retry only the failed chunks in a future version, or simply retry the whole job knowing which chunks to expect problems with).
- `error_summary: str` — a human-readable summary of the failure(s), for logging.

**(f) `ExtractResponse(BaseModel)` — the HTTP response envelope:**
- Discriminated union: `result: ExtractionResultWithMeta | PartialExtractionFailure`.
- `success: bool` — `True` for full success, `False` for partial failure (matching the platform-wide `{success: bool}` response convention already established in the Node.js API, so any engineer reading logs from either service sees the same shape).
- `request_id: str` — echoed from the request's X-Request-ID header (Day 46's middleware convention).

### 5.3 `prompts/` — Assembly at Module Init Time

**Logic (belongs in `extractor.py`'s module-level initialization, not in the `prompts/` directory itself):**
- The system prompt is assembled ONCE when the extraction module is first imported, not on every call. Assembly: `extraction_system.txt` content + `commitment_examples.txt` content (injected at the designated marker in the system prompt file, e.g. `{{COMMITMENT_EXAMPLES}}`) + `action_item_examples.txt` content — yielding a single assembled string stored as a module-level constant.
- The assembled string is measured for token count via `tokenization.py`'s estimator and logged at service startup (not per call) — this gives operators an immediate, visible signal if a prompt-file edit inflated the system prompt size beyond expectation (a common accidental cost regression when adding examples).
- The `prompt_version` tag is read from `extraction_system.txt`'s first line at this same module-init time and stored as a module-level constant, available for inclusion in `ExtractionResultWithMeta` without re-reading the file on every call.
- If any prompt file is missing or unreadable, a `PromptLoadError` (a new subclass of `AIPipelineError` from Day 46's exception hierarchy) is raised at import time — matching the fail-fast-at-startup discipline applied to settings validation and database connections throughout the service. Missing a prompt file at request time is not a recoverable condition; it is a deployment error that should prevent the service from starting, not be discovered on the first production request.

### 5.4 `services/extraction/extractor.py` — The Orchestrator

**Logic in five clearly-separated phases:**

**(a) Input validation and pre-flight:**
- Receives `request: ExtractRequest` and `gemini_client: GeminiClient`.
- Measures `total_transcript_tokens` via `tokenization.estimate_token_count(full_transcript_text)` where `full_transcript_text` is the concatenated content of all cleaned turns. This is a pre-flight measurement only — it feeds into `ExtractionResultWithMeta`'s metadata and into the log entry that starts every extraction job, giving operators a per-meeting "input size" signal without paying any Gemini cost.
- Validates participant list is non-empty (a caller using the API correctly will always provide participants, but a defensive check here produces a clear 422 rather than a confusing "owner_name is empty" extraction artifact downstream).

**(b) Chunking decision:**
- Calls `chunk_content(TranscriptContent(turns=request.cleaned_transcript), strategy=SPEAKER_TURN_GROUPED, max_tokens=EXTRACTION_CHUNK_MAX_TOKENS, overlap_turn_count=EXTRACTION_CHUNK_OVERLAP_TURNS)` → `(chunks: list[TextChunk], chunk_meta: ChunkMetadata)`.
- Logs: `meeting_id`, `total_turns`, `total_tokens_estimate`, `chunks_count`. This single log line at the start of every extraction is the diagnostic entry point for "why did this meeting take so long" or "why did this meeting cost so much" investigations.
- For `len(chunks) == 1`: the single-chunk path is taken. The multi-chunk path is avoided entirely — no concurrency overhead, no merge overhead, no overlap processing. The result from one chunk IS the final result. This is not premature optimization; the majority of Vocaply's meetings (15-30 minute standups) will fit in a single chunk, and the single-chunk path should be provably fast and simple.

**(c) Per-chunk extraction (the atomic unit):**
- A private async function `_extract_one_chunk(chunk: TextChunk, request: ExtractRequest, gemini_client: GeminiClient, is_first_chunk: bool) -> ChunkExtractionResult`:
  1. Assembles the user prompt from `extraction_user.txt` template, injecting: `meeting_title`, `meeting_date` (ISO format), formatted participant list, and `chunk.content` (the chunk's transcript text, already formatted as `[Speaker Name]: text` lines by Day 48's chunker via `CleanedTranscriptTurn`'s serialization).
  2. Calls `gemini_client.generate_structured(task_type=TaskType.EXTRACTION, system_prompt=ASSEMBLED_SYSTEM_PROMPT, user_prompt=user_prompt, response_schema=ExtractionResponse)` → `GeminiCallResult[ExtractionResponse]`. Temperature override is passed as `0.1` (per Day 49's extraction config, via Day 46's client override mechanism).
  3. Runs each list in `raw_result.data` through its parser: `parse_commitment(c)` for each commitment, `parse_action_item(a)` for each action item, etc.
  4. Returns a `ChunkExtractionResult(succeeded=True, ...)` populated with the parsed outputs and cost data.
  5. On any exception (propagated from Day 46's exhausted-retries error hierarchy — `GeminiRateLimitExhaustedError`, `GeminiSchemaValidationError`, `GeminiTimeoutError`): catches at THIS boundary (not inside the client, which already handles transient errors internally), logs the failure with full context (`chunk_id`, `chunk_index`, `meeting_id`, `error_type`, `error_detail`), and returns `ChunkExtractionResult(succeeded=False, error=str(exc), ...)` — never re-raises. This is the exact isolation contract that makes partial failure isolation work: the per-chunk function converts all failure modes into a typed result value, so `asyncio.gather` in the multi-chunk dispatcher never sees an unhandled exception from a single-chunk failure.

**(d) Multi-chunk concurrent dispatch:**
- An `asyncio.Semaphore(EXTRACTOR_CHUNK_CONCURRENCY)` is acquired for each chunk's coroutine (this is the extractor-scope second level from Decision 3, complementing Day 46's process-wide semaphore).
- The semaphore wrapping: each chunk's coroutine is `async with extractor_semaphore: result = await _extract_one_chunk(...)`, gathered via `asyncio.gather(*chunk_coroutines)` with `return_exceptions=False` — because (as established in Day 48's chunker orchestration, same reasoning applies here) each `_extract_one_chunk` already converts exceptions to typed result values and never raises; `return_exceptions=True` would be misleading (implying exceptions are expected, which they're not after this per-chunk exception-isolation contract).
- Order preservation: `asyncio.gather` preserves the order of its argument coroutines in the results list, so `chunk_results[i]` always corresponds to `chunks[i]`. This is a `gather` implementation contract, not something the code needs to explicitly sort — but it is documented in a comment in the extractor, because an engineer unfamiliar with `gather`'s ordering guarantee might add unnecessary sort logic that obscures the intent.
- The first chunk to be dispatched is always `chunks[0]` (chronologically first in the meeting) — while concurrent dispatch means their COMPLETION order is non-deterministic, the `is_first_chunk=True` flag is set based on `chunk.chunk_index == 0`, not based on completion order. This is the subtle correctness detail that ensures the "first chunk provides the summary" logic (Decision 5) is based on meeting chronology, not dispatch race outcome.

**(e) Cross-chunk merge algorithm:**
- Takes `chunk_results: list[ChunkExtractionResult]` (some may have `succeeded=False`).
- **Commitment merge (the most complex merge):**
  - Collects all `ParsedCommitment` objects from all SUCCESSFUL chunks.
  - Builds a `seen_dedup_keys: set[str]` for in-meeting commitment deduplication. For each commitment (iterating chunks in `chunk_index` order to make the merge deterministic): if `commitment.dedup_key not in seen_dedup_keys`, add to final list, add key to seen set. If already seen (a cross-chunk duplicate from overlap), compare confidence: if the new instance's confidence > the already-retained instance's confidence, REPLACE the retained instance (finding it by dedup key in a parallel dict) and update the set. After all chunks are processed, the final list is built from the dict's values in their original insertion-vs-replacement order.
  - Edge case: two commitments with the same dedup_key but legitimately different due_date_raw (a person commits to the same task in two different contexts with different deadlines — realistically rare in one meeting, but theoretically possible). The tie-breaking rule: retain the instance with the later-in-meeting position (higher chunk index) as the most recent statement, with this specific rule documented in a comment. This edge case is logged as a DEBUG-level event when it occurs, giving the eval harness visibility into how often the tie-breaking rule fires.
- **Action item merge:** same dedup-key-based approach as commitments (Day 49's `action_item_parser.build_dedup_key()` provides the key). Same replace-if-higher-confidence semantics.
- **Decision and blocker merge:** simpler — concatenate across chunks, apply a text-similarity dedup pass (text normalized to lowercase + stripped, first-80-chars hash, same approach as the parser's own dedup) to remove duplicate detections of the same decision/blocker from overlapping chunks. No confidence-based replacement logic here because decisions and blockers are not scored in the same way.
- **Summary logic (Decision 5):** `first_successful_chunk = next((r for r in sorted(chunk_results, key=lambda r: r.chunk_index) if r.succeeded), None)`. If found: `summary = first_successful_chunk.summary`, `summary_scope = FULL if len(chunks) == 1 else PARTIAL_FIRST_CHUNK`. If no successful chunks at all: `summary = ""`, `summary_scope = PARTIAL_FIRST_CHUNK`.
- **Cost aggregation (Decision 6):** `total_cost` is built by summing each successful `ChunkExtractionResult.cost`'s `input_tokens`, `output_tokens`, `total_tokens`, and `estimated_cost_usd` into a single `CostRecord`. Per-chunk cost list is preserved in the same order as chunks. Failed chunks contribute `None` to `per_chunk_costs` (a placeholder that communicates "we don't know the cost of this attempt because it ultimately failed after retries, though some retry attempts did incur cost inside the GeminiClient's retry loop" — a known honest limitation, since the GeminiClient's internal retry cost tracking is internal to Day 46's implementation).

**(f) Final result assembly:**
- **Full success path** (`all(r.succeeded for r in chunk_results)`): build `ExtractionResultWithMeta` with merged data, cost, scope, model/prompt version metadata, and `processing_time_ms` (wall-clock measured from the start of the `extract()` call). Return it.
- **Partial failure path** (`any(not r.succeeded for r in chunk_results)` but `any(r.succeeded for r in chunk_results)`): build both the `ExtractionResultWithMeta` from succeeded chunks AND the `PartialExtractionFailure` wrapping it. The `partial_result` field carries the best available data; `failed_chunk_indices` lists the positions of failures. Return `PartialExtractionFailure`.
- **Total failure path** (no chunk succeeded): build `PartialExtractionFailure` with `partial_result=None`, `failed_chunks=len(chunks)`. Return it. The route handler maps this to its own specific response code.
- All three paths are **return value paths**, not exception paths — the orchestrator itself never raises after the per-chunk exception isolation. Callers (including the route handler) always receive a typed value, never an unhandled exception from the extraction logic itself.

### 5.5 User Prompt Assembly Detail

**Logic (inside `_extract_one_chunk`, expanding on §5.4c step 1):**
- The participants list is formatted as:
  ```
  Meeting Participants:
  - Ali Raza (ali@vocaply.com)
  - Ahmed Hassan (ahmed@techflow.com)
  - Sara Khan (sara@techflow.com) [External]
  ```
  The `[External]` marker is appended for participants whose `user_id` is `None` (unresolved externals) — giving the model a signal that attribution to this person should not affect Vocaply's internal accountability tracking, which may subtly improve the model's owner_name selection for commitments (it may be less likely to attribute a commitment to an unknown external participant when the resolved team members are clearly labeled).
- The chunk's transcript content is formatted as:
  ```
  [Ali Raza, 00:05]: Good morning everyone...
  [Ahmed Hassan, 01:12]: I'll have the API changes reviewed by Thursday...
  ```
  The timestamp prefix (`MM:SS` format from `start_time`) is deliberately included in the user prompt for context even though Day 49's extraction prompt does not ask the model to extract timestamps. WHY: the timestamp gives the model a meeting-time anchor that helps it understand meeting flow (a commitment said at 01:12 in a 30-minute standup is early in the meeting; one at 28:45 is near the end — context that can subtly influence confidence calibration). The model is instructed in the system prompt to treat timestamps as context-only, not to extract or reproduce them.
- The chunk boundary, if this is not the first chunk, includes a brief context note injected before the transcript: `[Note: This is a continuation of the meeting. The preceding section may have contained additional context not reproduced here.]` — this single line, added to all non-first chunks, reduces the model's tendency to try to "complete" an implied context from the overlap turns (the overlap already provides continuity; this note just prevents the model from treating the first line of the chunk as the start of a meeting).

### 5.6 `api/routes/extract.py`

**Logic:**
- `POST /api/v1/extract`, protected by Day 46's `verify_internal_service_key` dependency.
- Request body: `ExtractRequest`.
- Handler: injects `gemini_client` via Day 46's `Depends()`, starts a wall-clock timer (the route-level processing time, distinct from the extractor's own internal timer — the difference is the serialization/deserialization overhead, small but logged), calls `extractor.extract(request, gemini_client)`.
- **Response routing:**
  - `ExtractionResultWithMeta` returned → HTTP 200, `ExtractResponse(success=True, result=result)`.
  - `PartialExtractionFailure` returned with `partial_result` (some chunks succeeded) → **HTTP 206 Partial Content** (the semantically correct code — "the server has fulfilled a partial GET request" in standard HTTP, but generalized here to "partial processing result") OR a platform-specific interpretation: this is the key open decision flagged in Decision 4. The concrete resolution for today: **HTTP 207 Multi-Status** is considered and rejected (it implies XML body structure in the original WebDAV spec, inappropriate here); **HTTP 206** is used with a custom `X-Extraction-Partial: true` header added to the response, clearly distinguishing it from a 2xx-full-success response while remaining in the success family so Node.js worker retry logic (which treats 4xx/5xx as errors) does not automatically retry a partial result that may be the best available data.
  - `PartialExtractionFailure` returned with `partial_result=None` (all chunks failed) → **HTTP 422** with `ExtractResponse(success=False, result=partial_failure)`. WHY 422 and not 500: this is not an internal server error — the service functioned correctly, it called Gemini, Gemini was unreachable or failed validation repeatedly. It is an unprocessable-entity condition (the transcript could not be processed) caused by an upstream dependency failure, distinct from a service-internal bug (500). The Node.js worker's existing job-failure logic already handles 422 as a retryable job failure, per the Day 18 plan — using 500 here would be semantically incorrect and would potentially trigger different alerting behavior than the caller expects.
- No try/except in the route handler — all exceptions from the extractor reach Day 46's global `error_handler` middleware, which maps known `AIPipelineError` subclasses to their HTTP codes. The route handler stays thin.

---

## 6. Node.js Integration Contract (Lock This Down Today)

The following is the explicit API contract that the Node.js `extract.worker.ts` must update to call — documented here as a precise specification, not as implementation guidance for the Python side (which is already defined above), but as the cross-service contract that must be agreed and written down before Day 50 ends:

```
ENDPOINT:    POST https://{ai_pipeline_host}/extract
AUTH:        X-Internal-Service-Key: {API_SHARED_SECRET}
CONTENT-TYPE: application/json

REQUEST BODY (ExtractRequest):
  {
    "meeting_id":           "mtg_clx01abc",
    "team_id":              "team_clx02xyz",
    "meeting_date":         "2026-06-09T09:00:00Z",
    "meeting_title":        "Monday Standup",
    "meeting_duration_seconds": 1680.0,
    "cleaned_transcript": [     ← CleanedTranscriptTurn[] shape from Day 47
      {
        "turn_id":        "uuid",
        "cleaned_text":   "I'll finish the login feature by Thursday",
        "original_text":  "Um, I'll like finish the login feature by Thursday",
        "speaker_name":   "Ahmed Hassan",
        "speaker_user_id": "usr_clx03def",
        "start_time":     72.4,
        "end_time":       76.1,
        "filler_words_removed": 2,
        "was_modified":   true,
        "was_modified_suspiciously": false,
        "uncertain":      false,
        "confidence_detail": { ... }
      }
    ],
    "participants": [           ← ParticipantInfo[] — resolved from meeting_participants table
      {
        "user_id":    "usr_clx03def",
        "name":       "Ahmed Hassan",
        "email":      "ahmed@techflow.com",
        "speaker_tag": "Speaker 1"
      }
    ]
  }

SUCCESS RESPONSE (HTTP 200):
  {
    "success": true,
    "request_id": "req_clxabc",
    "result": {
      "meeting_id":    "mtg_clx01abc",
      "team_id":       "team_clx02xyz",
      "commitments":   [ ParsedCommitment[] ],
      "action_items":  [ ParsedActionItem[] ],
      "decisions":     [ ParsedDecision[] ],
      "blockers":      [ ParsedBlocker[] ],
      "summary":       "...",
      "summary_scope": "FULL",
      "extraction_model": "google/gemini-2.5-flash-lite",
      "prompt_version": "extraction-v1.0",
      "chunks_total":   1,
      "chunks_succeeded": 1,
      "total_cost": { "input_tokens": ..., "output_tokens": ..., "estimated_cost_usd": ... },
      "per_chunk_costs": [ ... ],
      "processing_time_ms": 1847.3
    }
  }

PARTIAL SUCCESS RESPONSE (HTTP 206, X-Extraction-Partial: true):
  {
    "success": false,
    "request_id": "req_clxabc",
    "result": {
      "meeting_id":  "mtg_clx01abc",
      "team_id":     "team_clx02xyz",
      "succeeded_chunks":    7,
      "failed_chunks":       1,
      "total_chunks":        8,
      "failed_chunk_indices": [3],
      "error_summary":       "Chunk 3 failed: GeminiRateLimitExhaustedError after 3 retries",
      "partial_result": { ... ExtractionResultWithMeta from succeeded chunks ... }
    }
  }

TOTAL FAILURE RESPONSE (HTTP 422):
  {
    "success": false,
    "request_id": "req_clxabc",
    "result": {
      "meeting_id":  "mtg_clx01abc",
      "team_id":     "team_clx02xyz",
      "succeeded_chunks":    0,
      "failed_chunks":       3,
      "total_chunks":        3,
      "failed_chunk_indices": [0, 1, 2],
      "error_summary":       "All chunks failed — see structured logs for detail",
      "partial_result":      null
    }
  }

NODE.JS WORKER ACTIONS PER RESPONSE:
  200 → proceed with saving commitments/action-items/decisions/blockers
        to PostgreSQL (per existing extract.worker.ts plan)
  206 → log the partial failure, save the partial_result data, mark the
        meeting with a processing_warning status rather than DONE,
        emit Socket.io meeting:processed_partial event
  422 → treat as job failure, let Bull's retry policy decide next action
  401 → alert immediately (shared secret misconfiguration), do not retry
  503 → transient infrastructure issue, retry as job failure
```

---

## 7. Performance & Cost Considerations Specific to Today

```
- Single-chunk path performance target: < 4 seconds for a 30-min standup
  at Gemini Flash-Lite speeds via OpenRouter. Measured during today's
  end-to-end smoke test and recorded as the baseline. If the real
  measurement significantly exceeds this (e.g. > 8 seconds), root-cause
  before signing off — likely causes: prompt too long (inflate input
  token count), system prompt not cached at module level, tokenization
  adding unexpected overhead.

- Multi-chunk path concurrency: with EXTRACTOR_CHUNK_CONCURRENCY=3 and
  a 2-hour meeting producing ~8 chunks, wall-clock time is approximately
  ceil(8/3) × per_chunk_latency = 3 × 4s = ~12 seconds — an acceptable
  target for a background job (the Node.js caller's job-timeout is
  measured in minutes per the Day 18 plan, not seconds).

- Cost per meeting: from Day 46's established cost tracking, every call's
  real cost appears in OpenRouter's usage.cost field in the response.
  Today's end-to-end smoke test should produce the first REAL cost-per-
  meeting measurement for the extraction step. This figure must be
  recorded and compared to the HLD's target of ~$0.005/meeting total AI
  cost. If the real extraction cost alone already exceeds that, a prompt-
  trimming pass is warranted before Phase 4 proceeds.

- The cost per extraction call (not per meeting) for multi-chunk meetings
  scales linearly with chunk count — this is the expected behavior, not
  a bug. A 2-hour meeting with 8 chunks costs 8× more than a 15-minute
  standup. The platform's pricing model must account for this — flagged
  as a commercial/pricing design consideration, not an engineering
  optimization target for today.
```

---

## 8. Security Considerations Specific to Today

```
- ExtractRequest carries meeting_id, team_id, and participant information
  (names, emails) — real PII. The no-full-request-body-at-INFO logging
  discipline from prior days applies: the route handler logs only
  meeting_id + team_id + cleaned_transcript turn count + participant count
  at INFO level. The full request body is never logged at INFO or above.

- The assembled user prompt content (which includes participant names
  and transcript content) is logged only at DEBUG level, per the existing
  convention. The assembled system prompt is logged ONCE at service
  startup (INFO level — it contains no PII, only static instruction text).

- PartialExtractionFailure responses carry `error_summary` strings that
  are constructed from exception types and counts, NOT from exception
  messages or stack traces that might contain model-response fragments
  (which could contain transcript content). The `error_summary` is safe
  to include in a JSON response body.

- The Node.js integration contract (§6) is an internal service-to-service
  API. The endpoint is never exposed publicly. Auth is by shared secret
  (Day 46). No changes to the security model from prior days.
```

---

## 9. End-of-Day Testing & Definition of Done

```
UNIT TESTS (mocked GeminiClient — no live calls, fast):

  extractor.py — orchestration logic:
  [ ] Short transcript (below EXTRACTION_CHUNK_MAX_TOKENS) → chunker
      produces exactly 1 chunk → exactly 1 GeminiClient call is made
      (assert call count == 1 on the mock)
  [ ] Long transcript (above EXTRACTION_CHUNK_MAX_TOKENS × 2) → chunker
      produces ≥ 3 chunks → GeminiClient called ≥ 3 times, concurrency
      semaphore respected (assert never more than EXTRACTOR_CHUNK_CONCURRENCY
      concurrent calls at any point)
  [ ] Cross-chunk duplicate commitment (same owner + normalized_text in
      two mocked chunk responses) → final merged result contains exactly
      one instance of that commitment; the higher-confidence one is retained
  [ ] Cross-chunk same commitment, confidence equal, different due_date_raw
      → later-in-meeting (higher chunk_index) instance retained, event
      logged at DEBUG
  [ ] One chunk's mock raises GeminiRateLimitExhaustedError →
      ChunkExtractionResult(succeeded=False) produced for that chunk;
      other chunks succeed; PartialExtractionFailure returned with
      correct succeeded_chunks / failed_chunks counts
  [ ] All chunks fail → PartialExtractionFailure(partial_result=None) returned
  [ ] summary_scope = FULL when len(chunks) == 1 and chunk succeeded
  [ ] summary_scope = PARTIAL_FIRST_CHUNK when len(chunks) > 1
  [ ] summary comes from chunk_index=0 regardless of which chunk's
      coroutine completed first (tests that completion-order does not
      affect first-chunk selection)
  [ ] total_cost correctly sums individual chunk costs (known mock cost
      values → assert exact sum)
  [ ] Empty participant list raises a clear validation error before any
      GeminiClient call is made

  extract.py route:
  [ ] ExtractionResultWithMeta returned → HTTP 200, success=true
  [ ] PartialExtractionFailure with partial_result → HTTP 206,
      X-Extraction-Partial header present, success=false
  [ ] PartialExtractionFailure with partial_result=None → HTTP 422,
      success=false
  [ ] Missing auth header → HTTP 401

INTEGRATION TESTS (live OpenRouter calls):

  Short meeting smoke test (short_meeting_cleaned.json):
  [ ] POST /extract with the short fixture → HTTP 200
  [ ] Response validates against ExtractionResultWithMeta schema exactly
  [ ] commitments, action_items, decisions, blockers fields are present
      (may be empty lists, but never absent/null)
  [ ] summary is non-empty
  [ ] summary_scope == "FULL"
  [ ] total_cost.estimated_cost_usd is positive and < $0.10 (sanity bound)
  [ ] processing_time_ms is populated and < 10_000 (10 seconds ceiling
      as a sanity gate, not a strict SLA — real target is < 4s for short)
  [ ] chunks_total == 1 for this fixture (confirms single-chunk path taken)

  Long meeting multi-chunk test (long_meeting_cleaned.json):
  [ ] POST /extract → HTTP 200
  [ ] chunks_total > 1 (confirms multi-chunk path was exercised)
  [ ] per_chunk_costs has len == chunks_total, each entry populated
  [ ] summary_scope == "PARTIAL_FIRST_CHUNK"
  [ ] No duplicate commitments in the merged result (same commitment
      does not appear twice despite overlapping chunks — tests dedup)
  [ ] All commitments have non-empty normalized_text (parsers ran correctly)

  End-to-end pipeline chain test (THE DAY'S CAPSTONE):
  [ ] A raw, messy ASR fixture (entirely new, not a prior-day fixture)
      is run through /transcripts/cleanup (Day 46-48) → cleaned output
      is fed directly into /extract (today) → the final
      ExtractionResultWithMeta is manually inspected for correctness
      by a human reviewer, not just schema-validated
  [ ] The human reviewer confirms: commitments are genuine first-person
      promises, no "we should" false positives, action items are correctly
      attributed, summary is coherent and concise, all confidence scores
      are in [0.3, 1.0]

DEFINITION OF DONE:
  Every unit test passes.
  Both integration tests pass with live OpenRouter calls.
  The end-to-end pipeline chain test receives a "correct" human
  judgement on the manually-inspected output.
  The first real cost-per-meeting figure (extraction step only) is
  recorded in the dev log — this is the baseline against which future
  prompt optimizations will be measured.
  The Node.js integration contract (§6) is written up as a code
  comment in extract.py AND cross-referenced in a comment in the
  Node.js extract.worker.ts stub (however that cross-reference is
  managed in the actual repo — e.g. a TODO link, a shared contract
  doc reference, or a JSON schema file committed alongside both services).
```

---

## 10. Explicit Risks & Open Decisions Carried Forward

```
RISK / DECISION                              RESOLUTION TODAY / DEFERRED TO
─────────────────────────────────────────────────────────────────────────
HTTP 206 vs. a custom response code for     Resolved as HTTP 206 +
partial extraction results                  X-Extraction-Partial header
                                             (see §5.6) — this is a firm
                                             decision for Day 50, to be
                                             validated against the Node.js
                                             caller's actual HTTP-status-
                                             based branching logic before
                                             the end-to-end integration
                                             test is run

Real cost-per-meeting measurement may        If extraction alone exceeds
exceed HLD target after first live test      ~$0.005/meeting, priority
                                             action before Day 51: measure
                                             which prompt section consumes
                                             the most tokens and trim;
                                             failing that, ensure Flash-Lite
                                             is confirmed as the active
                                             model (not accidentally
                                             routing to Flash tier via
                                             model_routing.py)

asyncio.gather concurrency ordering          Documented explicitly in
guarantee relied upon for chunk-index-       extractor.py as a comment
based result mapping                         citing Python 3.12 asyncio
                                             documentation; flagged for
                                             review if Python version
                                             changes in the future

Node.js extract.worker.ts update to call     Out of scope for this Python-
POST /extract with the new contract          focused 5-day plan; flagged as
                                             a required Node.js-side change
                                             to be coordinated before Phase
                                             4's pipeline is deployed end-
                                             to-end in any environment
```

---

*Document: AI-PIPELINE-DAY50-DEEP | Vocaply | Version 1.0*
*Principal Backend Engineer + Principal AI/RAG Engineer Edition*
*Full `/extract` Endpoint — Orchestration · Multi-Chunk · Merge/Dedup · Partial Failure*
*OpenRouter → Gemini 2.5 Flash-Lite | Planning Document Only — No Implementation Code*
