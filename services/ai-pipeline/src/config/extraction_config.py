EXTRACTION_CHUNK_MAX_TOKENS: int = 90_000
EXTRACTION_CHUNK_OVERLAP_TURNS: int = 3
# Maximum fraction of max_tokens that overlap context may consume per chunk.
# e.g. 0.15 = 15% of 90_000 tokens = 13_500 tokens max for overlap.
# Prevents long speaker turns from bloating overlap to 30-40% of chunk budget.
EXTRACTION_OVERLAP_TOKEN_BUDGET_PCT: float = 0.15
EXTRACTOR_CHUNK_CONCURRENCY: int = 3
EXTRACTION_PROMPT_CACHE: bool = True
CONFIDENCE_FLOOR: float = 0.3
