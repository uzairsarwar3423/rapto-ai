"""
rag/text_utils.py — pure text helpers shared by the re-ranker prompt and citations.

Everything user-visible that originates from a transcript is UNTRUSTED. These
helpers only make it safer to display (control characters stripped, bounded
length, no mid-word / mid-character cuts); the UI must still escape it.
"""

from __future__ import annotations

import re
import unicodedata

_WS = re.compile(r"\s+")
# Bidi embedding/override/isolate controls let a transcript visually reorder text in a UI
# ("spoofing"). ZWJ/ZWNJ are NOT stripped: Urdu/Persian shaping and emoji need them.
_BIDI = re.compile("[\u202a-\u202e\u2066-\u2069]")
_SENTENCE_END = re.compile(r"[.!?\n۔؟]")
_ZWJ = "\u200d"
_ZWJ_AND_SELECTORS = {_ZWJ, "\ufe0e", "\ufe0f"}


def clean_text(text: str) -> str:
    """NFC, control/format characters → space, whitespace collapsed."""
    text = unicodedata.normalize("NFC", text)
    text = _BIDI.sub("", text)
    text = "".join(" " if unicodedata.category(c) in ("Cc", "Cs") else c for c in text)
    return _WS.sub(" ", text).strip()


def _continues_cluster(ch: str) -> bool:
    """True if `ch` must stay attached to the character before it."""
    return unicodedata.category(ch) in ("Mn", "Me", "Mc") or ch in _ZWJ_AND_SELECTORS


def _safe_cut(text: str, limit: int) -> int:
    """Largest index <= limit that does not split a (common) grapheme cluster.

    Two invariants, checked TOGETHER (fixing one can break the other): the next character
    must not continue the cluster being cut, and the kept text must not end on a joiner."""
    cut = min(limit, len(text))
    while cut > 0 and ((cut < len(text) and _continues_cluster(text[cut])) or text[cut - 1] == _ZWJ):
        cut -= 1
    return cut


def truncate_text(text: str, limit: int, *, prefer_sentence: bool = False) -> tuple[str, bool]:
    """(text, was_truncated). Cuts at a sentence boundary (if asked and one exists in the
    last third), else at a word boundary, else at a grapheme-safe character cut.
    The ellipsis is NOT added here: callers add it only when was_truncated."""
    text = clean_text(text)
    if len(text) <= limit:
        return text, False
    head = text[:limit]
    if prefer_sentence:
        last = None
        for match in _SENTENCE_END.finditer(head):
            last = match.end()
        if last is not None and last >= limit * 2 // 3:
            return head[:last].rstrip(), True
    space = head.rfind(" ")
    if space >= max(1, limit // 3):
        return head[:space].rstrip(), True
    return text[: _safe_cut(text, limit)].rstrip(), True


def preview(text: str, limit: int) -> str:
    cut, truncated = truncate_text(text, limit)
    return cut + "…" if truncated else cut
