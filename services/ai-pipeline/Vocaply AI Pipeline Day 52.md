# Vocaply — AI Pipeline: Day 52 Deep Build Plan
## Similarity Engine — TF-IDF Cosine + Keyword Overlap + Weighted Combination
> Principal Backend Engineer (25+ yrs) + Principal AI/RAG Engineer Edition
> Stack: Python 3.12 · scikit-learn · Pydantic v2 · No LLM calls today
> Document: AI-PIPELINE-DAY52-DEEP | Version 1.0 | Planning Only — No Code

---

## 0. No OpenAI Calls Today — A Deliberate, Documented Choice

Day 52 is entirely **model-free**. This is stated upfront because the prior days have all had some OpenAI interaction — skipping it today is a deliberate architectural choice worth explaining explicitly, not an oversight:

```
WHY THIS MODULE MAKES ZERO LLM CALLS:

1. THE TASK IS MATHEMATICALLY WELL-DEFINED
   "How similar are these two strings?" on normalized, stopword-removed,
   5-token-max texts is a classical information-retrieval problem with
   proven, reproducible, well-understood solutions. TF-IDF cosine and
   Jaccard similarity are not approximations to a hard problem — they
   are exact answers to the specific question being asked.

2. DETERMINISM IS NON-NEGOTIABLE HERE
   The commitment resolver (Day 53) will call the similarity engine
   potentially dozens of times per meeting. If score("finish login feature",
   "login feature finish") returns 0.87 today and 0.85 next week on the
   same inputs, two things break:
     a. The resolver makes different match/no-match decisions on identical
        data processed at different times (non-reproducible behavior)
     b. Debugging a wrong match decision becomes nearly impossible
        ("the score was 0.64 when we processed the meeting" vs "now it's
        0.66" with no explanation)
   LLMs are inherently non-deterministic at temperature > 0. Even at
   temperature = 0, OpenAI offers no guarantee of bit-identical outputs
   across model versions. Statistical/mathematical functions guarantee
   exact reproducibility given identical inputs.

3. LEXICAL SIMILARITY IS THE CORRECT TOOL FOR THIS SPECIFIC TASK
   "finish login feature" and "complete authentication module" have high
   SEMANTIC similarity (both describe implementing auth). An embedding-
   based approach would score them as highly similar — and wrongly match
   them as the same commitment, creating a data-quality bug that is hard
   to detect and erodes trust gradually.
   TF-IDF and Jaccard measure LEXICAL overlap: shared tokens. Two
   commitments with different tokens are different commitments, even if
   they're about related topics. This is the correct behavior for the
   accountability use case: different words = different thing = should
   not be matched.

4. COST AND LATENCY
   The resolver may call the similarity engine O(N × M) times where
   N = new commitments and M = historical commitments per owner.
   For a team with 25 members and 200 historical open commitments,
   a single /resolve call could trigger 40-100 similarity computations.
   Even cheap LLM calls would make this prohibitively expensive (40 ×
   $0.0001 = $0.004 per /resolve call, just for similarity) and
   prohibitively slow (40 × 500ms network round trips = 20 seconds
   minimum, unavoidable even with concurrency).
   TF-IDF + Jaccard on 5-token strings: microseconds. Total for 100
   comparisons: < 50ms.

GPT-4.1 MINI AND GPT-4.1 ROLES IN DAYS 51-55:
  Day 51: GPT-4.1 Mini (Layer 3 date resolution)
  Day 52: NONE (today)
  Day 53: NONE (resolver is pure Python + similarity engine)
  Day 54: GPT-4.1 Mini (resolution detection YES/NO binary)
  Day 55: GPT-4.1 Mini (via resolver pipeline for detection calls)
```

---

## 1. Objective & Why It Matters (Expanded)

The similarity engine is **the mathematical foundation of the entire cross-meeting accountability feature**. Without it, the resolver (Day 53) cannot distinguish "new commitment" from "same commitment mentioned again." The stakes:

```
SCENARIO: Ahmed has 8 open commitments from the past 3 weeks.
  In today's standup, he says 6 things that might be commitments.
  The resolver must evaluate: for each of the 6 new statements × 8
  historical commitments = 48 comparisons. For each of those 48 pairs,
  it needs a score between 0.0 and 1.0 answering "how similar are these?"

IF THE SIMILARITY ENGINE IS WRONG:
  → Score too high (false match): "I'll fix the payment bug" is matched
    to "I'll review the API documentation" because both contain "I'll"
    and a technical term. Ahmed appears to have completed his API review
    when he didn't. His score improves wrongly. His manager doesn't follow
    up on the actual API review commitment. The bug ships unchecked.

  → Score too low (missed match): "I'll finish the login feature" and
    "finish login feature by Thursday" score 0.40 instead of 0.87 because
    the normalization wasn't applied consistently. A new duplicate
    commitment is created. Ahmed now has two open "finish login feature"
    commitments, both tracked separately, both generating reminders.

  → Score not deterministic: the same pair scores 0.64 on Monday and
    0.66 on Wednesday. The 0.65 threshold means Monday's meeting doesn't
    match; Wednesday's does. Same meeting history, different match
    decisions. The product behaves inconsistently, and nobody can
    explain why.

WHY "GOOD ENOUGH" IS NOT ACCEPTABLE HERE:
  The platform's documented accuracy targets (Precision ≥ 91%, Recall ≥ 87%)
  are partially a function of the similarity engine's correctness. If the
  engine consistently scores related-but-different commitments above 0.65,
  the resolver's precision drops. If it scores genuinely-same commitments
  below 0.65, recall drops. The mathematical correctness of this module
  directly gates the system's overall accuracy claim.
```

---

## 2. Architectural Decisions Made Today (Full Rationale)

```
DECISION 1 — TF-IDF COSINE + JACCARD WEIGHTED HYBRID (not a single method)

  WHY NOT JUST COSINE ALONE:
  On very short texts (3-5 tokens after normalization), TF-IDF cosine
  has a known weakness: the IDF component assigns very high weight to
  tokens that appear in only one of the two documents (which is most
  tokens, in a two-document corpus). This means two texts with NO common
  tokens can occasionally score non-zero cosine similarity due to
  shared high-IDF rare tokens having outsized influence. Example:
    "fix deploy pipeline" vs "review pr changes"
    Both have unique tokens in this two-doc corpus → IDF weights are
    all equal → cosine computation becomes essentially random for
    zero-overlap texts. The expected 0.0 might actually be 0.02 or
    0.05 due to vectorizer internals.
  Jaccard set-intersection is immune to this: if the token sets have
  no intersection, Jaccard is exactly 0.0. Mixing it in (30% weight)
  anchors the combined score at 0.0 when token overlap is zero.

  WHY NOT JUST JACCARD ALONE:
  Jaccard does not account for partial matches within the token vocabulary.
  "finish login feature" vs "finish login page feature" — three shared
  tokens out of four unique tokens = Jaccard 0.75. But the texts are
  very similar (same verb, same project, one modifier different). TF-IDF
  cosine handles this better because it gives proportional weight to
  matched tokens rather than treating it as a pure set problem.

  THE 70/30 SPLIT:
  The specific 70% cosine / 30% Jaccard weighting is documented in the
  platform's HLD as the algorithm specification. Today's implementation
  must match this exactly. However: this weight is a CONFIG CONSTANT
  (COSINE_WEIGHT, JACCARD_WEIGHT in similarity_config.py), not a hardcoded
  literal. If Day 60's eval shows the split is suboptimal, adjusting it
  requires changing one config file, not re-engineering the algorithm.

DECISION 2 — FRESH VECTORIZER PER PAIR CALL (stateless, not corpus-aware)

  The core argument: scikit-learn's TfidfVectorizer must be FIT on a
  corpus before it can TRANSFORM documents. The IDF weight for each token
  is computed from the corpus frequency. With a two-document corpus (the
  two texts being compared), fitting is instantaneous and produces exactly
  the right IDF weights for a pairwise comparison.

  ALTERNATIVE REJECTED: pre-build a vectorizer fit on all historical
  commitments. Problems with this approach:
    a. STALENESS: new commitments added daily would gradually change
       IDF weights, meaning a comparison made today would produce a
       different score than the "same" comparison made yesterday.
       Non-determinism across time, not just calls.
    b. STATEFULNESS: the vectorizer becomes a stateful component that
       must be periodically re-fit and shared across requests. This
       breaks the service's stateless design.
    c. DISTORTION: rare tokens in the historical corpus get high IDF
       weights even in the pairwise comparison context. "photosynthesis"
       has IDF weight near 1.0 in a corpus of meeting commitments (rare
       word). If two commitments both happen to contain it, their cosine
       score is dominated by this one word even if the rest of the texts
       are completely different.
  Fresh vectorizer per call avoids all three problems. Cost: negligible
  for 5-token texts.

DECISION 3 — normalize_text() IMPORTED FROM commitment_parser.py,
  NOT DUPLICATED OR REIMPLEMENTED

  This is a hard single-source-of-truth rule. The normalization algorithm
  (stopword removal, suffix stemming, 5-token cap) is specified in the
  platform's LLD. It was implemented once, on Day 49, in commitment_parser.py.
  Every component that needs normalized text calls that function.

  THE RISK OF DUPLICATION:
  If similarity.py has its own normalize_text(), any bug fix or improvement
  in commitment_parser.py's version is NOT automatically applied to
  similarity.py's version. The two diverge. Commitments are stored with
  normalized_text generated by commitment_parser.py. The resolver then
  compares new text normalized by similarity.py's version. If they differ,
  exact-match dedup keys don't match, and even a word-for-word identical
  commitment from two consecutive meetings fails to be recognized as the
  same commitment.

  IMPORT DEPENDENCY RULE:
  services/similarity.py imports from services/extraction/commitment_parser.py.
  This is a cross-module import within the services/ package — acceptable
  because commitment_parser.py is a utility module, not a feature-level
  module with circular dependency risk. The import graph remains a DAG.

DECISION 4 — THRESHOLD LIVES IN THE RESOLVER, NOT THE SIMILARITY ENGINE

  The similarity engine returns a continuous score in [0.0, 1.0].
  Whether 0.64 is "a match" vs "not a match" is a business policy decision.
  The platform currently documents 0.65 as the threshold. But:
    - The threshold may be tuned based on Day 60's eval results
    - Different deployment environments (enterprise vs. SMB) might want
      different precision/recall trade-offs
    - Future versions might use confidence-banded matching (0.65-0.80 =
      soft match, >0.80 = hard match) with different handling per band

  All of these future possibilities require zero changes to similarity.py
  if the threshold gate lives in the resolver. If it were inside
  similarity.py, every threshold change would require touching the
  mathematical computation module, which is wrong.

DECISION 5 — PREFIX BOOST IS AN OPTIONAL ENHANCEMENT IN THE CONFIG,
  INVOCABLE BY THE RESOLVER, NOT BAKED INTO SIMILARITY_SCORE()

  The platform documents a "score boost for prefix match" (first 3 tokens
  of normalized_text_new match first 3 tokens of normalized_text_historical
  → boost score by 0.10, capped at 1.0). This boost is domain-knowledge-
  based (matching opening tokens in a 5-token commitment text is a very
  strong signal of same-commitment identity). However:
  - It is a POLICY decision (what constitutes a "strong match signal"), not
    a mathematical property of the comparison
  - The resolver is the right place to apply policy
  - similarity_score() returns the raw mathematical result; the caller
    (resolver) applies the boost if configured

  similarity.py EXPOSES a helper: has_prefix_match(norm_a, norm_b,
  n_tokens=3) -> bool — a pure function that tests whether the first
  n_tokens of both normalized texts are identical. The resolver calls
  this separately and applies its own boost logic. This keeps the
  mathematical module free of policy decisions while still providing
  the building block the resolver needs.

DECISION 6 — SCORE IS ALWAYS A FLOAT, NEVER AN ENUM OR CATEGORICAL

  Some similarity systems discretize scores into categories (LOW/MEDIUM/HIGH)
  at the computation layer. This destroys information. The resolver needs
  the raw float to:
    a. Apply the 0.65 threshold (a boundary effect: 0.649 vs 0.651 matters)
    b. Apply the prefix boost (0.64 + 0.10 = 0.74 — different outcome)
    c. Break ties (two historical commitments with scores 0.72 and 0.73
       against the same new commitment — the resolver keeps the 0.73 one)
  Discretizing at the similarity layer would lose all of this information.
```

---

## 3. Hour-by-Hour Execution Plan (8-Hour Day)

```
9:00 – 9:20    requirements.txt: confirm scikit-learn is added and pinned
               (e.g. scikit-learn>=1.4.0,<2.0.0); verify numpy is present
               as a transitive dependency (scikit-learn requires it)
9:20 – 9:50    config/similarity_config.py — all constants: weights,
               token thresholds, prefix-match length, score boost amount;
               module-load assertion (weights sum to 1.0)
9:50 – 10:30   models/similarity_models.py — SimilarityBreakdown,
               SimilarityResult, PrefixMatchResult; all Pydantic
               validators; JSON schema compatibility check
10:30 – 11:30  services/similarity.py — Layer 1 (private helpers):
               _compute_cosine_similarity(), _compute_jaccard(),
               _clip_score(), _validate_normalized_text()
11:30 – 12:15  services/similarity.py — Layer 2 (public API):
               similarity_score(), normalize_and_compare(),
               has_prefix_match(), compare_many()
12:15 – 1:00   Lunch
1:00 – 1:45    tests/fixtures/similarity_known_pairs.json — author
               30+ test pairs with hand-verified expected scores;
               include edge cases, boundary cases, adversarial cases
1:45 – 2:30    tests/fixtures/golden_dataset/resolver_fixture_01.json —
               first resolver golden fixture: new + historical commitments
               with expected match/no-match decisions
2:30 – 3:45    tests/test_similarity.py — full test suite: unit tests,
               mathematical invariants, edge case battery, performance
               timing assertions
3:45 – 4:30    Integration run: resolver_fixture_01 through similarity
               engine; verify all expected-match pairs score ≥ 0.65,
               all expected-no-match pairs score < 0.65
4:30 – 5:15    Performance profiling: time 100 normalize_and_compare()
               calls on realistic inputs; assert < 100ms total (< 1ms/call)
5:15 – 5:45    Verify import chain: similarity.py → commitment_parser.py
               normalize_text() — no circular imports, no re-implementation
               drift; run `python -c "from services.similarity import
               normalize_and_compare"` verifies cleanly
5:45 – 6:00    End-of-day checklist run-through (§8) + sign-off
```

---

## 4. Full File Structure (Day 52 Scope Only)

```
services/ai-pipeline/src/
│
├── services/
│   └── similarity.py                  ← Core: all similarity functions
│
├── models/
│   └── similarity_models.py           ← All Pydantic types for similarity results
│
└── config/
    └── similarity_config.py           ← All tunable constants

services/ai-pipeline/tests/
├── test_similarity.py                 ← Full unit + integration test suite
└── fixtures/
    ├── similarity_known_pairs.json    ← 30+ hand-verified input/score pairs
    └── golden_dataset/
        └── resolver_fixture_01.json   ← First resolver golden fixture
                                            (match/no-match ground truth)

requirements.txt                       ← scikit-learn added/confirmed (Day 52)
```

### Why `compare_many()` is added beyond the original brief

The original Day 52 brief specifies three public functions: `normalize_and_compare()`, `cosine_similarity()`, `keyword_overlap()`. A principal-level review adds `compare_many()` as a fourth, for a concrete reason:

Day 53's commitment resolver will call the similarity engine in a nested loop: for each new commitment, compare against all of the same owner's historical commitments. This is an N×M pairwise comparison. Calling `normalize_and_compare()` individually in a Python loop is correct but suboptimal: each call normalizes `text_a` independently even though it's the same `text_a` across all comparisons in the inner loop. `compare_many()` accepts a single query text and a list of candidate texts, normalizes the query once, then compares against all candidates — a simple but meaningful optimization that reduces redundant normalization work in the resolver's hot path.

---

## 5. Detailed Implementation Logic — File by File

### 5.1 `config/similarity_config.py`

**All constants, with rationale for each value:**

- `COSINE_WEIGHT: float = 0.70` — the TF-IDF cosine contribution. 70% is the platform-documented algorithm specification; implementation must match exactly. The constant name makes its purpose self-documenting in any code that reads it.
- `JACCARD_WEIGHT: float = 0.30` — the Jaccard keyword overlap contribution. `COSINE_WEIGHT + JACCARD_WEIGHT` is asserted to equal `1.0` at module load (not at each call — once at import, failing fast if the values were accidentally changed inconsistently). The assertion uses `abs((COSINE_WEIGHT + JACCARD_WEIGHT) - 1.0) < 1e-9` rather than strict equality, because floating-point `0.7 + 0.3` is not guaranteed to be exactly `1.0` in all Python implementations — `< 1e-9` is the correct floating-point equality check.
- `MIN_TOKENS_FOR_COSINE: int = 2` — minimum tokens for TF-IDF cosine to be meaningful. Below this: Jaccard-only fallback. The value 2 is chosen because a one-token normalized text ("deploy") makes TF-IDF's IDF calculation degenerate: the two-document corpus has exactly one unique token, giving it IDF weight 0 (log(1/1) = 0), resulting in a zero-vector that cosine cannot compare. Two tokens is the minimum for meaningful vectorization.
- `PREFIX_MATCH_LENGTH: int = 3` — number of leading tokens to compare in the prefix-match helper. 3 out of a 5-token max normalized text is "60% leading match" — a strong positional signal without being so long that minor word-order variation prevents valid matches.
- `SCORE_BOOST_FOR_PREFIX_MATCH: float = 0.10` — the boost amount applied by the RESOLVER (not the similarity engine) when `has_prefix_match()` returns True. Stored here as a config constant that the resolver imports, keeping the boost value centrally managed alongside other similarity tuning parameters.
- `SCORE_CLIP_MIN: float = 0.0` — lower bound for clipping raw scores. Floating-point arithmetic can produce slightly negative values (e.g. -1.3e-17); clipping prevents downstream validators from rejecting valid computations.
- `SCORE_CLIP_MAX: float = 1.0` — upper bound. Floating-point cosine can produce 1.0000000002 for identical texts; clipping prevents schema validation failures.
- `MATCH_THRESHOLD: float = 0.65` — the platform-documented threshold. Stored here in similarity_config.py (not in a separate resolver_config.py that doesn't exist yet) because it is a similarity-domain constant; the resolver imports and uses it rather than hardcoding it. This is Day 53's primary reference for the threshold — today establishes it as a named, documented constant.

### 5.2 `models/similarity_models.py`

**`SimilarityBreakdown(BaseModel)` — the detailed decomposition of a comparison:**

- `normalized_text_a: str` — the first text after `normalize_text()` was applied. Stored so the resolver (and the eval harness) can inspect exactly what text was compared, not just the raw input. A common source of confusion when debugging wrong scores is "was the normalization correct?" — this field answers that directly.
- `normalized_text_b: str` — the second normalized text.
- `cosine_score: float` — the raw TF-IDF cosine score before weighting. `Field(ge=0.0, le=1.0)`.
- `jaccard_score: float` — the raw Jaccard score before weighting. `Field(ge=0.0, le=1.0)`.
- `weighted_score: float` — the final weighted combination. `Field(ge=0.0, le=1.0)`. A Pydantic `@model_validator(mode='after')` asserts: `abs(weighted_score - (cosine_score * COSINE_WEIGHT + jaccard_score * JACCARD_WEIGHT)) < 1e-6`. This validator enforces the mathematical invariant at the data-model level — it is impossible to create a `SimilarityBreakdown` where `weighted_score` is inconsistent with its components. (Python floating-point can introduce tiny rounding errors; the 1e-6 tolerance accommodates these without permitting meaningful discrepancies.)
- `fallback_used: bool` — `True` when Jaccard-only scoring was used because one or both texts had fewer than `MIN_TOKENS_FOR_COSINE` tokens. When `True`, `cosine_score` is documented as `0.0` (not a real cosine score — it was never computed) and `weighted_score` equals `jaccard_score` (100% Jaccard weight). This distinction matters for debugging: a score of 0.0 with `fallback_used=False` means the texts genuinely have no overlap; a score of 0.0 with `fallback_used=True` means one text was too short to measure cosine (a different situation requiring different interpretation).
- `tokens_a: list[str]` — the token list from `normalized_text_a.split()`. Stored explicitly (not recomputed from the string) so the resolver's logging and the eval harness can display exactly what tokens were compared without re-splitting. Also used directly in `has_prefix_match()` computation.
- `tokens_b: list[str]` — same for text B.

**`SimilarityResult(BaseModel)` — the resolver's consumed type:**

- `score: float` — the final similarity score, identical to `breakdown.weighted_score`. Duplicated at the top level so the resolver can access `result.score` without navigating to `result.breakdown.weighted_score` — a convenience that keeps the resolver's code readable. `Field(ge=0.0, le=1.0)`. A `@model_validator` enforces consistency: `score == breakdown.weighted_score` (within 1e-9 tolerance).
- `breakdown: SimilarityBreakdown` — the full decomposition for logging/debugging.
- `is_above_threshold: bool` — pre-computed `score >= MATCH_THRESHOLD`. While Decision 4 says "the threshold lives in the resolver," this convenience field is provided specifically so callers can read a single boolean rather than importing and comparing against `MATCH_THRESHOLD` themselves. The resolver still owns the POLICY (whether to act on a match and how), but the threshold comparison itself is a mathematical operation that fits naturally in the similarity result. The field is also useful for the eval harness: `[r.is_above_threshold for r in results]` is cleaner than `[r.score >= 0.65 for r in results]`.

**`PrefixMatchResult(BaseModel)` — returned by `has_prefix_match()`:**

- `matched: bool` — did the first N tokens match?
- `prefix_length: int` — how many tokens were compared (the `n_tokens` parameter used).
- `prefix_a: list[str]` — the actual prefix tokens from text A.
- `prefix_b: list[str]` — the actual prefix tokens from text B.
- A lightweight typed result rather than a bare bool, so the resolver's logging includes what prefix was compared when it applies the boost — full observability into why a boost was applied to a specific pair.

### 5.3 `services/similarity.py` — Complete Logic

**Module-level initialization:**

- Imports: `TfidfVectorizer, cosine_similarity as sklearn_cosine` from `sklearn`; `normalize_text` from `services.extraction.commitment_parser`. The import of `normalize_text` from commitment_parser is tested explicitly (not just assumed to work) via `test_similarity.py`'s import test.
- Module-load assertion: `assert abs((COSINE_WEIGHT + JACCARD_WEIGHT) - 1.0) < 1e-9, "COSINE_WEIGHT + JACCARD_WEIGHT must equal 1.0"`. If this fails (config was accidentally modified), the module raises immediately on import — fail-fast, never discovered at runtime on the first similarity call.

**Private helper functions (not exposed in `__init__.py`):**

**(a) `_validate_and_tokenize(norm_text: str) -> list[str]`:**
- Strips the normalized text (just in case of whitespace edge cases — defensive, since normalize_text() should already handle this).
- Splits on whitespace → `list[str]`.
- Returns the token list. Empty string → `[]`.
- This helper centralizes the "normalized text → token list" conversion so it is done consistently everywhere it's needed in this module, never ad-hoc `text.split()` in-place.

**(b) `_compute_cosine_similarity(norm_a: str, norm_b: str) -> float`:**

- Takes already-normalized strings.
- Checks `len(_validate_and_tokenize(norm_a)) < MIN_TOKENS_FOR_COSINE or len(_validate_and_tokenize(norm_b)) < MIN_TOKENS_FOR_COSINE` → returns `0.0` if True (the Jaccard fallback path; the combiner handles the weight adjustment).
- Constructs `TfidfVectorizer()` with **explicit parameters**, not defaults:
  - `analyzer='word'` — tokenizes on whitespace-separated words (the inputs are already normalized — no need for n-gram analysis or character-level tokenization).
  - `lowercase=False` — the inputs are already lowercased by `normalize_text()`. Setting this to False avoids double-lowercasing (which is harmless but adds micro-overhead) and documents that the vectorizer trusts its input is already normalized.
  - `token_pattern=r'\S+'` — matches any non-whitespace sequence. The default `r"(?u)\b\w\w+\b"` requires 2+ character tokens, which would drop valid single-character tokens. The custom pattern accepts any whitespace-delimited token.
  - `use_idf=True, smooth_idf=True, sublinear_tf=False` — explicitly document the IDF computation choice. `smooth_idf=True` adds 1 to document frequencies and 1 to the number of documents, preventing division by zero for tokens that appear in all documents (both texts). `sublinear_tf=False` uses raw term frequency (not log-scaled), appropriate for very short texts where TF variation is minimal.
- Calls `vectorizer.fit_transform([norm_a, norm_b])` — fits the vectorizer on these two texts and transforms them into the TF-IDF matrix in one step.
- Wraps in `try/except ValueError`: scikit-learn raises `ValueError` if the vocabulary is empty after fitting (e.g. both texts, after the vectorizer's own internal processing, produce no valid tokens). Returns `0.0` on this exception — defensive, not silent (log a DEBUG event noting the empty-vocabulary case for observability).
- Computes `score = sklearn_cosine(matrix[0:1], matrix[1:2])[0][0]` — slice notation extracts the relevant rows as 2D arrays that `sklearn_cosine` requires; `[0][0]` extracts the scalar from the 1×1 result matrix.
- Returns `float(max(SCORE_CLIP_MIN, min(SCORE_CLIP_MAX, score)))` — clips to [0.0, 1.0].

**(c) `_compute_jaccard(norm_a: str, norm_b: str) -> float`:**

- `tokens_a = set(_validate_and_tokenize(norm_a))`
- `tokens_b = set(_validate_and_tokenize(norm_b))`
- If both empty: return `0.0`.
- `intersection_size = len(tokens_a & tokens_b)`
- `union_size = len(tokens_a | tokens_b)`
- If `union_size == 0`: return `0.0` (both empty sets — edge case handled explicitly, avoiding ZeroDivisionError).
- Returns `intersection_size / union_size` — already in [0.0, 1.0] by mathematical construction (Jaccard is always in this range). No clipping needed, but `float()` cast applied for type-safety.

**Public functions:**

**(a) `similarity_score(norm_a: str, norm_b: str) -> SimilarityResult`:**

This is the pure mathematical combiner. Both inputs must be ALREADY normalized (called from `normalize_and_compare()` after normalization). Takes normalized strings directly rather than raw text because:
- The resolver (Day 53) already has `normalized_text` on `HistoricalCommitment` objects — it should not have to pay the normalization cost again
- `normalize_and_compare()` pays that cost for callers who have raw text
- Accepting both normalized and raw inputs via the same function would add a `is_normalized: bool` parameter, which is a code smell

Logic:

1. `tokens_a = _validate_and_tokenize(norm_a)` / `tokens_b = _validate_and_tokenize(norm_b)`.
2. Determine if fallback is needed: `use_fallback = len(tokens_a) < MIN_TOKENS_FOR_COSINE or len(tokens_b) < MIN_TOKENS_FOR_COSINE`.
3. If fallback:
   - `cosine = 0.0`
   - `jaccard = _compute_jaccard(norm_a, norm_b)`
   - `weighted = jaccard` (100% Jaccard, 0% cosine — equivalent to JACCARD_WEIGHT=1.0, COSINE_WEIGHT=0.0)
4. Else:
   - `cosine = _compute_cosine_similarity(norm_a, norm_b)`
   - `jaccard = _compute_jaccard(norm_a, norm_b)`
   - `weighted = (cosine * COSINE_WEIGHT) + (jaccard * JACCARD_WEIGHT)`
   - Apply final clip: `weighted = max(SCORE_CLIP_MIN, min(SCORE_CLIP_MAX, weighted))`
5. Build `SimilarityBreakdown(normalized_text_a=norm_a, normalized_text_b=norm_b, cosine_score=cosine, jaccard_score=jaccard, weighted_score=weighted, fallback_used=use_fallback, tokens_a=tokens_a, tokens_b=tokens_b)`.
6. Return `SimilarityResult(score=weighted, breakdown=breakdown, is_above_threshold=weighted >= MATCH_THRESHOLD)`.

**(b) `normalize_and_compare(text_a: str, text_b: str) -> SimilarityResult`:**

The convenience function for callers who have RAW (not pre-normalized) text:
1. `norm_a = normalize_text(text_a)` — imported from commitment_parser.py
2. `norm_b = normalize_text(text_b)`
3. Returns `similarity_score(norm_a, norm_b)`

This is the function Day 53's resolver calls when comparing a NEW commitment (whose `normalized_text` may be populated from Day 49's parser but whose RAW text is what the resolver receives) against a historical commitment. The function is a thin wrapper — all mathematical logic lives in `similarity_score()`.

**(c) `has_prefix_match(norm_a: str, norm_b: str, n_tokens: int = PREFIX_MATCH_LENGTH) -> PrefixMatchResult`:**

- `tokens_a = _validate_and_tokenize(norm_a)[:n_tokens]`
- `tokens_b = _validate_and_tokenize(norm_b)[:n_tokens]`
- `matched = (len(tokens_a) >= n_tokens and len(tokens_b) >= n_tokens and tokens_a == tokens_b)` — requires BOTH texts to have at least `n_tokens` tokens AND those tokens to be identical. If either text has fewer than `n_tokens` tokens, `matched=False` (cannot claim a prefix match when the full prefix length isn't present in both).
- Returns `PrefixMatchResult(matched=matched, prefix_length=n_tokens, prefix_a=tokens_a, prefix_b=tokens_b)`.

**(d) `compare_many(query_text: str, candidates: list[str], pre_normalized: bool = False) -> list[SimilarityResult]`:**

Optimized batch comparison of one query against multiple candidates:
- If `pre_normalized=False`: normalize the query ONCE: `norm_query = normalize_text(query_text)`. Then `norm_candidates = [normalize_text(c) for c in candidates]`.
- If `pre_normalized=True`: treat inputs as already normalized (for callers like Day 53's resolver that have pre-normalized texts from `ParsedCommitment.normalized_text`).
- Iterates candidates: for each, calls `similarity_score(norm_query, norm_c)`.
- Returns results in the same order as `candidates` (positional mapping is the caller's responsibility — this function does not sort).
- Does NOT use vectorized batch computation across all candidates simultaneously (tempting for performance, but TF-IDF pairwise-fit-on-two-texts design means each pair must be fit independently — the batch optimization from `normalize_and_compare` is the only meaningful one: normalize query once).
- For the resolver's actual hot path (40-100 comparisons per job): 40 × < 1ms = < 40ms total, well within budget. If profiling shows this is a bottleneck in practice, consider numpy-based vectorized Jaccard computation as a targeted optimization later.

### 5.4 `fixtures/similarity_known_pairs.json` — Fixture Design

The fixture is a JSON array of test cases. Each case has this schema:

```json
{
  "id": "pair_001",
  "description": "same deliverable, different raw phrasing",
  "text_a": "I'll finish the login feature",
  "text_b": "finish the login feature by Thursday",
  "expected_score_min": 0.85,
  "expected_score_max": 1.0,
  "expected_above_threshold": true,
  "category": "same_commitment"
}
```

**Categories and what they prove:**

- `same_commitment` (8 pairs): same deliverable expressed differently → score ≥ 0.85, above threshold
- `different_commitment_same_owner` (8 pairs): different deliverables from same person → score ≤ 0.30, below threshold
- `similar_but_different` (6 pairs): superficially similar deliverables that are actually different → score in [0.30, 0.64], below threshold — the hardest cases for any similarity system
- `boundary_cases` (4 pairs): scores near the 0.65 threshold, where the expected outcome (above/below) is documented but the exact score range is wide (0.60-0.70) — testing the algorithm's behavior near the decision boundary
- `edge_cases` (8 pairs): empty strings, single tokens, identical texts (expected: 1.0), completely disjoint texts (expected: 0.0), single-word overlap, all-stopwords (normalization leaves empty strings after stopword removal), repeated words in same text

### 5.5 `fixtures/golden_dataset/resolver_fixture_01.json` — First Resolver Golden Dataset

This fixture is for Day 53's resolver, authored today because the similarity engine must be validated against the actual matching decisions the resolver needs to make. The fixture structure:

```json
{
  "fixture_id": "resolver_01",
  "description": "Ahmed Hassan - 5 open commitments, 3 new statements",
  "team_id": "team_clx02xyz",
  "meeting_id": "mtg_current",
  "new_commitments": [
    {
      "id": "new_01",
      "text": "I'll finish the login feature",
      "normalized_text": "finish login feature",
      "owner_name": "ahmed hassan",
      "owner_user_id": "usr_ahmed"
    }
  ],
  "historical_commitments": [
    {
      "id": "hist_01",
      "text": "I'll finish the login feature by Thursday",
      "normalized_text": "finish login feature",
      "owner_name": "ahmed hassan",
      "owner_id": "usr_ahmed",
      "status": "PENDING"
    }
  ],
  "expected_matches": [
    {
      "new_id": "new_01",
      "historical_id": "hist_01",
      "expected_similarity_min": 0.85,
      "should_match": true
    }
  ],
  "expected_no_matches": [
    {
      "new_id": "new_02",
      "historical_id": "hist_03",
      "expected_similarity_max": 0.30,
      "should_match": false
    }
  ]
}
```

The fixture contains at least 3 new commitments and 5 historical commitments from the same owner, with a mix of expected matches, expected non-matches, and one boundary case.

---

## 6. Performance Considerations

```
PER-CALL PERFORMANCE TARGETS:
  similarity_score() for two 5-token normalized texts: < 1ms
  normalize_and_compare() for two raw texts: < 2ms
    (additional cost: normalize_text() for both inputs)
  compare_many() for one query against 10 candidates: < 10ms
  compare_many() for one query against 100 candidates: < 100ms

WHERE THE TIME GOES:
  TfidfVectorizer() construction:   < 0.1ms (lightweight class, no I/O)
  fit_transform([a, b]):            < 0.5ms for 5-10 token texts
  sklearn_cosine():                 < 0.1ms for 2×5 matrix
  Jaccard computation:              < 0.05ms (pure set operations)
  Pydantic model construction:      < 0.1ms (SimilarityBreakdown + SimilarityResult)
  Total:                            < 1ms per call

PERFORMANCE PROFILING ON DAY 52:
  The 5:00 PM slot in the execution plan is specifically for timing
  100 consecutive normalize_and_compare() calls on realistic inputs
  (5-10 token normalized texts, varied overlap). This establishes
  the empirical baseline that Day 60's production monitoring will
  compare against.
  Target: p99 < 5ms per call in the test environment.

POTENTIAL FUTURE OPTIMIZATION (NOT TODAY):
  If profiling shows TfidfVectorizer construction is the bottleneck
  (unlikely at 5 tokens but possible at larger scale), consider:
  1. numpy-based cosine from raw token-count vectors (no sklearn overhead)
  2. Pre-computed TF weights for the query in compare_many() (not per-candidate)
  These are future optimizations triggered by measured evidence,
  not preemptive over-engineering.

WHY scikit-learn, NOT A CUSTOM TF-IDF IMPLEMENTATION:
  scikit-learn's TfidfVectorizer is:
  - Battle-tested on production systems for 15+ years
  - Numerically stable (handles edge cases like all-zero vectors)
  - Maintained by a large community (bugs are fixed by others)
  - Already likely in the requirements if the embedding work (Day 56+)
    uses sklearn utilities
  Writing a custom TF-IDF implementation would be ~100 lines of Python
  that need their own numerical correctness testing and maintenance.
  The marginal performance benefit (eliminating scipy sparse matrix
  overhead for 5-token texts) is not worth the maintenance cost.
```

---

## 7. Security Considerations

```
INPUT SANITIZATION:
  The similarity engine receives normalized text strings from two sources:
  1. ParsedCommitment.normalized_text (from Day 49's commitment_parser)
  2. HistoricalCommitment.normalized_text (from the PostgreSQL database,
     originally produced by the same parser at extraction time)
  Both have already been through normalize_text() which strips to
  alphanumeric + whitespace content. There is no PII, no SQL, no HTML,
  no shell-injection-possible content in a 5-token normalized commitment
  text. The similarity engine has no injection attack surface.

DENIAL OF SERVICE CONSIDERATIONS:
  TfidfVectorizer construction is lightweight but not free. If a caller
  sends a commitment with a pathologically long text that wasn't properly
  normalized (e.g. normalized_text is 500 tokens instead of ≤ 5 tokens),
  fit_transform() would be significantly slower.
  Mitigation: _validate_and_tokenize() truncates to MAX_NORMALIZED_TOKENS
  (imported from extraction config) before passing to the vectorizer.
  This is both a correctness guarantee (normalized text should always be
  ≤ 5 tokens) and a DoS prevention measure (an oversized input never
  reaches the vectorizer with its full length).

NO SECRETS, NO CREDENTIALS:
  This module makes no network calls, reads no secrets, touches no
  databases. It is a pure mathematical computation. The security
  attack surface is zero from an external perspective.

FLOAT PRECISION:
  Floating-point arithmetic in Python's numpy (used by scikit-learn
  internally) is IEEE 754 double precision. The clipping operations
  (SCORE_CLIP_MIN, SCORE_CLIP_MAX) handle the edge cases where
  floating-point produces values slightly outside [0.0, 1.0].
  The Pydantic field constraints (ge=0.0, le=1.0) will never be
  triggered by clipped values, but they remain as a documentation
  of intent and as a backstop against future code changes that might
  inadvertently remove the clipping.
```

---

## 8. End-of-Day Testing & Definition of Done

```
UNIT TESTS — similarity_config.py invariants:
  [ ] COSINE_WEIGHT + JACCARD_WEIGHT == 1.0 (within 1e-9 tolerance)
      Verified via: `from config.similarity_config import COSINE_WEIGHT,
      JACCARD_WEIGHT; assert abs((COSINE_WEIGHT + JACCARD_WEIGHT) - 1.0) < 1e-9`
  [ ] All config constants are their documented types (float for weights,
      int for token counts)
  [ ] MATCH_THRESHOLD is in (0.0, 1.0) exclusive

UNIT TESTS — import chain verification:
  [ ] `from services.similarity import normalize_and_compare` succeeds
      cleanly — no ImportError, no circular import
  [ ] normalize_text used inside similarity.py is the SAME function
      object as commitment_parser.normalize_text (verified via identity
      check: `import services.similarity as s; import services.extraction
      .commitment_parser as cp; assert s.normalize_text is cp.normalize_text`)

UNIT TESTS — _compute_cosine_similarity() (private, tested via white-box
  if needed, or via similarity_score() which calls it):
  [ ] Identical texts → cosine = 1.0 (or very close: > 0.999)
  [ ] Completely disjoint token sets → cosine = 0.0
  [ ] One-token input (norm_a = "deploy", norm_b = "review") →
      returns 0.0 WITHOUT exception (MIN_TOKENS_FOR_COSINE guard fires)
  [ ] Both empty strings → returns 0.0 WITHOUT exception
  [ ] All-stopword input (after normalization, tokens_a = []) →
      returns 0.0 WITHOUT exception (ValueError from sklearn caught)
  [ ] Return value is ALWAYS in [0.0, 1.0] (assert via property test
      over 1000 random normalized-text pairs)

UNIT TESTS — _compute_jaccard():
  [ ] Identical token sets → 1.0
  [ ] Completely disjoint sets → 0.0
  [ ] 50% overlap → 0.333... (1 shared / 3 union for sets {a,b}, {b,c})
  [ ] Both empty → 0.0 WITHOUT ZeroDivisionError
  [ ] One empty, one non-empty → 0.0 (intersection is empty)
  [ ] Return value is ALWAYS in [0.0, 1.0]

UNIT TESTS — similarity_score() (the core combiner):
  [ ] Identical texts → score ≥ 0.999 (both cosine and Jaccard = 1.0)
  [ ] Completely different texts → score ≤ 0.05 (both components near 0.0)
  [ ] SimilarityBreakdown.weighted_score == score (within 1e-9)
  [ ] weighted_score == (cosine * 0.70) + (jaccard * 0.30) (exactly, within 1e-6)
  [ ] fallback_used=True when either text has < MIN_TOKENS_FOR_COSINE tokens
  [ ] fallback_used=False when both texts have >= MIN_TOKENS_FOR_COSINE tokens
  [ ] When fallback_used=True: cosine_score == 0.0, weighted_score == jaccard_score
  [ ] is_above_threshold == (score >= MATCH_THRESHOLD) for every test case
  [ ] All returned scores are in [0.0, 1.0] regardless of input

UNIT TESTS — normalize_and_compare() integration:
  [ ] Raw commitment text → normalized → compared (end-to-end flow)
  [ ] "I'll finish the login feature" vs "finish the login feature by Thursday"
      → score ≥ 0.85 (normalized forms are nearly identical → high score)
  [ ] "I'll finish the login feature" vs "I'll update the documentation"
      → score ≤ 0.20 (completely different normalized tokens)
  [ ] "finish login" vs "login finish" (same tokens, different order)
      → score ≥ 0.85 (Jaccard is order-invariant; cosine is also largely so
      for short texts with this vectorizer config)

UNIT TESTS — has_prefix_match():
  [ ] "finish login feature" vs "finish login feature" → matched=True
  [ ] "finish login feature" vs "finish login page" → matched=True (first 3
      tokens: ["finish","login","feature"] vs ["finish","login","page"] →
      WAIT: "feature" ≠ "page" → matched=False!) — this specific case
      verifies exact token comparison, no partial/fuzzy matching in prefix
  [ ] "finish login" (only 2 tokens) vs "finish login feature" (3 tokens)
      → matched=False (norm_a has < PREFIX_MATCH_LENGTH tokens)
  [ ] Empty string vs anything → matched=False, no exception

UNIT TESTS — compare_many():
  [ ] 5 candidates, result list length == 5 (same order as input)
  [ ] pre_normalized=True skips normalize_text() call (verify via
      mock/spy that normalize_text is not called when pre_normalized=True)
  [ ] pre_normalized=False calls normalize_text exactly once per input
      (not once per candidate × once per query comparison)

FULL FIXTURE TESTS (similarity_known_pairs.json — 30+ cases):
  [ ] ALL pairs in `same_commitment` category: score >= expected_score_min
      AND is_above_threshold=True
  [ ] ALL pairs in `different_commitment_same_owner` category: score <=
      expected_score_max AND is_above_threshold=False
  [ ] ALL pairs in `similar_but_different` category: score in documented
      expected range AND is_above_threshold=False
  [ ] ALL pairs in `edge_cases` category: no exception raised; score in [0.0, 1.0]
  [ ] `boundary_cases` category: score is within the documented range
      (which spans the threshold — these cases are documented as having
      implementation-dependent outcomes, not deterministic pass/fail)

RESOLVER FIXTURE VALIDATION (resolver_fixture_01.json):
  [ ] ALL expected_match pairs: similarity_score() ≥ expected_similarity_min
      AND ≥ MATCH_THRESHOLD (ready for the resolver to use as matches)
  [ ] ALL expected_no_match pairs: similarity_score() ≤ expected_similarity_max
      AND < MATCH_THRESHOLD (resolver will not match these)

MATHEMATICAL PROPERTY TESTS (invariants that must hold for ALL inputs):
  [ ] similarity_score(a, b) == similarity_score(b, a) (commutativity)
      — proven for both cosine and Jaccard individually, and by extension
      for the weighted combination
  [ ] similarity_score(a, a) ≥ 0.999 for any non-empty text a (self-similarity)
  [ ] similarity_score("", "") == 0.0 (both empty → 0.0, not undefined)
  [ ] 0.0 ≤ similarity_score(any, any) ≤ 1.0 (range invariant)

PERFORMANCE TEST:
  [ ] 100 consecutive normalize_and_compare() calls on realistic 5-token
      pairs complete in < 200ms total (< 2ms per call including normalization)
  [ ] compare_many() with 1 query and 50 candidates completes in < 50ms

DEFINITION OF DONE:
  ALL 30+ fixture pairs pass their expected-score assertions.
  ALL mathematical invariants hold (commutativity, self-similarity,
  range containment).
  Import chain verified (no circular imports, normalize_text is shared).
  Performance targets met.
  resolver_fixture_01 validated: the threshold correctly separates
  expected-match from expected-no-match pairs in the golden dataset.
```

---

## 9. Explicit Risks & Open Decisions Carried Forward

```
RISK / DECISION                              RESOLUTION TODAY / DEFERRED TO
──────────────────────────────────────────────────────────────────────────
scikit-learn version pinning              Pin to >=1.4.0,<2.0.0 in
(TfidfVectorizer API stability)           requirements.txt. The
                                           TfidfVectorizer API has been
                                           stable since 0.x; this is a
                                           low-risk dependency. Pin
                                           anyway per the project's
                                           dependency hygiene policy.

numpy installation (implicit dependency)  scikit-learn requires numpy.
                                           Confirm numpy is in
                                           requirements.txt (it should
                                           be from Day 51's pytz/dateutil
                                           additions or earlier). If not,
                                           add numpy>=1.24.0 explicitly.

token_pattern choice in TfidfVectorizer   r'\S+' is chosen today. If
(could be r'[a-z]+' for letter-only)      post-normalization texts ever
                                           contain digits (e.g. "fix v2
                                           api" → normalized "fix v2 api"
                                           → tokens ["fix","v2","api"]),
                                           r'\S+' handles them correctly.
                                           r'[a-z]+' would strip "v2" to
                                           nothing. r'\S+' is more robust.

MATCH_THRESHOLD location: similarity_config   Today's plan places it in
vs a future resolver_config                    similarity_config.py because
                                               no resolver_config.py exists
                                               yet. When Day 53 creates the
                                               resolver, the threshold may
                                               be moved there if it belongs
                                               more naturally in resolver
                                               domain config. Either location
                                               is acceptable as long as
                                               exactly one file defines it.

Boundary case fixture pairs (expected         Documented as "expected range
outcome near threshold = potentially           straddles threshold" — these
implementation-dependent)                     are observability cases, not
                                               pass/fail assertions. Day 60's
                                               eval will determine if the
                                               system's actual threshold is
                                               well-calibrated for the
                                               real commitment corpus.
```

---

*Document: AI-PIPELINE-DAY52-DEEP | Vocaply | Version 1.0*
*Principal Backend Engineer + Principal AI/RAG Engineer Edition*
*Similarity Engine — TF-IDF Cosine + Keyword Overlap — Pure Mathematical, Zero LLM Calls*
*Planning Document Only — No Implementation Code*
