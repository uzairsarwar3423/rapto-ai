"""
rag/query_processing.py — pure functions, no I/O.

normalize → tokenize → drop stop words → cap → sanitise for to_tsquery.

SECURITY: tokens reach the database only after `sanitize_for_tsquery`; the OR
expression is built from tokens made solely of letters/digits/underscore, so a
user can never inject full-text operators (& | ! < > : ( ) ' *) — and the final
string is still passed as a BOUND parameter, never interpolated.
"""

from __future__ import annotations

import hashlib
import re
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from src.rag.errors import RagValidationError

STOPLIST_VERSION = "stoplist_v1"
_STOPLIST_PATH = Path(__file__).parent / "data" / f"{STOPLIST_VERSION}.txt"

_WS = re.compile(r"\s+")
_WORD = re.compile(r"\w+", re.UNICODE)
_SAFE_TOKEN = re.compile(r"^\w{1,64}$", re.UNICODE)


@lru_cache(maxsize=1)
def stop_words() -> frozenset[str]:
    lines = _STOPLIST_PATH.read_text(encoding="utf-8").splitlines()
    return frozenset(w.strip().casefold() for w in lines if w.strip() and not w.startswith("#"))


@dataclass(frozen=True)
class ProcessedQuery:
    normalized_text: str
    tokens: list[str]
    query_hash: str          # truncated sha256: safe to log, unlike the text itself


def normalize_query(text: str, *, max_chars: int = 2_000) -> str:
    """NFC, strip control characters, collapse whitespace.

    Empty and over-long queries are REJECTED, never truncated: silently cutting a
    question changes its meaning."""
    if not isinstance(text, str):
        raise RagValidationError("query must be a string")
    text = unicodedata.normalize("NFC", text)
    text = "".join(" " if unicodedata.category(c) in ("Cc", "Cf", "Cs") else c for c in text)
    text = _WS.sub(" ", text).strip()
    if not text:
        raise RagValidationError("query must not be empty")
    if len(text) > max_chars:
        raise RagValidationError(f"query exceeds {max_chars} characters")
    return text


def extract_lexical_tokens(
    normalized: str,
    *,
    max_tokens: int = 12,
    min_len: int = 2,
    stop: frozenset[str] | None = None,
) -> list[str]:
    """Content words only, de-duplicated in order of appearance.

    Over the cap the LONGEST tokens are kept (longer ≈ more discriminative), and the
    survivors keep their original order."""
    stop = stop_words() if stop is None else stop
    seen: dict[str, int] = {}
    for match in _WORD.finditer(normalized.casefold()):
        token = match.group(0)
        if len(token) < min_len or token in stop or token in seen:
            continue
        seen[token] = len(seen)
    tokens = list(seen)
    if len(tokens) > max_tokens:
        keep = sorted(tokens, key=lambda t: (-len(t), seen[t]))[:max_tokens]
        tokens = sorted(keep, key=lambda t: seen[t])
    return tokens


def sanitize_for_tsquery(tokens: list[str]) -> list[str]:
    """Defence in depth: drop anything that is not a plain word token."""
    return [t for t in tokens if _SAFE_TOKEN.match(t)]


def to_tsquery_or(tokens: list[str]) -> str:
    """'ahmed | commit | thursday' — OR semantics (an AND over a natural-language
    question would match nothing). Only call with sanitised tokens."""
    safe = sanitize_for_tsquery(tokens)
    return " | ".join(safe)


def hash_query(normalized: str) -> str:
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]


def process_query(
    text: str,
    *,
    max_chars: int = 2_000,
    max_tokens: int = 12,
    min_len: int = 2,
) -> ProcessedQuery:
    normalized = normalize_query(text, max_chars=max_chars)
    tokens = sanitize_for_tsquery(extract_lexical_tokens(normalized, max_tokens=max_tokens, min_len=min_len))
    return ProcessedQuery(normalized, tokens, hash_query(normalized))
