"""
services/chat/token_estimator.py
────────────────────────────────
Local, calibrated token estimator (ADR-4). No network on the hot path.

Urdu SCRIPT tokenizes far worse per character than English (each Arabic-block
character is often 1–2 byte-level tokens), so a single chars/4 ratio would let a
2,000-character Urdu message blow through the budget. Text is classified per
language class and each class has its own chars-per-token ratio, then a safety
margin is applied. The estimator errs HIGH on purpose: over-estimating wastes a
little context, under-estimating overshoots the budget or the quota reservation.

`observe()` compares an estimate with the provider's reported usage after every
call so drift is a metric (`chat_estimator_error_ratio`), not a surprise.
"""

from __future__ import annotations

import math
import re
from enum import StrEnum

from src.rag.metrics import metrics

SAFETY_MARGIN = 1.10
# Conservative chars-per-token, calibrated against tests/fixtures/estimator_calibration.json.
_CHARS_PER_TOKEN: dict[str, float] = {
    "english": 3.6,
    "roman_urdu": 2.8,
    "urdu_script": 1.4,
    "mixed": 2.0,
}
_MESSAGE_OVERHEAD_TOKENS = 4

_ARABIC_BLOCK = re.compile(r"[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]")
_WORD = re.compile(r"[^\W\d_]+", re.UNICODE)
# Very common Roman-Urdu function words (Latin script). Matches are a signal, not proof.
_ROMAN_URDU = frozenset(
    "kya hai hain nahi nahin mai main mein ko ka ki ke se aap hum tum yeh ye woh wo kar karo karna kia tha thi the "
    "bhi aur lekin kyun kaise kab kahan kaun abhi kal aaj wala wali ho hoga hogi raha rahi rahe diya liya gaya gayi "
    "mera meri tera apna humara kuch sab bohat bahut acha theek jee ji".split()
)


class LanguageClass(StrEnum):
    ENGLISH = "english"
    ROMAN_URDU = "roman_urdu"
    URDU_SCRIPT = "urdu_script"
    MIXED = "mixed"


def classify(text: str) -> LanguageClass:
    if not text:
        return LanguageClass.ENGLISH
    letters = sum(1 for ch in text if ch.isalpha())
    if letters == 0:
        return LanguageClass.ENGLISH
    arabic = len(_ARABIC_BLOCK.findall(text))
    arabic_share = arabic / letters
    if arabic_share >= 0.6:
        return LanguageClass.URDU_SCRIPT
    if arabic_share >= 0.15:
        return LanguageClass.MIXED
    words = [w.lower() for w in _WORD.findall(text)]
    if len(words) >= 3:
        share = sum(1 for w in words if w in _ROMAN_URDU) / len(words)
        if share >= 0.22:
            return LanguageClass.ROMAN_URDU
    return LanguageClass.ENGLISH


def estimate_tokens(text: str) -> int:
    """Upper-biased token estimate for `text` (0 for empty)."""
    if not text:
        return 0
    cls = classify(text)
    ratio = _CHARS_PER_TOKEN[cls.value]
    return max(1, math.ceil(len(text) / ratio * SAFETY_MARGIN))


def estimate_messages(parts: list[str]) -> int:
    return sum(estimate_tokens(p) + _MESSAGE_OVERHEAD_TOKENS for p in parts)


def truncate_to_tokens(text: str, max_tokens: int) -> str:
    """Cut `text` to roughly `max_tokens`, preferring a sentence boundary, never mid-surrogate."""
    if max_tokens <= 0:
        return ""
    if estimate_tokens(text) <= max_tokens:
        return text
    ratio = _CHARS_PER_TOKEN[classify(text).value]
    approx = max(1, int(max_tokens * ratio / SAFETY_MARGIN))
    cut = text[:approx]
    # prefer the last sentence end within the last 30% of the cut
    floor = int(len(cut) * 0.7)
    for i in range(len(cut) - 1, floor, -1):
        if cut[i] in ".!?۔\n" and (i + 1 == len(cut) or cut[i + 1].isspace()):
            cut = cut[: i + 1]
            break
    while cut and estimate_tokens(cut) > max_tokens:
        cut = cut[: int(len(cut) * 0.9)]
    return cut.rstrip()


def observe(estimated: int, actual: int, *, stage: str = "generate") -> float:
    """Record estimate vs provider usage. Returns |est-actual|/actual (0 when actual is 0)."""
    if actual <= 0:
        return 0.0
    err = abs(estimated - actual) / actual
    metrics.observe("chat_estimator_error_ratio", err, stage=stage)
    return err
