"""
config/resolution_config.py
────────────────────────────────────────────────────────────────────────────────
Vocaply AI Pipeline — Commitment Resolver Configuration
Day 53 + Day 54 Extension | Principal Engineer Edition

ALL tunable constants for the owner-scoped commitment resolver (Day 53) and the
two-stage Resolution Detector (Day 54).

DAY 54 ADDITIONS:
  § COMPLETION_KEYWORDS     — Stage 1 positive signal frozenset
  § NON_COMPLETION_PHRASES  — Stage 1 negative signal ordered list (order matters)
  § STAGE2_CONFIDENCE_THRESHOLD — minimum model confidence for YES → RESOLVED
  § MAX_TEXT_LENGTH_FOR_DETECTION — character cap for Stage 2 input texts
  § STAGE2_MAX_CONCURRENT_CALLS — asyncio concurrency cap for detect_many()
  § RESOLUTION_PROMPT_VERSION_PATH — path to versioned system prompt

PRINCIPAL DESIGN NOTE — CONSERVATIVE DEFAULTS:
  Every constant here is the PRIMARY TUNING LEVER for Day 60's eval harness.
  The asymmetry-of-harm (false-positive is catastrophic, false-negative is mild)
  drives all threshold choices toward conservative defaults. Change these via
  environment-specific config only — never via ad-hoc hotfixes.
"""

# Import similarity-domain configurations to avoid duplication
from src.config.similarity_config import (
    MATCH_THRESHOLD,
    SCORE_BOOST_FOR_PREFIX_MATCH,
)

# ─── Day 53: Resolver Specific Policies ───────────────────────────────────────

MAX_HISTORICAL_POOL_SIZE: int = 500
"""A safety cap on the number of historical commitments the resolver will process
per owner per call.

At 500 commitments per owner, the pairwise comparison with 10 new commitments
is 5,000 comparisons, which takes <5 seconds.
"""

OWNER_MATCH_NAME_MIN_CHARS: int = 3
"""Minimum character length for an owner_name to be used in fuzzy name matching.

Names shorter than this (single initials, "Al") are treated as ambiguous and
fall back to user_id matching only.
"""

UNKNOWN_SPEAKER_MARKER: str = "unknown speaker"
"""The exact normalized string used as owner_name for unresolved speakers.

Historical commitments from unknown speakers are NEVER matched against new
commitments from unknown speakers.
"""


# ─── Day 54 § 1: Stage 1 Positive Signal Set ──────────────────────────────────

COMPLETION_KEYWORDS: frozenset[str] = frozenset(
    {
        # Core completion verbs (past-tense and state-completion only)
        # NOTE: Only past-tense / state-completion forms included.
        # Future-tense ("finish", "complete") are intentionally absent —
        # they indicate intent, not completion. Stage 1 is an explicit
        # past-completion gate.
        "done",          # simplest completion marker; "not done yet" caught by NCP first
        "finished",      # explicit past-tense completion verb
        "completed",     # explicit past-tense completion verb (formal register)
        "merged",        # code/PR specific completion — high signal in eng teams
        "deployed",      # deployment-specific completion signal
        "shipped",       # product release completion
        "sent",          # delivery action completed
        "delivered",     # delivery completed (formal register)
        "fixed",         # bug/issue resolution specific
        "resolved",      # issue resolution — "I resolved to do X" won't trigger due
                         # to NCP pass running first; "unresolved" blocked by \\b boundary
        "pushed",        # git push specific (code delivery)
        "released",      # software release specific
        "launched",      # product launch specific
        "submitted",     # form/PR/document submission
        "closed",        # ticket closure (Jira/GitHub specific)
        "published",     # content publication specific
        "live",          # "it's live" / "went live" — deployment indicator
        "wrapped up",    # informal two-word completion marker
        "taken care of", # informal multi-word completion marker
        "sorted",        # British English completion — "it's sorted"
        "handled",       # informal completion — "I handled it"
        "handed off",    # task handoff completion — "I handed it off to Sara"
        "approved",      # review/approval completion
        "signed off",    # formal approval completion
        "verified",      # testing/QA completion — "I verified it works"
        "tested",        # testing completion
        "reviewed",      # review completion — CONTEXT-DEPENDENT:
                         # "I reviewed but have comments" is NOT completion.
                         # Retained in keyword set because Stage 1's job is to
                         # PASS ambiguous cases to Stage 2, not to incorrectly
                         # block them. Stage 2 handles the "reviewed + issues"
                         # case correctly with full sentence context.
    }
)
"""Stage 1 positive signal frozenset.

Words that, when found as WHOLE WORDS (word-boundary regex, case-insensitive)
in the new statement text, constitute sufficient evidence of completion to PASS
Stage 1 — provided no non-completion phrase is also present (NCP check runs first).

FROZENSET (not list): order is irrelevant — any single keyword match passes.
The regex is pre-compiled at module init in resolution_detector.py using
word boundaries (\\b) to prevent substring false positives (e.g., "unfinished"
must NOT match "finished").
"""


# ─── Day 54 § 2: Stage 1 Negative Signal Set ─────────────────────────────────

NON_COMPLETION_PHRASES: list[str] = [
    # ── Multi-word explicit negation + completion verb (most specific — checked first) ──
    # ORDER INVARIANT: Longer, more specific phrases MUST appear before their
    # contained substrings. "not quite done" must be checked before "done"
    # appears as a completion keyword. The NCP pass runs BEFORE the keyword
    # pass (Decision 2 from Day 54 plan), but within this list, specificity
    # ordering prevents shorter phrases from triggering before longer ones that
    # subsume them.
    "haven't finished",
    "have not finished",
    "haven't completed",
    "have not completed",
    "haven't done",
    "have not done",
    "haven't gotten to",
    "have not gotten to",
    "haven't had a chance",
    "have not had a chance",
    "ran out of time",
    "didn't get to",
    "did not get to",
    "couldn't finish",
    "could not finish",
    "couldn't complete",
    "could not complete",
    # ── Qualified / partial completion (proximity claims, NOT completion) ──
    "not quite done",
    "not quite finished",
    "not quite complete",
    "not done yet",
    "not finished yet",
    "not complete yet",
    # ── Work-state phrases (ongoing, blocked, waiting) ──
    "still in progress",
    "still working on",
    "still working",
    "in progress",
    "in review",          # work is under review — NOT done
    "blocked on",
    "blocking on",
    "waiting on",
    "waiting for",
    "working on",
    # ── Proximity / partial completion ──
    "almost done",
    "almost finished",
    "almost complete",
    "nearly done",
    "nearly finished",
    "nearly complete",
    "partially done",
    "partly done",
    "halfway done",
    "half done",
    # ── Quantified partial (percentage-based) ──
    # NOTE: percentage phrases like "50% done" are handled separately by regex
    # in resolution_detector.py (_PERCENTAGE_PARTIAL_RE) — they are NOT in this
    # list because their form requires a regex, not substring matching.
    # ── Future tense / intent (not current completion) ──
    "going to finish",
    "going to complete",
    "will finish",
    "will complete",
    "plan to finish",
    "plan to complete",
    "planning to",
    "trying to",
    "hope to",
    "should be able to",
    "expecting to",
    "intend to",
    # ── Work state nouns ──
    "pending",
]
"""Stage 1 negative signal ordered list.

An ORDERED LIST of phrases that, when found as CASE-INSENSITIVE SUBSTRINGS in
the new statement text, immediately cause Stage 1 to return NOT_RESOLVED —
regardless of whether a completion keyword is also present in the same text.

LIST (not frozenset): ORDER MATTERS — more specific phrases must appear before
their contained substrings. The regex built from this list orders patterns by
string length descending (longer first) so the regex alternation engine tries
longer, more specific patterns before shorter, less specific ones.

WHY SUBSTRING (not word-boundary) FOR NCP:
  NCP phrases are multi-word constructions where word boundaries add no precision
  benefit. "still working on it" should match "still working on" regardless of
  what follows. Substring matching is intentionally broader here — a false NCP
  hit (blocking a real completion) is far less harmful than a false keyword hit
  (calling a non-completion a completion).
"""


# ─── Day 54 § 3: Stage 2 Model Configuration ──────────────────────────────────

STAGE2_CONFIDENCE_THRESHOLD: float = 0.70
"""Minimum model confidence for a YES (resolved=True) determination to trigger
DetectionStatus.RESOLVED.

ASYMMETRY-OF-HARM RATIONALE:
  A FALSE POSITIVE (wrongly marking FULFILLED) is catastrophic:
    - commitment disappears from open items permanently
    - no more reminders for work that isn't done
    - accountability record is corrupted
    - professional negligence goes untracked

  A FALSE NEGATIVE (wrongly keeping PENDING) is mild:
    - one unnecessary reminder email
    - self-corrects in the next meeting cycle

CONSERVATIVE DESIGN CONSEQUENCE:
  Only a HIGH-CONFIDENCE YES (>= 0.70) triggers RESOLVED.
  A high-confidence NO, a low-confidence YES (0.55), and a low-confidence NO
  (0.60) all produce NOT_RESOLVED. The model must be "sure it's done" for the
  system to mark something as done.

CALIBRATION (WHY 0.70, NOT 0.80 OR 0.60):
  0.80+: too conservative — clear completion statements often score 0.72-0.85.
         A 0.80 threshold would miss obvious completions (false negatives increase).
  0.60-: too permissive — vague statements score 0.50-0.65. At 0.60, false
         positives appear (catastrophic per the asymmetry above).
  0.70: empirically calibrated to sit between "obvious completion" (0.80+)
        and "possible but ambiguous" (0.50-0.65) clusters.

PRIMARY TUNING LEVER for Day 60's eval harness. Stored here as a config
constant — not hardcoded in resolution_detector.py — so it's a one-line
change + redeploy when calibrated against real production data.
"""

MAX_TEXT_LENGTH_FOR_DETECTION: int = 500
"""Maximum character length of either the new statement or historical commitment
text passed to Stage 2 (GPT-4.1 Mini).

RATIONALE:
  Prevents the detection call from being dominated by unexpectedly long texts
  (a 3-sentence rambling update vs. a 1-line commitment), keeps the prompt
  focused on the core statements, and guards against token overflow in edge
  cases. Truncation is performed at word boundaries (no mid-word truncation)
  and logged at DEBUG level. The model sees clean text — no truncation markers.

  A typical commitment text: 10-30 words (~60-200 chars).
  A typical new statement: 10-50 words (~60-350 chars).
  500 chars: covers 99th-percentile statement lengths without overflow risk.
"""

STAGE2_MAX_CONCURRENT_CALLS: int = 5
"""Maximum number of concurrent Stage 2 (GPT-4.1 Mini) calls in detect_many().

Used as the asyncio.Semaphore limit in detect_many() to prevent overwhelming
the OpenAI API with concurrent requests. For typical meetings (0-5 Stage 2
calls total), this limit is never reached. For stress-test scenarios (large
batch resolutions), this caps the concurrent fan-out.
"""

RESOLUTION_PROMPT_VERSION_PATH: str = "prompts/resolution_system.txt"
"""Relative path (from the ai-pipeline src root) to the versioned Stage 2 system prompt.

Loaded at module init in resolution_detector.py (fail-fast pattern). The prompt
version tag is extracted from the first comment line:
  # prompt_version: resolution-v1.0

Changing to a new prompt version: update the .txt file and bump the version
tag. The version is stored in _resolution_prompt_version and logged with every
Stage 2 invocation — enabling post-hoc analysis of which prompt version produced
which decisions.
"""

RESOLUTION_USER_PROMPT_PATH: str = "prompts/resolution_user.txt"
"""Relative path to the per-pair user message template.

Loaded once at module init. Formatted per-call with {historical_commitment_text}
and {new_statement_text} substitutions. Avoids file I/O per detection call while
keeping the template in a manageable .txt file (not embedded as a raw string in
code — templating from files is the established pattern in this service).
"""

# ─── Day 54 § 4: Stage 1 Internal Confidence Constants ───────────────────────
# These are NOT tuning levers — they are fixed, semantically justified values
# representing Stage 1's confidence in its NOT_RESOLVED determination.
# They are stored in config (not hardcoded in the detector) purely for
# discoverability — an operator should know where all confidence values live.

STAGE1_CONFIDENCE_NON_COMPLETION_PHRASE: float = 0.92
"""Stage 1 confidence when a non-completion phrase was found.

Very high confidence: the phrase explicitly signals non-completion.
"I haven't finished the login feature" → "haven't finished" is unambiguous.
"""

STAGE1_CONFIDENCE_NO_KEYWORD: float = 0.88
"""Stage 1 confidence when no completion keyword was found.

High confidence: absence of completion vocabulary is strong evidence that
the statement does not claim completion.
"""

STAGE1_CONFIDENCE_SHORT_TEXT: float = 0.75
"""Stage 1 confidence when the text is too short to analyze reliably.

Moderate confidence: "done" (1 word) technically contains a completion keyword
but is below the 3-word minimum for reliable classification. The short-text
guard fires before keyword detection, so this statement goes to NOT_RESOLVED
conservatively — but with lower confidence than a clear NCP or keyword-absence
result.
"""
