"""
services/chat/input_sanitizer.py
────────────────────────────────
Defends the pipeline from hostile or malformed user input BEFORE any model sees it.

* NFC normalization, control + bidi-override + zero-width stripping (they hide text)
* character AND token caps — Urdu script can pass 2,000 chars yet blow the token budget.
  Over-cap input is REJECTED, never silently truncated (truncating changes the question).
* filter validation: list caps, date sanity, and ownership of ids. Foreign ids are
  DROPPED SILENTLY, so a user cannot probe which meeting ids exist in other teams.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Optional, Sequence

from src.models.chat_models import ChatFilters
from src.models.rag_models import AccessScope
from src.services.chat.data_store import ChatDataStore
from src.services.chat.errors import InvalidInputError
from src.services.chat.token_estimator import estimate_tokens

# Bidi embeddings/overrides/isolates + marks, zero-width, BOM, word joiner, soft hyphen, invisible operators.
_INVISIBLE = re.compile(
    "[​-‏‪-‮⁠-⁯﻿­؜᠎￹-￻]"
)
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]")
_WS = re.compile(r"[ \t\r\f\v]+")
_NL = re.compile(r"\n{3,}")


def strip_hidden(text: str) -> str:
    """Remove control, bidi-override and zero-width characters (keeps \\n and \\t)."""
    return _CONTROL.sub("", _INVISIBLE.sub("", text))


def sanitize_text(text: str) -> str:
    """Normalize hostile-capable text for use inside a prompt or log (no length policy)."""
    text = unicodedata.normalize("NFC", text)
    text = strip_hidden(text)
    text = _WS.sub(" ", text)
    text = _NL.sub("\n\n", text)
    return text.strip()


def sanitize_message(raw: str, *, max_chars: int, max_tokens: int) -> str:
    if not isinstance(raw, str):
        raise InvalidInputError("message must be text", field="message")
    cleaned = sanitize_text(raw)
    if not cleaned:
        raise InvalidInputError("message is empty", field="message")
    if len(cleaned) > max_chars:
        raise InvalidInputError(f"message is too long (max {max_chars} characters)", field="message")
    if estimate_tokens(cleaned) > max_tokens:
        # Urdu script / long tokens: the character cap alone does not protect the budget.
        raise InvalidInputError("message is too long for the assistant; please shorten it", field="message")
    return cleaned


@dataclass(frozen=True)
class ValidatedFilters:
    meeting_ids: tuple[str, ...]
    speaker_ids: tuple[str, ...]
    date_from: Optional[object]
    date_to: Optional[object]
    dropped_meeting_ids: int = 0
    dropped_speaker_ids: int = 0


async def validate_filters(
    filters: ChatFilters,
    *,
    team_id: str,
    store: ChatDataStore,
    scope: AccessScope,
) -> ValidatedFilters:
    """Pydantic already checked shapes and caps. Here: ownership. One batched query per id kind.

    Foreign / inaccessible ids are dropped, not rejected: the response is identical whether an id
    belongs to another team, is in a private meeting, or never existed (no existence oracle).
    A request whose EVERY meeting filter is dropped then searches nothing (empty set), it does not
    silently widen to the whole team.
    """
    meeting_ids = tuple(dict.fromkeys(filters.meeting_ids))
    speaker_ids = tuple(dict.fromkeys(filters.speaker_ids))
    kept_meetings: tuple[str, ...] = ()
    kept_speakers: tuple[str, ...] = ()
    if meeting_ids:
        known = await store.known_meeting_ids(team_id, meeting_ids, scope)
        kept_meetings = tuple(m for m in meeting_ids if m in known)
    if speaker_ids:
        known_u = await store.known_user_ids(team_id, speaker_ids)
        kept_speakers = tuple(u for u in speaker_ids if u in known_u)
    return ValidatedFilters(
        meeting_ids=kept_meetings, speaker_ids=kept_speakers,
        date_from=filters.date_from, date_to=filters.date_to,
        dropped_meeting_ids=len(meeting_ids) - len(kept_meetings),
        dropped_speaker_ids=len(speaker_ids) - len(kept_speakers),
    )


def requested_but_empty(requested: Sequence[str], kept: Sequence[str]) -> bool:
    """True when the user asked for specific ids and none survived validation."""
    return bool(requested) and not kept
