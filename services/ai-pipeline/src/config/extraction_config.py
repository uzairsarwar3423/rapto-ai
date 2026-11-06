EXTRACTION_CHUNK_MAX_TOKENS: int = 90_000
EXTRACTION_CHUNK_OVERLAP_TURNS: int = 3
# Maximum fraction of max_tokens that overlap context may consume per chunk.
# e.g. 0.15 = 15% of 90_000 tokens = 13_500 tokens max for overlap.
# Prevents long speaker turns from bloating overlap to 30-40% of chunk budget.
EXTRACTION_OVERLAP_TOKEN_BUDGET_PCT: float = 0.15
EXTRACTOR_CHUNK_CONCURRENCY: int = 3
EXTRACTION_PROMPT_CACHE: bool = True
CONFIDENCE_FLOOR: float = 0.3

# ─── Confidence gate (Claude fallback) ────────────────────────────────────────
# Defaults only — the live values come from Settings (CONFIDENCE_GATE_* env vars)
# so they can be tuned per environment without a deploy.

# A chunk whose mean item confidence (across all 5 structured extractors) is
# below this value is re-extracted with the fallback model.
CONFIDENCE_GATE_THRESHOLD: float = 0.60

# An extractor whose items are ALL below this value is re-extracted with the
# fallback model even when the chunk-wide mean is above CONFIDENCE_GATE_THRESHOLD.
LOW_ITEM_CONFIDENCE_THRESHOLD: float = 0.55

# Minimum number of extracted items before the chunk-wide mean is trusted.
# With a single low-confidence item the mean is pure noise; the per-extractor
# rule still applies.
CONFIDENCE_GATE_MIN_ITEMS: int = 2

# When merging primary + fallback results, items from the losing side are kept
# only if they are not near-duplicates of a winning item (similarity ≥ this)
# and their own confidence is at least CONFIDENCE_GATE_THRESHOLD.
FALLBACK_MERGE_DEDUP_THRESHOLD: float = 0.70
