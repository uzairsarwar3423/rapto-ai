# Vocaply — AI Pipeline: Model Migration Plan
## Gemini 2.5 Flash / Flash-Lite (OpenRouter) → GPT-4.1 Mini (OpenAI)
> Principal Backend Engineer (25+ yrs) + Principal AI/RAG Engineer Edition
> Scope: All files built Days 46–50 that must change, why they change, and exactly what changes
> Document: AI-PIPELINE-MODEL-MIGRATION-001 | Version 1.0 | Planning Only — No Code

---

## 0. Migration Philosophy — Read Before Anything Else

```
This is not a "swap the model string and re-test" migration.

A model family change from Gemini to GPT-4.1 Mini touches:
  - The SDK / HTTP client (different library, different call shape)
  - The structured output mechanism (different API parameter names/modes)
  - The token counting (now MORE accurate — tiktoken is GPT's own tokenizer)
  - The cost tracking (different pricing tier, different response fields)
  - The model routing config (different model string format)
  - The settings / environment variables (different API key, different base URL)
  - The prompt content (GPT-4.1 Mini has a different instruction-following
    style than Gemini Flash-Lite — prompts written for one may need tuning
    for the other, though the underlying rules do not change)
  - The golden dataset eval baseline (a new model requires a new accuracy
    baseline measurement before the old one becomes invalid as a target)

WHAT DOES NOT CHANGE:
  - All Pydantic models (ExtractionResponse, CleanedTranscriptTurn, etc.)
    are model-agnostic — they describe data shapes, not model behavior.
  - All business logic in parsers (commitment_parser, action_item_parser, etc.)
    is model-agnostic — it processes parsed output, not model API responses.
  - The chunker, confidence flagger, speaker formatter — none of these
    know about the model.
  - The FastAPI route handlers — they call the client via the same
    internal abstraction, which is the whole point of that abstraction.
  - The Node.js integration contract (§6 of Day 50's plan) — the
    POST /extract request/response shape is unchanged.

MIGRATION RISK LEVEL: MEDIUM
  - The abstraction layers built Days 46–50 were deliberately designed
    to make exactly this kind of swap low-risk. The question is whether
    that design held up in practice (it should — that is what Day 46's
    model-routing decision was built to enable).
  - The residual risk is prompt quality: GPT-4.1 Mini may respond
    differently to the existing prompts than Gemini Flash-Lite did,
    requiring prompt tuning to maintain accuracy targets.

MIGRATION STRATEGY: BRANCH-AND-VALIDATE, NOT IN-PLACE PATCH
  - All changes are made in a feature branch.
  - The golden dataset tests (Day 49's fixtures) are run against the
    migrated service before the branch is merged.
  - Precision/Recall/F1 must meet or exceed the baselines established
    with Gemini before migration is considered complete.
  - If prompt tuning is needed, it happens in this branch, documented
    in the prompt version tag, before merge.
```

---

## 1. Full Inventory of Files That Change

```
MUST CHANGE (breaking — service will not start or produce correct output
  without these changes):

  src/config/settings.py              ← Remove Gemini vars, add OpenAI vars
  src/config/model_routing.py         ← New model strings, new pricing table,
                                          remove OpenRouter-specific headers
  src/services/gemini_client.py       ← RENAME + REWRITE core of this file
                                          (or replace with openai_client.py)
  src/models/common.py                ← TaskType enum potentially unchanged,
                                          ModelTier enum may need renaming,
                                          cost field names need checking
  src/api/deps.py                     ← Client class name update
  src/api/main.py                     ← Client instantiation update
  requirements.txt                    ← Remove google-genai / openai already
                                          present (used for OpenRouter) — verify
  .env.example                        ← Remove OpenRouter vars, add OpenAI vars

SHOULD CHANGE (non-breaking today, but creates stale references that
  become misleading / hard to maintain):

  src/prompts/cleanup_system.txt      ← Test with GPT-4.1 Mini; may need
                                          structural tuning (see §4)
  src/prompts/extraction_system.txt   ← Test + tune for GPT-4.1 Mini;
                                          bump prompt_version tag
  src/prompts/commitment_examples.txt ← May need example reordering/pruning
  src/prompts/action_item_examples.txt← Same
  src/config/extraction_config.py     ← Token budget may need recalibration
                                          (GPT-4.1 Mini has its own context
                                          window ceiling — verify and update
                                          EXTRACTION_CHUNK_MAX_TOKENS)
  src/config/cleanup_config.py        ← GRAMMAR_BATCH_MAX_TOKENS may need
                                          recalibration for the same reason

DOES NOT CHANGE (no edits required):

  src/models/extraction_models.py     ← Pure Pydantic, model-agnostic
  src/models/cleanup_models.py        ← Pure Pydantic, model-agnostic
  src/models/chunk_models.py          ← Pure Pydantic, model-agnostic
  src/models/exceptions.py            ← Exception hierarchy unchanged
  src/services/cleanup/speaker_formatter.py  ← No model dependency
  src/services/cleanup/filler_word_remover.py← No model dependency
  src/services/cleanup/confidence_flagger.py ← No model dependency
  src/services/cleanup/transcript_cleaner.py ← Calls grammar_normalizer
                                               which calls the client —
                                               but via abstraction, no change
  src/services/cleanup/grammar_normalizer.py ← Calls GeminiClient (now
                                               renamed OpenAIClient) via
                                               the same method signature —
                                               no change IF the client's
                                               public API stays identical
  src/services/extraction/extractor.py       ← Same — calls client via
                                               same method signature
  src/services/extraction/commitment_parser.py   ← Model-agnostic
  src/services/extraction/action_item_parser.py  ← Model-agnostic
  src/services/extraction/decision_parser.py     ← Model-agnostic
  src/services/extraction/blocker_parser.py      ← Model-agnostic
  src/services/chunker.py             ← No model dependency
  src/services/tokenization.py        ← Uses tiktoken — actually MORE
                                          accurate now (tiktoken IS
                                          OpenAI's tokenizer), but the
                                          safety margin constant may need
                                          reduction (see §3)
  src/api/routes/health.py            ← Readiness check implementation
                                          changes inside the client, not here
  src/api/routes/cleanup.py           ← Route handler unchanged
  src/api/routes/extract.py           ← Route handler unchanged
  src/middleware/                     ← Unchanged
  tests/                              ← Mocked client tests adapt to new
                                          client class name; live-call tests
                                          run against new model
  eval/golden_dataset/                ← Fixtures unchanged; expected outputs
                                          unchanged; baseline metrics re-run
```

---

## 2. File-by-File Change Plan

### 2.1 `src/config/settings.py`

**What changes:**

Remove all Gemini/OpenRouter-specific variables:
- `GEMINI_API_KEY`
- `GEMINI_FLASH_MODEL_NAME`
- `GEMINI_FLASH_LITE_MODEL_NAME`
- `GEMINI_EMBEDDING_MODEL_NAME`
- (any `OPENROUTER_*` variables if they were added separately)

Add OpenAI-specific variables:
- `OPENAI_API_KEY: SecretStr` — Required. The OpenAI project API key.
- `OPENAI_ORG_ID: str | None` — Optional. OpenAI organization ID for billing attribution when the key belongs to an org account. Defaults to `None` (single-account usage).
- `OPENAI_GPT41_MINI_MODEL_NAME: str = "gpt-4.1-mini"` — The primary extraction/cleanup model. Kept as a setting (not a hardcoded constant) specifically so a future upgrade to `gpt-4.1-mini-2` or a point release is a one-env-var change, not a code change.
- `OPENAI_GPT41_MODEL_NAME: str = "gpt-4.1"` — The heavier reasoning tier for tasks that need it (summaries, chat answers). Default: `"gpt-4.1"`.
- `OPENAI_EMBEDDING_MODEL_NAME: str = "text-embedding-3-small"` — For Day 56+'s RAG embedding work. Established now so the settings contract for embeddings is set correctly from the moment the OpenAI client is used.
- `OPENAI_MAX_RETRIES: int = 3` — Replaces `MAX_GEMINI_RETRIES`. Same default.
- `OPENAI_TIMEOUT_SECONDS: float = 30.0` — Replaces `GEMINI_TIMEOUT_SECONDS`.
- `OPENAI_MAX_CONCURRENT_CALLS: int` — Replaces `GEMINI_MAX_CONCURRENT_CALLS`. Same purpose.

Retain unchanged:
- `MONGODB_URL`, `REDIS_URL`, `ENVIRONMENT`, `LOG_LEVEL`, `API_SHARED_SECRET`, all infrastructure settings.

**Validator additions:**
- The existing validator asserting that two model names are not identical must be updated: `OPENAI_GPT41_MINI_MODEL_NAME != OPENAI_GPT41_MODEL_NAME` (same logic, new field names).
- Add a validator in the `production` environment that confirms `OPENAI_API_KEY` is not a known-bad placeholder (same fail-fast discipline applied to the Gemini key previously).

**`.env.example` changes (mirror of settings changes):**
- Remove all `GEMINI_*` and `OPENROUTER_*` entries.
- Add `OPENAI_API_KEY=sk-proj-...`, `OPENAI_ORG_ID=` (blank optional), `OPENAI_GPT41_MINI_MODEL_NAME=gpt-4.1-mini`, etc.
- The `.env.example` file is the document a new engineer reads first — its accuracy is as important as the settings validation.

### 2.2 `src/config/model_routing.py`

**What changes:**

The task-to-model-tier table stays structurally identical — this is the payoff of Day 46's routing abstraction. Only the VALUES in the table change:

```
OLD (Gemini/OpenRouter slugs):
  TaskType.TRANSCRIPT_CLEANUP  → ModelTier.FLASH_LITE
  TaskType.EXTRACTION          → ModelTier.FLASH_LITE
  TaskType.RESOLUTION_CHECK    → ModelTier.FLASH_LITE
  TaskType.SUMMARY             → ModelTier.FLASH
  TaskType.CHAT_ANSWER         → ModelTier.FLASH
  TaskType.EMBEDDING           → ModelTier.EMBEDDING
  TaskType.RERANK              → ModelTier.FLASH_LITE

NEW (OpenAI model tiers — rename the enum for clarity):
  ModelTier.MINI    ← was FLASH_LITE (lightweight, fast, cheap tasks)
  ModelTier.FULL    ← was FLASH (heavier reasoning tasks)
  ModelTier.EMBED   ← was EMBEDDING

  TaskType.TRANSCRIPT_CLEANUP  → ModelTier.MINI
  TaskType.EXTRACTION          → ModelTier.MINI
  TaskType.RESOLUTION_CHECK    → ModelTier.MINI
  TaskType.SUMMARY             → ModelTier.FULL
  TaskType.CHAT_ANSWER         → ModelTier.FULL
  TaskType.EMBEDDING           → ModelTier.EMBED
  TaskType.RERANK              → ModelTier.MINI
```

**Pricing table update — the most important change in this file:**
```
OLD (Gemini Flash-Lite via OpenRouter):
  Flash-Lite: ~$0.075 input / $0.30 output per 1M tokens
              (OpenRouter adds a markup to base Google pricing)

NEW (GPT-4.1 Mini via OpenAI):
  Verify against current OpenAI pricing page at implementation time.
  Approximate at time of writing this plan:
    gpt-4.1-mini: $0.40 input / $1.60 output per 1M tokens

  IMPORTANT NOTE ON COST IMPACT:
  GPT-4.1 Mini is currently more expensive per token than Gemini
  Flash-Lite. The HLD's documented target of ~$0.005/meeting total AI
  cost was calculated against Gemini Flash-Lite pricing. With GPT-4.1
  Mini at ~$0.40/$1.60 per 1M, the same 30-minute standup
  (~17,500 tokens total across cleanup + extraction) costs approximately:
    Input:  12,000 × ($0.40/1M)  = $0.0048
    Output:  5,500 × ($1.60/1M)  = $0.0088
    Total:                        ≈ $0.0136/meeting
  This is ~2-3× the Gemini Flash-Lite target. This cost difference
  must be acknowledged as part of the migration decision — the
  plan documents it explicitly here so it is visible to anyone
  reviewing the migration, not discovered after launch.
  The pricing table is ALWAYS pulled from settings/config at
  client-construction time (not hardcoded as a constant) — so a
  future pricing correction or model change is one config update.
```

**Remove OpenRouter-specific constants:**
- Any `OPENROUTER_REFERER` / `OPENROUTER_TITLE` header constants that may have been added to `model_routing.py` alongside the routing table are removed — these are OpenRouter-specific and irrelevant for direct OpenAI calls.

**`resolve_model()` function:** signature unchanged; returns `(model_name_string, ModelTier)` — callers see the same interface. Internal implementation now resolves against the OpenAI model names from settings.

### 2.3 `src/services/gemini_client.py` → `src/services/openai_client.py`

**This is the most significant file change in the migration.**

**Decision on renaming:** The file is RENAMED from `gemini_client.py` to `openai_client.py` (and the class from `GeminiClient` to `OpenAIClient`). This is the correct engineering choice rather than keeping the name `gemini_client.py` and having it call the OpenAI SDK — a lie in code naming is a maintenance hazard that compounds over time. All import sites (currently only `api/deps.py` and tests) update to use the new name.

**SDK change:**

```
OLD: The openai Python SDK was used pointing at OpenRouter's base URL
     (since OpenRouter is OpenAI-compatible, the openai SDK already worked).
     Base URL: "https://openrouter.ai/api/v1"
     Extra headers: HTTP-Referer, X-Title (OpenRouter-required)

NEW: The same openai Python SDK, now pointing at OpenAI's own base URL.
     Base URL: "https://api.openai.com/v1" (the SDK's default — no
               base_url override needed for native OpenAI calls)
     No extra headers: HTTP-Referer and X-Title are dropped entirely
               (they were OpenRouter-specific attribution headers;
               OpenAI does not use or require them)
     Organization header: If OPENAI_ORG_ID is set in settings,
               the SDK's openai.organization setting is populated;
               otherwise omitted.

WHAT STAYS IDENTICAL IN THE SDK CALL SHAPE:
  The openai SDK's `client.chat.completions.create(...)` method is
  the same call whether pointing at OpenRouter or OpenAI's own endpoint.
  This is EXACTLY the value proposition of using the openai SDK for
  OpenRouter access that was established on Day 46 — it made this
  migration a base_url change, not an SDK replacement.
```

**Structured output mechanism — the key technical change:**

```
OLD (via OpenRouter):
  response_format={"type": "json_schema", "json_schema": schema_dict}
  → OpenRouter passes this through to the underlying model's
    structured output capability

NEW (native OpenAI):
  OpenAI's Structured Outputs feature (released with GPT-4o and
  available on GPT-4.1 Mini) uses the SAME response_format parameter
  with the SAME json_schema type — the parameter name and structure
  are unchanged. This is not a coincidence: OpenRouter was designed
  to mirror OpenAI's API spec, so the structured output call is
  compatible.

  HOWEVER: OpenAI's native structured output has an additional, more
  powerful mode: passing a Pydantic model directly via the parse()
  method on the beta client, which handles schema generation AND
  response validation natively:

    client.beta.chat.completions.parse(
      model=model_name,
      messages=[...],
      response_format=PydanticModel
    )

  This is the PREFERRED approach for direct OpenAI calls because:
  1. It bypasses the manual model_json_schema() → dict → json_schema
     construction that was needed via OpenRouter
  2. It returns a natively-parsed Pydantic instance, not a raw JSON
     string that the application must validate
  3. The "retry on schema mismatch" logic in the old client becomes
     less necessary (the native parse() is more reliable at schema
     adherence than OpenRouter's pass-through)

  DECISION: use client.beta.chat.completions.parse() for all
  structured output calls where response_schema is provided.
  The fallback to manual JSON validation still exists for the case
  where the beta client raises a parsing error, but it becomes the
  second path (not the first path as it was for OpenRouter).
```

**Cost tracking field name changes:**

```
OLD (OpenRouter response):
  response.usage.prompt_tokens      → input token count
  response.usage.completion_tokens  → output token count
  response.usage.cost               → real billed cost (OpenRouter-specific field)

NEW (OpenAI native response):
  response.usage.prompt_tokens      → SAME field name ✓
  response.usage.completion_tokens  → SAME field name ✓
  response.usage.total_tokens       → SAME field name ✓
  response.usage.cost               → DOES NOT EXIST on native OpenAI
                                       (this was OpenRouter's own extension)

  COST CALCULATION WITH NATIVE OPENAI:
  Without OpenRouter's usage.cost field, cost must be calculated from
  the pricing table in model_routing.py:
    estimated_cost = (prompt_tokens / 1_000_000 × INPUT_PRICE_PER_M) +
                     (completion_tokens / 1_000_000 × OUTPUT_PRICE_PER_M)
  This is LESS accurate than OpenRouter's real-billed cost (which
  included any routing markup) — it is now a pure estimate again,
  the same as the original plan assumed before OpenRouter's cost field
  was incorporated on Day 46/47.
  The CostRecord.estimated_cost_usd field name and type remain unchanged.
  The source changes from "real billed" back to "estimated from pricing table."
  This is documented explicitly in CostRecord's field description.
```

**Retry/backoff — what changes vs. what stays:**

```
STAYS: tenacity-based retry logic, same retry_if_exception_type pattern.
CHANGES:
  - The exception types from the openai SDK differ from the assumed
    HTTP error codes (429 → openai.RateLimitError, 5xx →
    openai.APIStatusError, timeout → openai.APITimeoutError). The
    retry predicate must be updated to catch these OpenAI SDK exception
    types instead of raw HTTP status codes / generic httpx exceptions.
  - openai.AuthenticationError (401) remains non-retryable →
    raises GeminiNonRetryableError (now renamed OpenAINonRetryableError
    per the class rename — or simply AIClientNonRetryableError if
    a model-agnostic name is preferred; this naming decision is called
    out explicitly as a choice point at implementation time).
```

**`/ready` endpoint ping call:**

```
OLD: OpenRouter ping (likely a trivial completion call or a models-list call)

NEW: openai.models.retrieve("gpt-4.1-mini") — the standard, cheap
     OpenAI API-key-validity + connectivity check. Returns the model
     object or raises AuthenticationError / connection error.
     Much more lightweight than a full completion call and directly
     confirms both API key validity AND that the specific model is
     accessible under this key.
```

**Exception class renames (choose one approach consistently):**

```
OPTION A — Rename all exception classes to be model-agnostic:
  GeminiSchemaValidationError  → AISchemaValidationError
  GeminiTimeoutError           → AITimeoutError
  GeminiNonRetryableError      → AINonRetryableError
  GeminiRateLimitExhaustedError→ AIRateLimitExhaustedError

OPTION B — Rename to OpenAI-specific:
  GeminiSchemaValidationError  → OpenAISchemaValidationError
  ... etc.

OPTION C — Add model-agnostic aliases while keeping old names as
  deprecated aliases (zero import-site changes, safest for a branch):
  AISchemaValidationError = GeminiSchemaValidationError  (alias)

RECOMMENDED: Option A (model-agnostic names). The entire point of the
  client abstraction is that callers don't know which model they're
  calling. Exception names that reference a specific model break this
  abstraction at the type level. Option A renames the exceptions
  properly, and the minor import-site update (only models/exceptions.py
  and test files reference these names directly) is worth the cleaner
  architecture. All sites that import these exceptions are in the
  same service — the grep is small.
```

### 2.4 `src/models/common.py`

**What changes:**
- `ModelTier` enum values renamed: `FLASH_LITE → MINI`, `FLASH → FULL`, `EMBEDDING → EMBED` (per §2.2's decision). The underlying enum type and all methods are unchanged.
- `GeminiCallResult[T]` renamed to `AICallResult[T]` — same generic structure, same fields, just model-agnostic naming. All files that reference `GeminiCallResult` update to `AICallResult`; a search across the codebase confirms the scope is small (only `gemini_client.py` itself, `extractor.py`, and test fixtures).
- `CostRecord.estimated_cost_usd` docstring/description updated to note "estimated from pricing table; no longer a real billed figure from provider response" — accurate documentation of the regression from OpenRouter's real-cost field back to an estimate.

### 2.5 `src/api/deps.py`

**What changes:**
- The `get_gemini_client()` Depends provider is renamed to `get_ai_client()` (model-agnostic name, consistent with the abstraction philosophy). Returns an `OpenAIClient` instance (now constructed from `OpenAIClient(settings=get_settings())` instead of `GeminiClient(...)`).
- All route files that inject the client via `Depends(get_gemini_client)` update to `Depends(get_ai_client)` — affects `cleanup.py` and `extract.py` route files, no logic changes.

### 2.6 `src/api/main.py`

**What changes:**
- The `lifespan` startup block that instantiates and connectivity-checks the AI client updates to instantiate `OpenAIClient` and call its (updated) connectivity check.
- The import of `GeminiClient` → `OpenAIClient`.
- No structural changes to middleware registration, router registration, or shutdown logic.

### 2.7 `requirements.txt`

**What changes:**

```
REMOVE (if these were added for OpenRouter-specific reasons):
  Nothing needs removal if `openai` was already the SDK used for
  OpenRouter (since OpenRouter is OpenAI-compatible, the same
  `openai` package works for both). The SDK is unchanged.

ADD:
  Nothing — the `openai` package was already the dependency for
  the OpenRouter integration. Verify the installed version supports
  `client.beta.chat.completions.parse()` (available from openai-python
  >= 1.50.0 approximately — check exact version requirement at
  implementation time and pin accordingly).

VERIFY:
  `google-genai` — if this was added to requirements.txt as an
  alternative/fallback SDK or for count_tokens calls, REMOVE IT.
  Day 48's §0 resolved token counting via tiktoken locally —
  `google-genai` should not be in the dependency list if OpenRouter
  was the provider from Day 46 onward. Confirm and clean up.
```

### 2.8 `src/services/tokenization.py`

**What changes: SIGNIFICANT IMPROVEMENT, not a breaking change**

```
OLD STATE (accurate but slightly off):
  Used tiktoken with o200k_base or cl100k_base encoding as an
  APPROXIMATION for Gemini's tokenizer. A safety margin of 1.12
  was applied because the tokenizers are from different model families.

NEW STATE (accurate):
  GPT-4.1 Mini uses the same tiktoken encoding (o200k_base) as
  GPT-4o and the GPT-4.1 family. tiktoken IS the authoritative
  tokenizer for these models — it is OpenAI's own tokenizer library.
  This means token estimates are now EXACT (or as close to exact
  as tiktoken gets, which is effectively exact for the purposes
  of chunk-boundary decisions).

CHANGES:
  1. TOKEN_ESTIMATE_SAFETY_MARGIN:
     The 1.12 safety margin was there specifically to compensate
     for cross-tokenizer-family imprecision. With GPT-4.1 Mini,
     this margin can be REDUCED significantly:
       - A margin of 1.02–1.05 is appropriate (accounting only for
         special tokens, chat format overhead, and message-format
         tokens that tiktoken's raw text encoding doesn't count but
         the API does)
       - This means chunks can now use ~8-10% more of the available
         token budget than before, reducing the number of chunks
         needed for long meetings and correspondingly reducing cost
         and latency.
     Update TOKEN_ESTIMATE_SAFETY_MARGIN from 1.12 to 1.05 (or
     the verified correct value at implementation time).

  2. Encoding selection:
     Confirm the correct tiktoken encoding for GPT-4.1 Mini at
     implementation time. The GPT-4.1 family is expected to use
     o200k_base (same as GPT-4o). If tiktoken's `encoding_for_model()`
     function supports "gpt-4.1-mini" as a model name, use that
     instead of hardcoding the encoding name — it automatically
     tracks the correct encoding for the model even if OpenAI
     changes it in a future release.
     Change: from tiktoken.get_encoding("o200k_base") to
     tiktoken.encoding_for_model("gpt-4.1-mini") if supported,
     with a fallback to get_encoding("o200k_base") if the model
     name is not yet registered in tiktoken's known-models list
     (a pragmatic fallback for a newly-released model).
```

### 2.9 `src/config/extraction_config.py` and `src/config/cleanup_config.py`

**What changes:**

```
EXTRACTION_CHUNK_MAX_TOKENS:
  GPT-4.1 Mini's context window must be verified at implementation
  time against OpenAI's official documentation. The current published
  context window for GPT-4.1 Mini is 128K tokens. Setting
  EXTRACTION_CHUNK_MAX_TOKENS at a SAFE fraction of this — accounting
  for the system prompt + few-shot examples + user prompt metadata +
  expected output tokens — is important.

  Conservative recommendation:
    System prompt + examples: ~4,000 tokens
    Output (ExtractionResponse): ~1,500 tokens
    Safety buffer: ~2,000 tokens
    Available for transcript content: ~120,500 tokens → round to 90,000
    (keeping the existing 90,000 value is reasonable and safe,
    even if GPT-4.1 Mini could technically accept more — the limit
    on useful extraction quality at very long context lengths is
    a different concern from the technical limit)
  No change needed to this constant unless the new model's context
  window is smaller than expected.

GRAMMAR_BATCH_MAX_TOKENS in cleanup_config.py:
  This is for the transcript cleanup batch passed to the model.
  The same conservative-fraction logic applies. The existing 2,000
  token batch size is well within any GPT-4.1 Mini context limit —
  no change needed.

EXTRACTOR_CHUNK_CONCURRENCY:
  OpenAI's rate limits differ from OpenRouter/Google's. GPT-4.1 Mini
  tier limits (requests per minute, tokens per minute) depend on the
  API tier of the account. Verify the account's actual tier limits
  before finalizing this constant — if the tier is lower than assumed,
  reduce EXTRACTOR_CHUNK_CONCURRENCY to avoid hitting rate limits on
  multi-chunk extractions. If higher, it can be increased.
  This is the ONLY constant requiring rate-limit-based calibration
  against the new provider rather than pure context-window math.
```

---

## 3. Prompt Migration — Testing and Tuning Strategy

```
Prompts do not necessarily require rewriting. They may work as-is
with GPT-4.1 Mini, or they may require tuning. The migration plan
treats prompt quality as an empirical question, not an assumption.

STEP 1 — Run golden dataset tests UNCHANGED against GPT-4.1 Mini
  Before touching any prompt file, run all existing golden dataset
  fixtures through the migrated service as-is. Measure:
    - Precision and Recall on standup_01, sprint_review_01
    - Anti-pattern rejection on ambiguous_cases (must be ZERO commitments)
  Record results as "BASELINE (GPT-4.1 Mini, original Gemini prompts)."

STEP 2 — Accept, tune, or rewrite per section based on results
  The following sections of extraction_system.txt are the most likely
  to need tuning when changing model families:

  ANTI-PATTERNS SECTION (highest risk):
    Different models have different tendencies toward false positives.
    GPT-4.1 Mini may be MORE literal (better at rejecting "we should"
    cases) or LESS literal than Gemini Flash-Lite. Measure first;
    if anti-pattern rejection rate drops below 100%, add more explicit
    REJECT instructions (not just examples) to this section.

  CONFIDENCE RUBRIC (medium risk):
    GPT-4.1 Mini's self-reported confidence calibration may differ
    from Gemini's. If a significant fraction of manually-reviewed
    commitments receive confidence scores inconsistent with their
    apparent certainty level, the rubric's anchor examples may need
    adjustment to recalibrate the model to the band boundaries.

  OUTPUT CONTRACT (low risk):
    With native OpenAI structured output (parse()), schema adherence
    is stronger — this section of the prompt becomes less critical
    as a reliability mechanism and more of a "belt and suspenders"
    instruction. It should be retained but can be simplified slightly
    if it was verbose to compensate for OpenRouter's weaker enforcement.

  ROLE AND SCOPE (low risk):
    GPT-4.1 Mini follows role instructions reliably. No change
    expected.

STEP 3 — Bump prompt_version tag on any modified prompt file
  Any prompt file that is edited as part of this migration must have
  its first-line version tag incremented (e.g. extraction-v1.0 →
  extraction-v1.1). This ensures ExtractionResultWithMeta.prompt_version
  in historical data accurately reflects which prompt version produced
  each extraction result — a critical audit trail property.

STEP 4 — Re-run golden dataset tests after tuning; must meet targets
  After any prompt tuning:
    - Anti-pattern rejection: 100% (zero tolerance, unchanged)
    - Precision: ≥ 91% (same as Gemini baseline)
    - Recall: ≥ 87% (same as Gemini baseline)
  If these cannot be reached with prompt tuning alone, escalate to
  using gpt-4.1 (full model, not mini) for extraction — this is the
  defined escalation path, not a failure of the migration plan.

CLEANUP PROMPT (cleanup_system.txt):
  Grammar normalization is a well-understood task that GPT-4.1 Mini
  handles reliably. The existing prompt structure (HARD CONSTRAINTS,
  WHAT TO DO, OUTPUT CONTRACT, WORKED EXAMPLES) should transfer cleanly.
  Run the Day 47 integration tests (raw messy transcript → cleaned output)
  against the migrated service. If the guardrail (length-ratio check)
  trips more or less frequently than with Gemini, the threshold may need
  calibration — but the guardrail logic itself does not change.
```

---

## 4. Test Suite Updates Required

```
UNIT TESTS (mocked client — fast, no live calls):
  These tests mock at the AIClient boundary. The mock itself needs
  updating to return openai SDK response shapes instead of Gemini/
  OpenRouter response shapes:
    - response.usage.prompt_tokens (same field name — no change needed)
    - response.usage.completion_tokens (same field name — no change needed)
    - The absence of response.usage.cost (OpenRouter-specific) must be
      reflected in mocks — mocked responses should NOT include this field
    - The parse() response shape (from client.beta.chat.completions.parse())
      differs from create() — if the mock was built against create()'s
      response, update it to match parse()'s response structure

  test_gemini_client.py → renamed test_openai_client.py:
    - All references to GeminiClient → OpenAIClient
    - Exception type names updated (if Option A rename is chosen)
    - Cost calculation test updated: the test now verifies the ESTIMATED
      cost from the pricing table, not the "real" cost from a provider
      response field
    - The parse() vs create() call path tested explicitly

  test_settings.py:
    - Remove Gemini-specific variable tests
    - Add OpenAI-specific variable tests
    - Test that OPENAI_API_KEY as SecretStr never appears in repr()

  All other unit tests (test_extractor.py, test_commitment_parser.py,
  etc.) — NO CHANGES NEEDED (they mock at the client boundary, which
  has the same interface from their perspective).

INTEGRATION TESTS (live calls):
  All existing integration test fixtures and expected outputs are REUSED —
  no changes to the fixture files. The tests themselves run against the
  new model. Results may differ slightly (model-to-model variance) but
  should be within acceptable bounds.

  New integration test to add:
    test_openai_client.py (live call, not mocked):
    [ ] client.beta.chat.completions.parse() returns a correctly
        typed Pydantic instance (not a raw JSON string requiring
        manual parsing — verify native parse path works)
    [ ] /ready endpoint successfully calls openai.models.retrieve()
        and returns 200 with a valid API key
    [ ] /ready returns 503 with an intentionally invalid API key
```

---

## 5. Migration Execution Order (Day of Migration)

```
The migration should be executed in this exact order to minimize
the window during which the service is in an inconsistent state:

HOUR 1:
  1. Create feature branch: migration/gpt-4.1-mini
  2. Update requirements.txt (verify openai SDK version, remove
     google-genai if present)
  3. Update .env.example
  4. Update settings.py (add OPENAI_*, remove GEMINI_*)
  5. Update model_routing.py (new model strings, new pricing table,
     new ModelTier enum values)
  6. Update models/common.py (ModelTier enum rename, AICallResult rename)

HOUR 2:
  7. Rename + rewrite gemini_client.py → openai_client.py
     (this is the largest single file change)
  8. Update models/exceptions.py (rename exception classes, Option A)
  9. Update api/deps.py (rename provider function)
  10. Update api/main.py (instantiation update)

HOUR 3:
  11. Update tokenization.py (encoding_for_model, reduce safety margin)
  12. Update extraction_config.py (verify constants against GPT-4.1 Mini specs)
  13. Rename test_gemini_client.py → test_openai_client.py, update tests

HOUR 4 — VALIDATION GATE 1 (service must start cleanly):
  14. Service boots without errors (settings validation passes)
  15. /health → 200
  16. /ready → 200 (with valid OPENAI_API_KEY)
  17. All unit tests pass (with mocked client)
  If any of the above fail, STOP and diagnose before proceeding.

HOUR 5 — VALIDATION GATE 2 (prompt testing):
  18. Run golden dataset against the migrated service (UNCHANGED PROMPTS)
  19. Record baseline precision/recall metrics
  20. Run anti-pattern fixture — must produce zero commitments
  If anti-pattern fixture fails (any false positive): TUNE PROMPT NOW
  before proceeding.

HOUR 6 — PROMPT TUNING (if needed, else skip to Hour 7):
  21. Tune extraction_system.txt and/or commitment_examples.txt
  22. Bump prompt_version tag
  23. Re-run golden dataset tests until targets are met

HOUR 7 — VALIDATION GATE 3 (end-to-end):
  24. Full pipeline smoke test: raw messy transcript → /cleanup → /extract
  25. Manual review of extraction result for correctness
  26. Record first real cost-per-meeting measurement under GPT-4.1 Mini
  27. Integration tests for /cleanup and /extract pass

HOUR 8 — DOCUMENTATION AND MERGE:
  28. Update CHANGELOG.md with migration entry
  29. Update any comments in code that reference "Gemini" or "OpenRouter"
  30. PR review (all the above must pass in CI)
  31. Merge to main after approval
```

---

## 6. Rollback Plan

```
IF THE MIGRATION FAILS AT ANY VALIDATION GATE AND CANNOT BE QUICKLY
RESOLVED:

The feature branch is the rollback mechanism — the main branch retains
the Gemini/OpenRouter configuration until the migration branch passes
all validation gates and is merged. This is why the migration is done
in a branch, not directly on main.

If the migration has already been merged and a production issue is
discovered after deployment:
  - Revert the merge commit (Git revert creates a new commit
    that undoes the changes — clean, auditable, immediate)
  - Re-deploy the reverted main branch
  - The OpenRouter Gemini integration resumes working (OPENROUTER_API_KEY
    and GEMINI_* env vars must still be present in the deployment
    environment during the rollback window — do NOT remove old
    environment variables from the deployment platform until the
    migration is confirmed stable for 48+ hours in production)

ENVIRONMENT VARIABLE STRATEGY DURING TRANSITION:
  For the first 48 hours after migration go-live:
  - Keep both OPENAI_API_KEY (new) AND OPENROUTER_API_KEY + GEMINI_* (old)
    in the deployment environment — the service only reads the OpenAI
    vars now, but the Gemini/OpenRouter vars are there as a fast rollback
    enabler without a new deployment
  - After 48 hours of stable production operation, remove the old vars
```

---

## 7. What the Node.js Side Does NOT Need to Change

```
The Node.js API (the caller of POST /extract) requires ZERO changes
as a result of this migration. This is the validation of Day 50's
integration contract design:

  - POST /extract request body shape: UNCHANGED
  - POST /extract response body shape: UNCHANGED
  - HTTP status codes (200/206/422/401): UNCHANGED
  - Authentication mechanism: UNCHANGED
  - The Node.js extract.worker.ts calls the same URL, sends the same
    payload, parses the same response shape

The ONLY observational differences the Node.js side will notice:
  - ExtractionResultWithMeta.extraction_model will change from
    "google/gemini-2.5-flash-lite" to "gpt-4.1-mini"
  - ExtractionResultWithMeta.total_cost.estimated_cost_usd will
    change (higher, due to pricing difference — see §2.2)
  - Processing latency may change (GPT-4.1 Mini's speed vs.
    Gemini Flash-Lite's speed via OpenRouter — measure in testing)

Both of these are informational fields that the Node.js side logs
and stores but does not branch on — they will not cause any
Node.js-side failures.
```

---

## 8. Post-Migration Monitoring (First 72 Hours)

```
The following metrics must be actively monitored after go-live,
using Day 46's established structured logging infrastructure:

COST:
  - estimated_cost_usd per meeting (from ExtractionResultWithMeta
    in structured logs) — alert if significantly above the
    newly-established GPT-4.1 Mini cost baseline from testing
  - Watch for unexpected model routing (if full gpt-4.1 model is
    accidentally used for extraction tasks, cost will spike)

QUALITY (production proxy, no ground-truth available):
  - confidence_score distribution across extracted commitments —
    if the distribution shifts significantly (e.g. many more items
    at 0.3-0.4, suggesting the model is less certain), it may
    indicate prompt-tuning is needed for this specific meeting corpus
  - calibration_flag.is_suspicious rate in commitment_parser —
    if this rate spikes, the model's confidence calibration may have
    drifted from the prompt's rubric

RELIABILITY:
  - chunks_succeeded / chunks_total ratio across all meetings —
    any drop below 0.95 (meaning > 5% of chunks are failing)
    warrants immediate investigation; OpenAI rate limits or
    structured output failures are the likely causes
  - schema_validation_retry_rate (from GeminiClient/OpenAIClient
    Day 46 retry path) — GPT-4.1 Mini's native structured output
    should produce a LOWER retry rate than OpenRouter's pass-through;
    if it's higher, the response_format configuration has a bug

LATENCY:
  - processing_time_ms per meeting (from ExtractionResultWithMeta)
    compared to pre-migration baseline — GPT-4.1 Mini's response
    speed via OpenAI's native API should be faster than
    Gemini Flash-Lite via OpenRouter (one fewer network hop);
    if latency is unexpectedly higher, investigate connection
    pooling and timeout configuration
```

---

## 9. Summary: What This Migration Does and Does Not Change

```
CHANGES:
  ✓ AI provider: OpenRouter (Gemini) → OpenAI (GPT-4.1 Mini)
  ✓ SDK call: openai SDK at OpenRouter base_url → openai SDK at
      OpenAI base_url (same SDK, different base_url, different headers)
  ✓ Structured output: response_format json_schema (via OpenRouter
      pass-through) → client.beta.chat.completions.parse() (native OpenAI)
  ✓ Cost source: OpenRouter's real billed cost → estimated from pricing table
  ✓ Token counting: approximation (cross-family) → accurate (native tiktoken)
  ✓ Model names: google/gemini-2.5-flash-lite → gpt-4.1-mini
  ✓ Retry exception types: HTTP code-based → OpenAI SDK exception types
  ✓ Required HTTP headers: HTTP-Referer / X-Title dropped (OpenRouter-only)
  ✓ Settings env vars: GEMINI_* removed, OPENAI_* added
  ✓ Per-call cost is now higher (~2-3×) — acknowledged, not hidden

DOES NOT CHANGE:
  ✗ All Pydantic models (extraction, cleanup, chunk schemas)
  ✗ All business logic parsers (commitment, action item, decision, blocker)
  ✗ Chunking logic, chunking strategies, overlap behavior
  ✗ Speaker formatting, filler removal, confidence flagging
  ✗ FastAPI route handlers (cleanup, extract)
  ✗ Node.js integration contract (request/response shape)
  ✗ Database schemas (MongoDB, PostgreSQL — untouched by this service)
  ✗ The abstraction architecture itself (model_routing.py, client wrapper)
  ✗ Structured logging format and observability infrastructure
  ✗ The eval framework and golden dataset fixtures
```

---

*Document: AI-PIPELINE-MODEL-MIGRATION-001 | Vocaply | Version 1.0*
*Principal Backend Engineer + Principal AI/RAG Engineer Edition*
*Gemini 2.5 Flash/Flash-Lite (OpenRouter) → GPT-4.1 Mini (OpenAI Native)*
*Planning Document Only — No Implementation Code*
