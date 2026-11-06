"""
rag/batching.py — token-aware batching and truncation (pure, no network).

Token counts here must be EXACT (they decide truncation and request budgets),
so this uses the embedding model's own tokenizer (cl100k_base), not the
character-ratio estimator used elsewhere in the service.
"""

from __future__ import annotations

import re
from functools import lru_cache
from typing import Sequence

import structlog

from src.config.rag_config import EMBEDDING_TOKENIZER

log = structlog.get_logger(__name__)

# Sentence terminators: Latin + Arabic-script (Urdu) question mark / full stop.
_BOUNDARY = re.compile(r"[.!?\n۔؟]")
_BOUNDARY_WINDOW = 0.20   # boundary must lie in the last 20% of the allowed text


@lru_cache(maxsize=1)
def _encoder():  # type: ignore[no-untyped-def]
    try:
        import tiktoken

        return tiktoken.get_encoding(EMBEDDING_TOKENIZER)
    except Exception as exc:  # noqa: BLE001 — offline / blocked download
        log.warning("embedding_tokenizer_unavailable_using_byte_estimate", error=str(exc)[:160])
        return None


def count_tokens(text: str) -> int:
    """Exact cl100k_base count. If the tokenizer cannot be loaded, fall back to a
    deliberately CONSERVATIVE estimate (bytes/2 ≥ real tokens for any script)."""
    if not text:
        return 0
    enc = _encoder()
    if enc is None:
        return len(text.encode("utf-8")) // 2 + 1
    return len(enc.encode(text, disallowed_special=()))


def truncate_to_tokens(text: str, max_tokens: int) -> tuple[str, bool, int]:
    """Return (text, was_truncated, original_token_count).

    Cuts at the last sentence boundary inside the token window when that
    boundary is within the final 20% of the window, otherwise at the last
    whitespace. Never splits a word; multi-byte safe.
    """
    if max_tokens < 1:
        raise ValueError("max_tokens must be >= 1")
    original = count_tokens(text)
    if original <= max_tokens:
        return text, False, original

    enc = _encoder()
    if enc is None:
        window = text[: max(1, max_tokens)]            # conservative: 1 char ≤ 1 token budget
    else:
        window = enc.decode(enc.encode(text, disallowed_special=())[:max_tokens]).rstrip("�")

    cut = _cut_at_boundary(window)
    # Re-encoding a prefix can, rarely, tokenise differently at the edge. Shrink until it fits.
    while cut and count_tokens(cut) > max_tokens:
        cut = _cut_at_boundary(cut[: max(1, int(len(cut) * 0.95))])
    return cut, True, original


def _cut_at_boundary(window: str) -> str:
    last = None
    for match in _BOUNDARY.finditer(window):
        last = match.end()
    if last is not None and last >= len(window) * (1 - _BOUNDARY_WINDOW):
        return window[:last].rstrip()
    space = max(window.rfind(" "), window.rfind("\t"))
    if space > 0:
        return window[:space].rstrip()
    return window.rstrip()     # one giant "word": nothing better to do


def build_batches(
    token_counts: Sequence[int],
    max_items: int,
    max_tokens: int,
) -> list[list[int]]:
    """Greedy, order-preserving. Returns lists of INDICES into `token_counts`.

    A new batch starts when either limit would be exceeded. Every batch is
    non-empty; a single item above `max_tokens` is a caller bug (it should have
    been truncated first) and raises.
    """
    if max_items < 1 or max_tokens < 1:
        raise ValueError("max_items and max_tokens must be >= 1")
    batches: list[list[int]] = []
    current: list[int] = []
    used = 0
    for index, tokens in enumerate(token_counts):
        if tokens > max_tokens:
            raise ValueError(f"item {index} has {tokens} tokens > batch budget {max_tokens}; truncate first")
        if current and (len(current) >= max_items or used + tokens > max_tokens):
            batches.append(current)
            current, used = [], 0
        current.append(index)
        used += tokens
    if current:
        batches.append(current)
    return batches
