# Vocaply — AI Pipeline: Day 53 Deep Build Plan
## Commitment Resolver — Cross-Meeting Matching Algorithm
> Principal Backend Engineer (25+ yrs) + Principal AI/RAG Engineer Edition
> Stack: Python 3.12 · Pydantic v2 · Pure Python Algorithm · Day 52 Similarity Engine
> Document: AI-PIPELINE-DAY53-DEEP | Version 1.0 | Planning Only — No Code

---

## 0. No OpenAI Calls Today — Second Consecutive Model-Free Day

Like Day 52, today is entirely model-free. This is stated explicitly because Day 54 (tomorrow) will use GPT-4.1 Mini for binary resolution detection, and the two days are often conceptually conflated:

```
DAY 53 (TODAY) — COMMITMENT RESOLVER:
  Question answered: "Is this new statement about the SAME THING as
  a prior commitment, or is it a brand-new commitment?"
  Method: Pure algorithm — owner-scoped grouping + similarity scoring
  (Day 52's engine) + threshold gate + conflict handling
  LLM calls: ZERO

DAY 54 (TOMORROW) — RESOLUTION DETECTOR:
  Question answered: "Does this statement mean the commitment was
  COMPLETED, or is it just a reference/status update?"
  Method: Two-stage — keyword gate first, GPT-4.1 Mini binary
  classification if gate passes
  LLM calls: GPT-4.1 Mini (only for matched pairs that pass Stage 1)

WHY THE RESOLVER NEEDS NO LLM:
  The resolver's question ("same thing or different thing?") is
  answerable from lexical similarity alone when operating on normalized
  5-token texts. "finish login feature" and "finish login feature by
  Thursday" share the same normalized form — they ARE the same thing.
  "fix payment bug" and "review API documentation" have near-zero token
  overlap — they ARE different things. This does not require reasoning,
  context understanding, or language model inference. It requires
  a deterministic, reproducible scoring function: exactly what Day 52
  built.

  An LLM-based resolver would add: cost ($0.01-0.04 per resolve call),
  latency (500ms+ per comparison pair), non-determinism (same inputs,
  different scores on different days), and explainability challenges
  ("the model matched these two because...?"). None of these are
  acceptable tradeoffs for a task that pure algorithm handles correctly.
```

---

## 1. Objective & Why It Matters (Expanded)

The commitment resolver is **the intelligence layer that gives Vocaply its memory**. Without it, every meeting produces isolated extractions — commitments float in disconnected pools per meeting, never linked to the ongoing accountability thread of a team member's open items. With it, the system can answer:

```
"Ahmed said he'd finish the login feature in last Monday's standup.
 In this Tuesday's standup, he said 'I'm still working on the login feature.'
 These are the SAME commitment. Don't create a new one. Update the existing
 one's 'last_referenced' timestamp. And check if Tuesday's statement
 constitutes a COMPLETION (that's Day 54's job)."
```

This is the core product value proposition of Vocaply's accountability engine. The resolver is the component that makes it real, and getting it wrong has product-level consequences:

```
IF THE RESOLVER CREATES A FALSE MATCH:
  Two different commitments (from the same owner) are merged as one.
  The accountability record shows one item when two exist. The
  second item never gets tracked, never generates reminders, never
  appears in the weekly digest. Silent data loss that passes all
  schema validation — the hardest class of production bug.

IF THE RESOLVER MISSES A REAL MATCH:
  The same commitment appears twice (or more) in the accountability
  database — once from Monday, once from Tuesday.
  Ahmed receives two reminder emails for the same item. His manager
  sees duplicated entries. His commitment score counts the same item
  twice. The UX degrades immediately and visibly.

IF THE RESOLVER ALLOWS CROSS-OWNER MATCHING:
  Ahmed's commitment is matched to Sara's similar commitment.
  One of them appears to have "referenced" or "resolved" something
  they never said. This is a data-integrity failure of the highest
  severity — it corrupts a person's professional accountability record
  based on another person's words. This scenario must be architecturally
  impossible, not just caught by a check.
```

---

## 2. Architectural Decisions Made Today (Full Rationale)

```
DECISION 1 — OWNER-SCOPING IS ARCHITECTURAL, NOT A FILTER

  The resolver NEVER builds a comparison matrix that crosses owner
  boundaries. It does not filter a full matrix after the fact. It
  PARTITIONS the problem by owner before any comparison is made.

  IMPLEMENTATION IMPLICATION:
    The algorithm groups new commitments by owner and historical
    commitments by owner as the FIRST step. All subsequent computation
    stays within owner groups. There is no point in the algorithm
    where a score is computed between Commitment_X (owner: Ahmed) and
    Commitment_Y (owner: Sara).

  WHY "FILTER AFTER" IS NOT GOOD ENOUGH:
    A post-fact filter means cross-owner similarity scores ARE computed
    (wasting time) and then discarded. More importantly, a filter is
    conditional code that can have bugs — it can be accidentally omitted
    in a refactor or edge case. Partitioning-before-comparison makes
    cross-owner matching structurally impossible: you can't filter a
    comparison that was never made.

  THE INPUT CONTRACT REINFORCES THIS:
    ResolutionInput contains historical_commitments pre-filtered by
    the Node.js side to include only OPEN commitments (not the current
    meeting's own commitments). But even if the Node.js side sends
    commitments from multiple owners (which it correctly does — it sends
    the team's open commitments, not just one person's), the resolver's
    internal owner-grouping ensures no cross-owner match is possible.

DECISION 2 — BEST MATCH MUST EXCEED THRESHOLD INDEPENDENTLY

  The resolver selects the highest-scoring historical commitment for
  each new commitment. But "highest" is a necessary condition, not a
  sufficient one. A score of 0.60 is the highest available score but
  still below 0.65 threshold → no match.

  WHY NOT "PICK BEST AVAILABLE IF SCORE > 0.50"?
    Because as the historical commitment pool grows (a team with 12
    months of meeting history has hundreds of historical commitments),
    the chance of finding a coincidental 0.50-0.60 score between an
    unrelated new commitment and some old historical one increases
    significantly. A fixed minimum bar (not a relative "best of what's
    available") prevents the false-match rate from growing with
    historical data volume. This is a scalability consideration, not
    just a correctness consideration.

DECISION 3 — CONFLICT RESOLUTION: TWO NEW COMMITMENTS MATCHING THE SAME
  HISTORICAL COMMITMENT ARE BOTH RETAINED

  In a single meeting, it is possible (though uncommon) for two
  different new commitment statements from the same owner to match
  the same historical open commitment. Example: Ahmed says both
  "I finished the login feature" AND "The login feature is done and
  deployed" in the same meeting. Both may match "finish login feature."

  POLICY: BOTH are retained in matched_commitments. Each is passed
  to Day 54's resolution detector independently. The detector may
  confirm both as completions (harmless — two confirming signals) or
  one as completion and one as non-completion (the higher-confidence
  one wins at the storage layer — Node.js's responsibility, not the
  resolver's).

  WHY NOT "FIRST MATCH WINS, DISCARD SECOND"?
    Because discarding a potential completion signal prematurely is
    worse than passing two signals to Day 54. The cost of Day 54
    processing one extra detection call is negligible; the cost of
    missing a completion signal is a commitment that should be FULFILLED
    remaining PENDING, generating false reminders.

DECISION 4 — THE RESOLVER OUTPUTS "MATCHED", NOT "RESOLVED"

  The resolver's output contains matched_commitments — pairs where a
  new statement appears to reference a historical commitment. It does
  NOT output "resolved" or "fulfilled" commitments. That determination
  requires language understanding of whether the new statement is a
  completion statement — Day 54's job.

  THE CLEAN HANDOFF:
    resolver output → matched_commitments → Day 54 detector input
    resolver output → new_commitments → direct DB insert (no Day 54 needed)
    resolver output → unchanged_commitments → Node.js leaves these as PENDING

DECISION 5 — PREFIX BOOST IS APPLIED BY THE RESOLVER, NOT SIMILARITY.PY

  Day 52 built has_prefix_match() as a helper that returns a
  PrefixMatchResult. Today's resolver calls it and applies the boost
  from similarity_config.SCORE_BOOST_FOR_PREFIX_MATCH (0.10).

  WHY HERE AND NOT IN similarity_score():
    The boost is a POLICY decision about what constitutes a strong
    match signal in the commitment domain. It is not a mathematical
    property of text similarity in general. The similarity engine is
    a general-purpose mathematical module; domain-specific scoring
    policies live in domain-specific code (the resolver).

DECISION 6 — NORMALIZED_TEXT IS USED FOR COMPARISON, RAW TEXT IS USED
  FOR LOGGING AND DISPLAY

  The resolver compares `ParsedCommitment.normalized_text` against
  `HistoricalCommitment.normalized_text` — the pre-computed, stored
  normalized forms. It does NOT call normalize_and_compare() because
  normalization was already done (Day 49 for new commitments, Day 49
  at the time the historical commitment was created).

  WHY PRE-NORMALIZED IS PREFERRED:
    Calling normalize_text() again on stored commitment text may produce
    a slightly different result if the normalization algorithm has been
    updated since the historical commitment was stored. Pre-normalized
    comparisons ensure consistency — the same normalization logic that
    produced the stored value is what's being compared.

  EXCEPTION: if normalized_text is somehow None or empty on either
  side (a data quality issue), the resolver falls back to calling
  normalize_and_compare() on the raw text fields. This fallback is
  logged as a data quality warning — it should never happen in
  steady-state but must not crash the pipeline.

DECISION 7 — ResolutionStats IS A FIRST-CLASS OUTPUT FIELD, NOT
  AN AFTERTHOUGHT LOG LINE

  The resolver returns processing statistics as part of its typed
  output (ResolutionStats embedded in ResolutionResult). WHY:
    a. The Node.js worker can log/store these stats per meeting —
       enabling cost/performance dashboards at the platform level
    b. The eval harness (Day 55/60) uses stats to verify the resolver
       exercised the right code paths (e.g. assert comparisons_made > 0
       for a meeting with historical commitments)
    c. Production monitoring can track "average comparisons per resolve
       call" as a leading indicator of historical-commitment-pool growth
```

---

## 3. Hour-by-Hour Execution Plan (8-Hour Day)

```
9:00 – 9:30    models/resolution_models.py — all new Pydantic types:
               HistoricalCommitment, ResolutionInput, MatchCandidate
               (internal), MatchedCommitment, ResolutionResult,
               ResolutionStats; validators, JSON schema compatibility
9:30 – 10:15   config/resolution_config.py — NEW file: MATCH_THRESHOLD,
               SCORE_BOOST_FOR_PREFIX_MATCH (imported from
               similarity_config.py to avoid duplication), and any
               resolver-specific constants
10:15 – 11:30  services/resolution/__init__.py (package creation)
               services/resolution/commitment_resolver.py —
               Step 1: owner grouping + owner matching logic
11:30 – 12:30  services/resolution/commitment_resolver.py —
               Step 2: pairwise scoring (calls Day 52's similarity engine);
               Step 3: best-match selection + threshold gate
12:30 – 1:15   Lunch
1:15 – 2:15    services/resolution/commitment_resolver.py —
               Step 4: prefix boost application;
               Step 5: conflict detection + both-retained policy;
               Step 6: unchanged commitment assembly
2:15 – 3:00    services/resolution/commitment_resolver.py —
               Step 7: ResolutionStats computation + ResolutionResult assembly;
               complete resolve() public function
3:00 – 3:45    tests/fixtures/golden_dataset — extend resolver_fixture_01.json
               (from Day 52), author resolver_fixture_02.json (multi-owner),
               resolver_fixture_03.json (conflict/edge cases)
3:45 – 5:15    tests/test_commitment_resolver.py — full test suite:
               unit tests, integration tests against all fixtures
5:15 – 5:45    Performance profiling: resolve() call time for various
               historical pool sizes (5, 25, 100 commitments); verify
               sub-second on realistic inputs
5:45 – 6:00    End-of-day checklist run-through (§8) + sign-off
```

---

## 4. Full File Structure (Day 53 Scope Only)

```
services/ai-pipeline/src/
│
├── services/resolution/
│   ├── __init__.py                    ← Package init; exports resolve() publicly
│   └── commitment_resolver.py         ← Core: full resolver algorithm
│
├── models/
│   └── resolution_models.py           ← All resolution-layer Pydantic types
│
└── config/
    └── resolution_config.py           ← NEW: resolver-specific constants

services/ai-pipeline/tests/
├── test_commitment_resolver.py        ← Comprehensive test suite
└── fixtures/
    └── golden_dataset/
        ├── resolver_fixture_01.json   ← (extended from Day 52)
        │                                  Single owner, clear matches + no-matches
        ├── resolver_fixture_02.json   ← Multi-owner scenario, 3 owners
        │                                  Mix of matched/new/unchanged per owner
        └── resolver_fixture_03.json   ← Edge/conflict cases:
                                            - Two new commitments matching same historical
                                            - Unresolvable owner (no participant map match)
                                            - All new (empty historical pool)
                                            - All unchanged (no new matches anything)
```

### Why `services/resolution/` is a **package** (directory with `__init__.py`), not a single file

Day 53 creates `commitment_resolver.py`. Day 54 creates `resolution_detector.py`. Day 55 creates `resolver_pipeline.py`. These three files form a cohesive `resolution` subdomain — they share types from `resolution_models.py`, they are always deployed together, and they form the complete resolution pipeline. A Python package (`services/resolution/`) communicates this grouping structurally, matches the existing `services/cleanup/` and `services/extraction/` package pattern, and avoids the alternative (three peer files under `services/` with no structural grouping that would look identical to the date parser or similarity engine in the project tree despite being a different category of component).

---

## 5. Detailed Implementation Logic — File by File

### 5.1 `config/resolution_config.py`

**Logic — what this file owns vs. what it imports:**

```
OWNS (resolver-specific policy values):
  MATCH_THRESHOLD: float = 0.65
    The minimum weighted similarity score for a new commitment to be
    considered a match against a historical one. This is the same
    value defined in Day 52's similarity_config.py. TO AVOID DUPLICATION:
    resolution_config.py IMPORTS MATCH_THRESHOLD from similarity_config
    and re-exports it as its own constant. WHY: the resolver is the
    policy owner of "what constitutes a match" — the threshold belongs
    in its domain config. similarity_config.py owns the mathematical
    parameters (weights, token minimums). The threshold straddles both.
    Resolution: defined ONCE in similarity_config.py (the more foundational
    module), re-exported from resolution_config.py with a clear comment
    explaining the import relationship. Callers in the resolver package
    import from resolution_config (closer to their domain) without
    needing to know the implementation detail of where it originates.

  SCORE_BOOST_FOR_PREFIX_MATCH: float = 0.10
    The score bonus applied when has_prefix_match() returns True.
    Imported from similarity_config.py, re-exported here for the
    same reason as MATCH_THRESHOLD.

  MAX_HISTORICAL_POOL_SIZE: int = 500
    A safety cap on the number of historical commitments the resolver
    will process per owner per call. At 500 commitments per owner,
    the pairwise comparison with 10 new commitments = 5,000 comparisons.
    At <1ms each, still < 5 seconds — acceptable. Beyond 500: log a
    structured warning (the historical pool is unusually large —
    possibly a sign that FULFILLED commitments are not being purged
    correctly from the pool the Node.js side sends) and truncate to
    the 500 most recent by created_at. This prevents a degenerate case
    from making the resolver call unboundedly slow.
    NOTE: A typical active team member has 5-30 open commitments
    at any given time. 500 is a generous safety margin, not an expected
    common case.

  OWNER_MATCH_NAME_MIN_CHARS: int = 3
    Minimum character length for an owner_name to be used in fuzzy
    name matching. Names shorter than this (single initials, "Al") are
    treated as ambiguous and fall back to user_id matching only.

  UNKNOWN_SPEAKER_MARKER: str = "unknown speaker"
    The exact normalized string used as owner_name for unresolved
    speakers (from Day 47's speaker_formatter.py fallback). Historical
    commitments from unknown speakers are NEVER matched against new
    commitments from unknown speakers — "Unknown Speaker" in meeting 1
    and "Unknown Speaker" in meeting 2 are likely different people.
    UNKNOWN_SPEAKER_MARKER is checked before owner matching and
    immediately categorized as "new commitment" when present.
```

### 5.2 `models/resolution_models.py`

**`HistoricalCommitment(BaseModel)` — what the Node.js side sends:**

- `id: str` — the PostgreSQL commitment UUID from the platform's commitments table. `min_length=1`. This is the foreign key the resolver uses to link a new statement back to the specific historical record that must be updated (marked REFERENCED, then potentially FULFILLED after Day 54).
- `owner_id: str` — the Vocaply `user_id` of the person who made this commitment. The PRIMARY owner-matching key. `min_length=1`.
- `owner_name: str` — the display name at the time this commitment was stored. Used as a SECONDARY matching key when a new commitment has no `owner_user_id` (unresolved speaker edge case from Day 47). `min_length=1`.
- `text: str` — the original extracted commitment text, verbatim. Used for logging and for the fallback normalization call (Decision 6's exception path).
- `normalized_text: str` — pre-computed by Day 49's `commitment_parser.normalize_text()` at extraction time. This is what the resolver compares against. `min_length=0` (can be empty string if the original text normalized to nothing — a degenerate but possible edge case). A `@field_validator` checks: if `normalized_text` is empty but `text` is non-empty, log a data quality warning (the resolver will use fallback normalization).
- `status: Literal["PENDING", "DEFERRED"]` — only open statuses are valid inputs to the resolver. FULFILLED, MISSED, CANCELLED commitments are NEVER included in the historical pool. A `@field_validator` enforces this at the schema level: receiving a FULFILLED historical commitment is a Node.js-side bug that should be caught immediately, not silently processed.
- `due_date_utc: datetime | None` — the resolved deadline from Day 51's date parser. Carried through to the resolver's output for context but NOT used in matching logic (a commitment about "login feature" matches regardless of what deadline was attached).
- `created_at: datetime` — when this commitment was first extracted. Used for: (a) ordering within the historical pool when `MAX_HISTORICAL_POOL_SIZE` truncation is needed (keep most recent), (b) display in the resolver's output for time-context logging.
- `meeting_id: str` — which meeting this commitment originally came from. Used to ensure the resolver never matches a new commitment from meeting M against a historical commitment also from meeting M (same-meeting dedup — a separate safeguard beyond what the Node.js side's pre-filtering should already guarantee).
- `source_meeting_date: datetime | None` — when the original meeting happened. For logging/diagnostics — "Ahmed has had this commitment open since 3 weeks ago."

**`ResolutionInput(BaseModel)` — the complete resolver input:**

- `meeting_id: str` — the CURRENT meeting being processed. Used to enforce the same-meeting exclusion safeguard.
- `team_id: str` — tenant scoping. Carried through to output for logging.
- `meeting_date: datetime` — when this meeting happened. Used in output metadata.
- `new_commitments: list[ParsedCommitment]` — from Day 50's extraction output (type reused, not duplicated). `min_length=0` (a meeting with no extracted commitments is valid input — the resolver returns empty new/matched lists).
- `historical_commitments: list[HistoricalCommitment]` — open commitments from all prior meetings. Pre-filtered by Node.js to exclude the current meeting's own commitments. The resolver's same-meeting safeguard is a second check, not the primary filter. `min_length=0` (a new team with no history is valid).
- A `@model_validator` on the full model: asserts that no `HistoricalCommitment.meeting_id` equals `self.meeting_id` (the same-meeting exclusion). If any historical commitment from the current meeting is found: these are removed from `historical_commitments` with a structured WARNING log (not a raised error — a Node.js bug should not crash the AI pipeline; it should be self-corrected defensively with visibility).

**`MatchCandidate(BaseModel)` — internal per-comparison record (NOT in public output):**

- `new_commitment_id: str` — the `ParsedCommitment.id` (or a generated ID if not set — dedup_key is the fallback identifier) of the new commitment in this candidate pair.
- `historical_commitment_id: str` — the `HistoricalCommitment.id`.
- `raw_similarity_score: float` — the score from `similarity_score()` before prefix boost.
- `prefix_match: PrefixMatchResult` — from Day 52's `has_prefix_match()`.
- `boosted_score: float` — the final score after applying prefix boost (`min(1.0, raw_similarity_score + SCORE_BOOST_FOR_PREFIX_MATCH)` if `prefix_match.matched` else `raw_similarity_score`).
- `above_threshold: bool` — `boosted_score >= MATCH_THRESHOLD`.

**`MatchedCommitment(BaseModel)` — a confirmed match in the resolver output:**

- `new_commitment: ParsedCommitment` — the new statement that references a historical commitment.
- `historical_commitment: HistoricalCommitment` — the specific historical commitment it matches against.
- `similarity_score: float` — the final boosted score.
- `similarity_breakdown: SimilarityBreakdown` — from Day 52's `SimilarityResult.breakdown`. Stored in the output so the Day 54 pipeline and the eval harness have full visibility into why two commitments were matched, without needing to re-run the similarity computation.
- `prefix_boost_applied: bool` — whether the 0.10 prefix boost changed the outcome (i.e., `raw_similarity_score < MATCH_THRESHOLD` but `boosted_score >= MATCH_THRESHOLD`). This specific flag is valuable for monitoring: if prefix_boost is frequently the deciding factor, the base threshold may be slightly too high, or the prefix boost may be too generous.

**`ResolutionStats(BaseModel)` — processing metadata in the output:**

- `new_commitments_count: int` — number of commitments classified as new (no historical match).
- `matched_commitments_count: int` — number of new statements matched to historical commitments.
- `unchanged_commitments_count: int` — number of historical commitments not referenced by any new statement.
- `total_owners_processed: int` — how many distinct owner groups were processed.
- `total_comparisons_made: int` — total number of similarity.score() calls made. Key performance/cost metric — reveals whether the resolver is doing O(N×M) comparisons as expected.
- `prefix_boosts_applied: int` — how many times the prefix boost changed or reinforced a match decision.
- `conflicts_detected: int` — how many historical commitments were matched by more than one new commitment (the both-retained conflict policy from Decision 3).
- `owner_fallback_count: int` — how many new commitments used name-based (not user_id-based) owner matching (the weaker fallback path).
- `pool_truncations: int` — how many owner pools were truncated at MAX_HISTORICAL_POOL_SIZE.
- `processing_time_ms: float` — wall-clock time for the complete resolve() call.
- `data_quality_warnings: list[str]` — structured warning strings (e.g. "historical commitment {id} has empty normalized_text — fallback normalization used").

**`ResolutionResult(BaseModel)` — the complete resolver output:**

- `meeting_id: str`
- `team_id: str`
- `new_commitments: list[ParsedCommitment]` — commitments with no match above threshold. These are to be inserted as new DB records by Node.js.
- `matched_commitments: list[MatchedCommitment]` — new statements that matched historical commitments. Each passes to Day 54's resolution detector.
- `unchanged_commitments: list[HistoricalCommitment]` — historical open commitments not referenced by any new statement. Node.js leaves these as PENDING.
- `stats: ResolutionStats`
- A `@model_validator` invariant: `len(new_commitments) + len(matched_commitments) == input_new_count` where `input_new_count` is NOT available at this model's validation time. Instead, this invariant is asserted inside the resolver function itself (before building the result) as a hard assertion that catches algorithm bugs: every new commitment must appear in EXACTLY one of the two output lists. An assertion failure here indicates a resolver logic bug, not a data issue.

### 5.3 `services/resolution/commitment_resolver.py` — The Full Algorithm

**Public function signature:**
`def resolve(input: ResolutionInput) -> ResolutionResult`

Synchronous (no I/O, no async). Fast enough at < 100ms for typical inputs to be called synchronously from the async route handler without blocking the event loop. The route handler itself is async; calling a sync function from async is fine for fast, CPU-bound operations.

**Algorithm in seven explicit, sequential steps:**

---

**(STEP 1) Pre-processing and defensive input cleanup:**

a. Start wall-clock timer for `processing_time_ms`.
b. Initialize `data_quality_warnings: list[str] = []`.
c. Apply same-meeting exclusion safeguard (from `ResolutionInput` model_validator — verified to have already run, but a defensive secondary check in the algorithm itself confirms no `historical_commitment.meeting_id == input.meeting_id` entries exist in the input at this point; if found, log and skip).
d. Filter `historical_commitments` to exclude any with `status` not in `{"PENDING", "DEFERRED"}` (the schema validator should have caught these, but defensive filter protects against direct function calls that bypass model validation in tests).
e. Initialize output accumulators: `result_new: list[ParsedCommitment] = []`, `result_matched: list[MatchedCommitment] = []`, `result_unchanged_ids: set[str] = set(hc.id for hc in input.historical_commitments)` (starts as the full historical set; matched items are removed from this set as they're identified).
f. Initialize counters: `total_comparisons = 0`, `prefix_boosts = 0`, `conflicts = 0`, `owner_fallbacks = 0`, `pool_truncations = 0`.

---

**(STEP 2) Owner-scoped partitioning — the architectural foundation:**

Build two lookup structures:

`historical_by_owner_id: dict[str, list[HistoricalCommitment]]`
- Key: `historical_commitment.owner_id` (the primary, authoritative identity key)
- Value: list of historical commitments for that owner
- Per owner, list is sorted by `created_at` descending (most recent first — if truncation is needed, oldest are dropped)
- Apply `MAX_HISTORICAL_POOL_SIZE` truncation per owner: if `len(commitments_for_owner) > MAX_HISTORICAL_POOL_SIZE`, keep the most recent 500, discard the rest, increment `pool_truncations`, add to `data_quality_warnings`

`historical_by_owner_name: dict[str, list[HistoricalCommitment]]`
- Key: `historical_commitment.owner_name.lower().strip()` (secondary lookup for owner_id fallback)
- Value: same list structure as above
- Built in parallel with the primary structure

`new_by_owner: dict[str, list[ParsedCommitment]]`
- Groups new commitments by owner. Key selection logic (the core of owner identity resolution):
  1. If `new_commitment.speaker_user_id` is not None and not empty: use `speaker_user_id` as the key → maps against `historical_by_owner_id`.
  2. Else if `new_commitment.speaker_name` is not empty, not `UNKNOWN_SPEAKER_MARKER`, and len ≥ `OWNER_MATCH_NAME_MIN_CHARS`: use `new_commitment.speaker_name.lower().strip()` → maps against `historical_by_owner_name`. Increment `owner_fallbacks`.
  3. Else: this new commitment cannot be owner-matched → classify immediately as `result_new.append(commitment)`, skip further processing. Log as a data quality warning.

---

**(STEP 3) Pairwise similarity scoring (within owner groups):**

For each `owner_key` in `new_by_owner`:
  - Resolve the owner's historical commitment list:
    - If used user_id as key: `hist_list = historical_by_owner_id.get(owner_key, [])`
    - If used name as key: `hist_list = historical_by_owner_name.get(owner_key, [])`
  - If `hist_list` is empty: ALL new commitments for this owner → `result_new`. No comparisons needed. Continue to next owner.
  - For each new commitment in `new_by_owner[owner_key]`:
    - Build `candidates: list[MatchCandidate] = []`
    - For each historical commitment in `hist_list`:
      - Resolve the normalized texts for comparison (Decision 6's logic):
        - `norm_new = new_commitment.normalized_text if new_commitment.normalized_text else normalize_text(new_commitment.text)`
        - `norm_hist = hist_commitment.normalized_text if hist_commitment.normalized_text else normalize_text(hist_commitment.text)`
        - If either fallback is used: add to `data_quality_warnings`
      - Call `similarity_result = similarity_score(norm_new, norm_hist)` (imported from Day 52's similarity engine)
      - Call `prefix_result = has_prefix_match(norm_new, norm_hist)` (imported from Day 52)
      - Compute `boosted_score = min(1.0, similarity_result.score + SCORE_BOOST_FOR_PREFIX_MATCH) if prefix_result.matched else similarity_result.score`
      - If `prefix_result.matched and boosted_score != similarity_result.score`: increment `prefix_boosts` (the boost changed the score — not just that prefix matched)
      - Append `MatchCandidate(new_commitment_id=..., historical_commitment_id=hist_commitment.id, raw_similarity_score=similarity_result.score, prefix_match=prefix_result, boosted_score=boosted_score, above_threshold=boosted_score >= MATCH_THRESHOLD)`
      - Increment `total_comparisons`

---

**(STEP 4) Best-match selection per new commitment:**

For each new commitment's `candidates` list (from Step 3):
  - Filter to `above_threshold_candidates = [c for c in candidates if c.above_threshold]`
  - If `above_threshold_candidates` is empty: new commitment → `result_new.append(new_commitment)`. No match. Continue.
  - If non-empty: sort by `boosted_score` descending. Take the first (highest-scoring) candidate as the best match.
  - Build a `MatchedCommitment` from the best candidate:
    - `new_commitment`: the current `ParsedCommitment`
    - `historical_commitment`: retrieved by `best_candidate.historical_commitment_id` from the `hist_list` (use a dict lookup: build `hist_by_id = {h.id: h for h in hist_list}` once per owner group in Step 3, not rebuilt per new commitment)
    - `similarity_score`: `best_candidate.boosted_score`
    - `similarity_breakdown`: `similarity_result.breakdown` (stored on the `MatchCandidate` — requires adding `similarity_breakdown: SimilarityBreakdown` to `MatchCandidate`'s fields, retaining the breakdown from the winning comparison)
    - `prefix_boost_applied`: `best_candidate.prefix_match.matched and best_candidate.raw_similarity_score < MATCH_THRESHOLD` (boost was the deciding factor) — OR simply `best_candidate.prefix_match.matched` (boost was applied, regardless of whether it changed the outcome)
  - `result_matched.append(matched_commitment)`
  - Remove `best_candidate.historical_commitment_id` from `result_unchanged_ids` (this historical commitment HAS been referenced — it's no longer "unchanged")

---

**(STEP 5) Conflict detection and handling:**

After all new commitments for all owners have been processed:
  - Inspect `result_matched` for multiple entries referencing the same `historical_commitment.id`:
    - Build `historical_match_counts: dict[str, int]` — counts how many `MatchedCommitment` entries share the same `historical_commitment.id`
    - For any `historical_id` with count > 1: increment `conflicts` by 1 (one conflict = one historical commitment matched by multiple new statements, regardless of how many new statements matched it)
    - POLICY: ALL matching entries are retained (Decision 3). No removals.
    - Log each conflict at INFO level: `{"event": "commitment_resolution_conflict", "historical_id": ..., "matched_by_count": N, "meeting_id": ..., "team_id": ...}` — this is an observable, queryable event in production logs, not just a silent counter increment.

---

**(STEP 6) Unchanged commitments assembly:**

- `unchanged_list: list[HistoricalCommitment] = [hc for hc in input.historical_commitments if hc.id in result_unchanged_ids]`
- This is the complete set of historical open commitments that were neither matched by a new commitment (above threshold) nor explicitly part of the current meeting. They remain PENDING; the Node.js side makes no changes to them.

---

**(STEP 7) Invariant assertion + result assembly:**

a. **Hard invariant assertion** (catches bugs in the algorithm above):
   ```
   assert len(result_new) + len(result_matched) == len(input_new_commitments_that_were_processed)
   ```
   Where `input_new_commitments_that_were_processed` = all new commitments that reached the owner-matching step (excluding any immediately classified in Step 2's "cannot owner-match" case, which were added directly to `result_new` — these ARE counted). If this assertion fails: raise a typed `ResolverInvariantError` (a new subclass of `AIPipelineError` from Day 46). This is a code bug, not a data issue — it should never happen in production and would represent a logic error in the algorithm that needs immediate investigation.

b. Stop wall-clock timer. Compute `processing_time_ms`.

c. Build `ResolutionStats(new_commitments_count=len(result_new), matched_commitments_count=len(result_matched), unchanged_commitments_count=len(unchanged_list), total_owners_processed=len(new_by_owner), total_comparisons_made=total_comparisons, prefix_boosts_applied=prefix_boosts, conflicts_detected=conflicts, owner_fallback_count=owner_fallbacks, pool_truncations=pool_truncations, processing_time_ms=processing_time_ms, data_quality_warnings=data_quality_warnings)`.

d. Build and return `ResolutionResult(meeting_id=input.meeting_id, team_id=input.team_id, new_commitments=result_new, matched_commitments=result_matched, unchanged_commitments=unchanged_list, stats=stats)`.

---

### 5.4 `services/resolution/__init__.py`

Exports the public API of the resolution package:
- `from services.resolution.commitment_resolver import resolve` — the only public function from today. Day 54 and Day 55 will add more exports.
- The `__init__.py` explicitly lists what is public (the `resolve` function) and what is internal (the `MatchCandidate` type — only used inside `commitment_resolver.py`'s algorithm, never returned to callers).

---

## 6. Golden Dataset Fixture Design (Days 52-53 Fixtures in Full)

### `resolver_fixture_01.json` — Single Owner, Clear Cases

```
SCENARIO: Ahmed Hassan's commitments — Monday standup context
  
5 HISTORICAL OPEN COMMITMENTS (from prior meetings):
  hist_01: "finish login feature" → normalized "finish login feature"
  hist_02: "fix payment bug" → normalized "fix payment bug"
  hist_03: "review API documentation" → normalized "review api document"
  hist_04: "deploy staging environment" → normalized "deploy stage environ"
  hist_05: "update design system tokens" → normalized "updat design system token"

3 NEW COMMITMENTS (from this meeting):
  new_01: "I'll finish the login feature today" → normalized "finish login feature"
  new_02: "I fixed the payment bug yesterday" → normalized "fix payment bug"
  new_03: "I'll review the test coverage" → normalized "review test coverag"

EXPECTED RESULTS:
  MATCHED:
    new_01 → hist_01 (similarity ≥ 0.85, identical normalized text)
    new_02 → hist_02 (similarity ≥ 0.85, identical normalized text)
  NEW (no match above threshold):
    new_03 (similarity against hist_03 ≥ 0.30 but "review api document" vs
    "review test coverag" — "review" shared but rest different → score < 0.65)
  UNCHANGED:
    hist_03, hist_04, hist_05 (not referenced by any new commitment)
```

### `resolver_fixture_02.json` — Multi-Owner Scenario

```
SCENARIO: 3 owners (Ahmed, Sara, Ali) — Sprint review context

AHMED (4 historical, 2 new):
  hist_01: "finish login feature" — MATCHED by new_01 ("login feature complete")
  hist_02: "write unit tests" — NOT matched by any new
  new_01: "login feature is complete" → matches hist_01
  new_02: "I'll write the deploy script" → NO match (new commitment)
  Result: 1 matched, 1 new, hist_02 unchanged

SARA (3 historical, 2 new):
  hist_03: "send design files to engineering" — MATCHED by new_03
  hist_04: "update component library" — NOT matched
  new_03: "I sent the design files over" → matches hist_03
  new_04: "I'll update the Figma components" → weak match on hist_04?
    "updat figma compon" vs "updat component librari" — "updat" + "compon"
    shared → Jaccard = 2/6 = 0.33, cosine may boost slightly → BELOW 0.65
    → new commitment (not matched)
  Result: 1 matched, 1 new, hist_04 unchanged

ALI (2 historical, 1 new):
  hist_05: "review backend performance" — NOT matched
  hist_06: "set up Redis caching" — NOT matched
  new_05: "I'll configure the database migrations" → NO match
  Result: 0 matched, 1 new, hist_05+hist_06 unchanged

CROSS-OWNER VERIFICATION:
  new_01 (Ahmed, "login feature") vs hist_03 (Sara, "send design files"):
    → NEVER compared (different owner groups)
  This is verified via total_comparisons_made == expected_comparisons
  (Ahmed: 2×4=8, Sara: 2×3=6, Ali: 1×2=2 → total expected = 16)
```

### `resolver_fixture_03.json` — Edge and Conflict Cases

```
SCENARIO: Edge cases — deliberately designed to stress-test the algorithm

CASE 1: Both-retained conflict
  hist_01: "finish the login feature"
  new_01: "I finished the login feature" → matches hist_01 (score ≥ 0.85)
  new_02: "The login feature is complete" → ALSO matches hist_01 (score ≥ 0.70)
  Expected: BOTH new_01 and new_02 in matched_commitments against hist_01
  stats.conflicts_detected == 1

CASE 2: All new (empty historical pool)
  input.historical_commitments = []
  3 new commitments
  Expected: all 3 in result_new, 0 matched, 0 unchanged
  stats.total_comparisons_made == 0

CASE 3: All unchanged (no new matches anything)
  3 historical commitments about domain-specific topics
  2 new commitments about completely different topics
  Expected: both new in result_new, 0 matched, all 3 unchanged

CASE 4: Unknown speaker commitment
  new commitment with speaker_user_id=None AND
  owner_name="Unknown Speaker" (UNKNOWN_SPEAKER_MARKER)
  Expected: immediately classified as new_commitment,
  zero comparisons made for this commitment

CASE 5: prefix boost as deciding factor
  hist_01 normalized text: "finish login feature api"
  new_01 normalized text: "finish login feature module"
  raw_similarity: 0.62 (below threshold — "finish login feature" shared,
    "api" vs "module" differ; 3/5 tokens shared: Jaccard = 3/(3+2) = 0.6,
    cosine ≈ 0.75 on shared/total → weighted ≈ 0.625... let's say 0.62)
  prefix match: first 3 tokens ["finish","login","feature"] match → boost +0.10
  boosted_score: 0.72 (above threshold)
  Expected: matched, prefix_boost_applied=True
  stats.prefix_boosts_applied == 1
```

---

## 7. Performance Considerations

```
COMPLEXITY ANALYSIS:
  Let N = new commitments for a single owner,
  M = historical commitments for that owner.
  Per-owner comparisons: N × M (within-owner pairwise)
  Total comparisons: sum over all owners of (N_i × M_i)

TYPICAL SCALE (5-person standup team):
  Each owner: ~2-3 new commitments, ~8-15 historical open commitments
  Per owner: 2 × 10 = 20 comparisons (average)
  For 5 owners: ~100 total comparisons
  At < 1ms per comparison: < 100ms total
  Plus Python overhead (dict construction, list operations): < 150ms total
  Target: < 200ms for the typical case

SCALING CONSIDERATIONS:
  A team of 50 people: 50 × 20 = 1,000 comparisons → still < 1 second
  A meeting with 100 commitments from one owner (unusual): 100 × 15 = 1,500 → ~1.5 seconds
  MAX_HISTORICAL_POOL_SIZE cap (500) ensures: max comparisons per owner ≤ N × 500
  With N ≤ 20 (extreme meeting): 20 × 500 = 10,000 comparisons → ~10 seconds max, pathological

PROFILING TARGETS (Day 53 session):
  [ ] resolve() with resolver_fixture_01 (3×5=15 comparisons): < 20ms
  [ ] resolve() with resolver_fixture_02 (16 comparisons): < 25ms
  [ ] Stress test: 50 new commitments × 100 historical per owner:
      5,000 comparisons → target < 5 seconds (edge case, not P99)

OPTIMIZATION IF NEEDED (not today — measured before optimized):
  Pre-normalize all historical normalized_texts into a list for
  vectorized Jaccard computation (numpy set operations across all
  historical texts simultaneously). This reduces constant factor
  overhead without changing the O(N×M) complexity.
  Decision: trigger this only if profiling shows > 200ms on typical inputs.
```

---

## 8. Security Considerations

```
INPUT VALIDATION AS THE SECURITY LAYER:
  ResolutionInput's Pydantic model validates all inputs at construction time.
  By the time resolve() runs, the input has already been verified:
    - All owner_ids are non-empty strings
    - All normalized_texts are strings (though may be empty — handled)
    - Status values are in {"PENDING", "DEFERRED"} only
    - Same-meeting commitments have been defensively filtered

CROSS-TENANT ISOLATION:
  The resolver operates on data pre-scoped by the Node.js side to a
  single team (team_id). But the resolver itself adds team_id to its
  output (ResolutionResult.team_id) and logs it on every structured
  event. The AI pipeline service is stateless — it does not look up
  data from any database; it only processes what it is sent. Cross-tenant
  contamination would require the Node.js side to send cross-team data,
  which is guarded by Day 50's Node.js integration contract and
  the database's RLS policies. The resolver trusts its input is
  correctly scoped (defense-in-depth from upstream) rather than
  implementing its own DB queries.

TIMING ATTACKS ON OWNER MATCHING:
  The resolver's owner-matching logic runs in time proportional to
  historical pool size, not to the comparison outcome. There is no
  "early exit on match" that would make matched lookups faster than
  non-matched lookups — all candidates in an owner's pool are scored,
  then the best is selected. This means the resolver's execution time
  does not leak information about whether a match was found via timing
  side channels. (This concern is academic at the service level but is
  the correct posture for a component that processes name and commitment data.)

INVARIANT ASSERTION AS CORRECTNESS GUARANTEE:
  The ResolverInvariantError raised if the algorithm produces an
  inconsistent result count (Step 7) is itself a security property:
  it prevents silent data corruption (a new commitment being neither
  in new_commitments nor in matched_commitments — effectively lost)
  from propagating to the database. The error causes the Node.js job
  to fail cleanly (and retry per existing job retry logic) rather than
  silently processing a partial result that would leave a commitment untracked.
```

---

## 9. End-of-Day Testing & Definition of Done

```
UNIT TESTS — models/resolution_models.py:
  [ ] HistoricalCommitment with status="FULFILLED" → ValidationError
      (the schema rejects non-PENDING/DEFERRED statuses)
  [ ] HistoricalCommitment with empty normalized_text → valid (but triggers
      data quality warning in the resolver)
  [ ] ResolutionInput with a historical_commitment whose meeting_id matches
      the input meeting_id → historical commitment removed, warning logged
  [ ] ParsedCommitment with speaker_user_id=None and owner_name matching
      UNKNOWN_SPEAKER_MARKER → immediately → new_commitment (zero comparisons)
  [ ] MatchedCommitment.prefix_boost_applied is correctly True/False based
      on whether raw_score < threshold and boosted_score >= threshold

UNIT TESTS — commitment_resolver.py (core algorithm):

  STEP 2 — Owner partitioning:
  [ ] Three owners → three separate comparison groups → zero cross-group
      comparisons (verified via total_comparisons_made == sum of per-group
      expected comparisons from fixture)
  [ ] New commitment with user_id → matched to historical by user_id
  [ ] New commitment without user_id but with resolvable name → matched
      to historical by name (owner_fallback_count incremented)
  [ ] New commitment with UNKNOWN_SPEAKER_MARKER → immediately new_commitment,
      no comparisons made for this commitment

  STEP 3 — Pairwise scoring:
  [ ] total_comparisons_made equals N×M for each owner group exactly
  [ ] similarity_score() called with normalized texts (not raw texts)
      when normalized_text is available (verify via mock that normalize_text
      is NOT called when normalized_text is pre-populated)
  [ ] similarity_score() fallback to normalize_and_compare() when
      normalized_text is empty (verify via mock that it IS called)

  STEP 4 — Best-match selection:
  [ ] Highest-scoring above-threshold candidate is selected (not just
      first-above-threshold or last-above-threshold)
  [ ] Two candidates above threshold → highest boosted_score wins
  [ ] All candidates below threshold → commitment → result_new

  STEP 5 — Conflict handling:
  [ ] Two new commitments matching same historical → BOTH in result_matched
      (not just one); stats.conflicts_detected == 1
  [ ] No duplicates in result_matched due to conflict (the same new commitment
      cannot match two different historical commitments — only one best match
      per new commitment; verify result_matched has no duplicate new_commitment ids)

  STEP 6 — Unchanged:
  [ ] A matched historical commitment is NOT in unchanged_commitments
      (removal from result_unchanged_ids verified)
  [ ] An unmatched historical commitment IS in unchanged_commitments
  [ ] unchanged_commitments count == len(historical) - len(matched_historical_ids)

  STEP 7 — Invariant:
  [ ] Deliberate algorithm bug simulation: mock one new commitment to be
      dropped from both lists → ResolverInvariantError raised
  [ ] Normal cases: assertion passes silently (no error raised)

FIXTURE INTEGRATION TESTS:

  resolver_fixture_01 (single owner):
  [ ] result_matched has 2 entries (new_01→hist_01, new_02→hist_02)
  [ ] result_new has 1 entry (new_03)
  [ ] result_unchanged has 3 entries (hist_03, hist_04, hist_05)
  [ ] stats.total_comparisons_made == 9 (3 new × 3 hist = ... wait:
      new_03 has no user_id match to Ahmed's historical pool so it
      may create a new group, or if all 3 have same owner: 3×5=15)
      → depends on fixture design; assert the exact expected value
      documented in the fixture

  resolver_fixture_02 (multi-owner):
  [ ] Cross-owner isolation: total_comparisons_made == 16 (8+6+2)
      NOT 15 (as it would be if all compared against all)
  [ ] Ahmed: 1 matched, 1 new; Sara: 1 matched, 1 new; Ali: 0 matched, 1 new
  [ ] sara_new_04 ("update Figma components") is in result_new despite
      superficial similarity to hist_04 ("update component library") —
      this is the false-match stress test (must be BELOW threshold)

  resolver_fixture_03 (edge cases):
  [ ] Conflict: both new_01 AND new_02 in result_matched against hist_01
      conflicts_detected == 1
  [ ] Empty historical: all in result_new, total_comparisons_made == 0
  [ ] prefix_boost_applied=True for the designed prefix-boost case
  [ ] All unchanged: both new in result_new, all historical in unchanged

MATHEMATICAL CORRECTNESS TESTS:
  [ ] result_new count + result_matched count == total new commitments input
      (the invariant holds for all three fixtures)
  [ ] All similarity_scores in result_matched are >= MATCH_THRESHOLD
      (no below-threshold item was ever matched)
  [ ] No result_new item has ANY comparison above threshold against ANY
      historical commitment (by re-running similarity manually on the
      "incorrectly rejected" items and confirming all scores < threshold)

PERFORMANCE TESTS:
  [ ] resolve(resolver_fixture_01): < 20ms
  [ ] resolve(resolver_fixture_02): < 30ms
  [ ] resolve(stress_test fixture — 10 owners × 10 new × 20 hist):
      200 comparisons total → < 250ms

DEFINITION OF DONE:
  All three golden fixtures produce exactly expected results.
  Cross-owner isolation is proven mathematically via comparisons_made count.
  The invariant assertion is triggered and raises correctly on simulated bug.
  prefix_boost_applied correctly identifies cases where the boost was the
  deciding factor (score below threshold without boost, above with boost).
  Performance targets met (< 200ms for typical inputs).
  imports from services.resolution work cleanly from external test files
  (no circular imports introduced by the new package structure).
```

---

## 10. Explicit Risks & Open Decisions Carried Forward

```
RISK / DECISION                              RESOLUTION TODAY / DEFERRED TO
──────────────────────────────────────────────────────────────────────────
MATCH_THRESHOLD (0.65) calibration:          Day 60's eval will measure
The threshold may be too high (missed        precision/recall at the
matches) or too low (false matches) for      resolver level. If recall
the real meeting corpus.                     is low, lower threshold.
                                              If precision is low, raise
                                              it. Today's fixtures are
                                              designed around this value
                                              but real data may differ.

Owner name matching (fallback path)          Name-based matching is
reliability: two different people with       inherently weaker than
similar display names (e.g. "Ahmed" and      user_id matching. If the
"Ahmed Hassan") may cross-match in           platform's speaker resolution
the name-based fallback.                     (Day 47) reliably provides
                                              user_ids, the fallback rarely
                                              triggers. Monitor
                                              owner_fallback_count in
                                              production — if > 5% of
                                              matches use fallback,
                                              speaker resolution quality
                                              needs improvement at Day 47,
                                              not here.

resolver_fixture_02 Sara's new_04 case      If the actual similarity score
("update Figma components" vs "update       between these two normalized
component library") is close to 0.65:       texts is in [0.62, 0.68],
the test may be fragile (slight changes     the test is at risk of
to normalize_text() could flip the result)  becoming fragile. Monitor
                                              carefully. If within 0.05
                                              of the threshold, redesign
                                              the fixture to use a case
                                              with score < 0.50 (more
                                              robust boundary).

ResolverInvariantError: should this         Today: raises AIPipelineError
propagate to the route handler as a 500?    subclass → global error handler
                                             → 500. Correct behavior:
                                             it IS a service internal error.
                                             But the Node.js job-retry
                                             policy may retry forever on
                                             500s with algorithmic bugs.
                                             Tag this error with a
                                             "non_retryable: true" field
                                             in the ErrorEnvelope so the
                                             Node.js side can detect and
                                             alert rather than retry
                                             indefinitely. Implement this
                                             tagging when the error handler
                                             is extended (Day 55).
```

---

*Document: AI-PIPELINE-DAY53-DEEP | Vocaply | Version 1.0*
*Principal Backend Engineer + Principal AI/RAG Engineer Edition*
*Commitment Resolver — Cross-Meeting Owner-Scoped Matching Algorithm*
*Pure Python — Zero LLM Calls | Planning Document Only — No Implementation Code*
