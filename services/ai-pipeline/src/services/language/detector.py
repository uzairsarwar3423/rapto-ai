"""
services/language/detector.py
─────────────────────────────
Deterministic, zero-cost detection of the dominant spoken language of a meeting
transcript. Runs BEFORE extraction so every extractor/summary prompt can be told
which language to write in.

WHY NOT AN LLM CALL?  The transcript is already text from an ASR system, and the
supported languages are separable by script:

    Devanagari  → Hindi   (hi)
    Arabic/Urdu → Urdu    (ur)
    Latin       → English (en), unless the Latin words are overwhelmingly
                  Roman-Urdu/Hindustani function words ("hai", "nahi", "kal"…)

so a script census is exact, free, instant and testable. Spoken Hindi and Urdu are
near-identical; the *script* the ASR emitted is the only reliable discriminator, so
we never guess Hindi for Arabic-script text or vice-versa.

MIXED LANGUAGE: the language with the largest share of *words* wins, but non-Latin
text only needs a 35 % share to beat Latin — meetings in Urdu/Hindi routinely
carry 40–60 % English technical vocabulary (sprint, deployment, API…) and must
still be summarised in the host language.

FALLBACK: transcripts too short to judge (or with no letters at all) fall back to
DEFAULT_LANGUAGE ("en") — identical to behaviour before multilingual support.

Adding a language = one entry in LANGUAGES (+ a script range if it is a new script).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, Optional

DEFAULT_LANGUAGE = "en"

# Minimum words before we trust the census; below this we use the default.
MIN_WORDS_FOR_DETECTION = 4
# Non-Latin share of all words at which the non-Latin language wins.
NON_LATIN_DOMINANCE = 0.35
# Share of Latin words that are Roman-Urdu/Hindustani function words at which a
# Latin-script transcript is treated as Roman Urdu rather than English.
ROMAN_HINDUSTANI_DOMINANCE = 0.22


@dataclass(frozen=True)
class LanguageSpec:
    code: str
    name: str            # English name, used in prompts
    native_name: str
    script: str          # human-readable script name, used in prompts
    rtl: bool = False


LANGUAGES: dict[str, LanguageSpec] = {
    "en": LanguageSpec("en", "English", "English", "Latin script"),
    "ur": LanguageSpec("ur", "Urdu", "اردو", "Urdu (Arabic-based, Nastaliq) script", rtl=True),
    "hi": LanguageSpec("hi", "Hindi", "हिन्दी", "Devanagari script"),
}

# script → language. Arabic-script text is treated as Urdu (the only Arabic-script
# language this product supports).
_SCRIPT_LANGUAGE: dict[str, str] = {"devanagari": "hi", "arabic": "ur"}

_DEVANAGARI = re.compile(r"[ऀ-ॿ]")
_ARABIC = re.compile(r"[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]")
_WORD = re.compile(r"[^\W\d_]+", re.UNICODE)

# Function words that are extremely common in Roman Urdu / Hindustani and are
# not English words. Deliberately excludes words that are also common English
# ("to", "the", "me", "do", "so", "he", "or", "a", "in", "no", "is", "main", "ho").
_ROMAN_HINDUSTANI = frozenset(
    """hai hain hay tha thi hoga hogi honge nahi nahin nhi kya kyun kyu kaise
    kaisa kahan kab kaun koi kuch sab bhi hum ham aap tum mera meri mere tera
    humara hamara apna apni ka ki ke ko se ne par pe aur ya lekin magar agar toh
    tou abhi kal aaj parso jaldi baad pehle phir wahan yahan isko usko isse usse
    karna karni karenge karunga karungi kiya kiye kar raha rahi rahe chahiye
    chahte chahta zaroor zarur theek thik acha accha bilkul bhai yaar jee
    dena denge dunga lena lenge lunga hona hoon mein""".split()
)


@dataclass(frozen=True)
class LanguageDetection:
    code: str
    confidence: float          # 0..1 — share of words supporting the decision
    script: str                # "latin" | "devanagari" | "arabic" | "none"
    romanized: bool = False    # Roman-script Urdu/Hindustani
    reason: str = ""


def _census(text: str) -> tuple[int, int, int, int, int]:
    """(total_words, latin, devanagari, arabic, roman_hindustani_words)."""
    latin = deva = arab = roman = total = 0
    for word in _WORD.findall(text):
        total += 1
        if _DEVANAGARI.search(word):
            deva += 1
        elif _ARABIC.search(word):
            arab += 1
        else:
            latin += 1
            if word.lower() in _ROMAN_HINDUSTANI:
                roman += 1
    return total, latin, deva, arab, roman


def detect_language(text: str, default: str = DEFAULT_LANGUAGE) -> LanguageDetection:
    """Detect the dominant language of `text` (speaker names should be excluded)."""
    total, latin, deva, arab, roman = _census(text or "")
    if total < MIN_WORDS_FOR_DETECTION:
        return LanguageDetection(default, 0.0, "none", reason="insufficient_text")

    non_latin = deva + arab
    if non_latin / total >= NON_LATIN_DOMINANCE:
        script = "devanagari" if deva >= arab else "arabic"
        share = max(deva, arab)
        return LanguageDetection(
            _SCRIPT_LANGUAGE[script],
            round(share / total, 3),
            script,
            reason="script_census",
        )

    if latin and roman / latin >= ROMAN_HINDUSTANI_DOMINANCE:
        # Roman Urdu and Roman Hindi share vocabulary; ASR emits Devanagari when it
        # hears Hindi, so Roman-script Hindustani is treated as Urdu.
        return LanguageDetection(
            "ur", round(roman / latin, 3), "latin", romanized=True, reason="roman_hindustani"
        )

    return LanguageDetection(
        "en" if latin else default,
        round(latin / total, 3),
        "latin",
        reason="latin_default",
    )


def detect_language_from_turns(turns: Iterable[object], default: str = DEFAULT_LANGUAGE) -> LanguageDetection:
    """Detect from cleaned transcript turns (speaker names are excluded on purpose)."""
    text = "\n".join(
        getattr(t, "cleaned_text", None) or getattr(t, "text", "") or "" for t in turns
    )
    return detect_language(text, default=default)


def language_name(code: Optional[str]) -> str:
    spec = LANGUAGES.get(code or DEFAULT_LANGUAGE)
    return spec.name if spec else (code or "English")


def language_directive(detection: LanguageDetection) -> str:
    """The per-request instruction injected next to the transcript in every user prompt."""
    spec = LANGUAGES.get(detection.code, LANGUAGES[DEFAULT_LANGUAGE])
    if spec.code == "en":
        return (
            "OUTPUT LANGUAGE: English. The meeting was conducted in English — write every "
            "text field in English."
        )
    roman_note = (
        " The transcript is romanized (Latin letters); still write your output in "
        f"{spec.script}, not in Latin letters."
        if detection.romanized
        else ""
    )
    return (
        f"OUTPUT LANGUAGE: {spec.name} ({spec.native_name}). The meeting was conducted "
        f"primarily in {spec.name}. Write EVERY human-readable text field in {spec.name} "
        f"using {spec.script}.{roman_note} Do NOT translate into English. Keep names of "
        "people, products, companies, numbers, dates and widely used English technical "
        "terms (e.g. API, sprint, deployment) exactly as spoken. JSON keys, enum values "
        "and field names stay in English."
    )
