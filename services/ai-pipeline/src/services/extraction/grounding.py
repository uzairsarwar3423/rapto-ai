"""
services/extraction/grounding.py
────────────────────────────────
Evidence grounding for extracted commitments, action items and decisions.

Each extractor is asked for `evidence_quote`: the exact transcript words the
item is based on. Nothing the model says about its own evidence is trusted —
this module checks the quote against the transcript the model was actually
given, and records what it finds:

  • evidence_verified      the quote occurs in the transcript (tolerant of the
                           small wording drift that transcript cleanup and
                           ASR introduce, but not of paraphrase)
  • evidence_speaker /     speaker and start time of the transcript turn the
    evidence_start_time    quote came from — so every item is traceable to a
                           moment in the meeting even though the LLM context
                           carries no timestamps

and applies the consequences:

  • unverifiable evidence  → confidence × UNVERIFIED_EVIDENCE_PENALTY. Lower
                             confidence feeds the existing confidence gate
                             (re-extraction with the stronger model) and the
                             existing confidence floor.
  • commitment whose quote was spoken by someone other than its owner
                           → confidence 0, i.e. dropped. A commitment is a
                             first-person promise; a request nobody accepted
                             ("Tom, please send…" with no reply) stays an
                             action item and must not become Tom's promise.
  • action-item assignee who is neither a participant nor anyone named or
    speaking in the transcript → assignee cleared (unassigned), never invented

Pure functions, no I/O, no model calls.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, Optional, Sequence

# Applied once per item; values chosen so a high-confidence (0.9) item without
# verifiable evidence lands below the confidence-gate threshold (0.60) and is
# re-checked by the fallback model, while a weak one (≤0.5) drops under the
# CONFIDENCE_FLOOR (0.3) and is discarded.
UNVERIFIED_EVIDENCE_PENALTY = 0.6
# Eval (ownership_01): a ×0.7 penalty left unaccepted requests as commitments, and the
# deduplicator then removed the correct action item as their duplicate.
MISATTRIBUTED_OWNER_PENALTY = 0.0

# Share of the quote's word bigrams that must appear in one transcript turn
# (or across two adjacent turns) for the quote to count as verbatim.
_MIN_BIGRAM_COVERAGE = 0.6

_TOKEN_RE = re.compile(r"[^\w']+", re.UNICODE)


@dataclass(frozen=True)
class GroundingTurn:
    speaker: str
    text: str
    start_time: Optional[float] = None


@dataclass(frozen=True)
class EvidenceMatch:
    verified: bool
    speaker: Optional[str] = None
    start_time: Optional[float] = None


def _tokens(text: str) -> list[str]:
    return [t for t in _TOKEN_RE.split(text.lower()) if t]


def _bigrams(tokens: Sequence[str]) -> set[tuple[str, ...]]:
    if len(tokens) < 2:
        return {tuple(tokens)} if tokens else set()
    return {(tokens[i], tokens[i + 1]) for i in range(len(tokens) - 1)}


class TranscriptIndex:
    """Pre-tokenized transcript turns for repeated evidence lookups."""

    def __init__(self, turns: Iterable[GroundingTurn]):
        self.turns = list(turns)
        self._tokens = [_tokens(t.text) for t in self.turns]
        self._bigrams = [_bigrams(toks) for toks in self._tokens]
        self._joined = [" ".join(toks) for toks in self._tokens]
        names: set[str] = set()
        for t in self.turns:
            names.update(_tokens(t.speaker))
        self._speaker_tokens = names
        self._all_tokens = {tok for toks in self._tokens for tok in toks}

    def find(self, quote: Optional[str]) -> EvidenceMatch:
        """Locate `quote` in the transcript; unverified if absent or too short to check."""
        q_tokens = _tokens(quote or "")
        if not q_tokens:
            return EvidenceMatch(verified=False)
        q_joined = " ".join(q_tokens)
        q_bigrams = _bigrams(q_tokens)

        best_idx, best_cov = -1, 0.0
        for i, joined in enumerate(self._joined):
            if q_joined in joined:
                return self._match(i)
            cov = len(q_bigrams & self._bigrams[i]) / len(q_bigrams)
            # A quote may span the boundary between two consecutive turns.
            if i + 1 < len(self._bigrams):
                pair = self._bigrams[i] | self._bigrams[i + 1] | _bigrams(
                    self._tokens[i][-1:] + self._tokens[i + 1][:1]
                )
                cov = max(cov, len(q_bigrams & pair) / len(q_bigrams))
            if cov > best_cov:
                best_idx, best_cov = i, cov

        # Single-word quotes can't be told apart from coincidence — only an exact hit counts.
        if len(q_tokens) >= 2 and best_cov >= _MIN_BIGRAM_COVERAGE:
            return self._match(best_idx)
        return EvidenceMatch(verified=False)

    def _match(self, idx: int) -> EvidenceMatch:
        turn = self.turns[idx]
        return EvidenceMatch(verified=True, speaker=turn.speaker, start_time=turn.start_time)

    def mentions_person(self, name: Optional[str]) -> bool:
        """True if any part of `name` is a speaker or is spoken in the transcript."""
        tokens = [t for t in _tokens(name or "") if len(t) > 1]
        return any(t in self._speaker_tokens or t in self._all_tokens for t in tokens)


def names_match(a: Optional[str], b: Optional[str]) -> bool:
    """Same person? Case-insensitive; a first name matches the full name ("Ahmed" ~ "Ahmed Hassan")."""
    ta, tb = _tokens(a or ""), _tokens(b or "")
    if not ta or not tb:
        return False
    if ta == tb:
        return True
    short, long_ = (ta, tb) if len(ta) <= len(tb) else (tb, ta)
    return long_[: len(short)] == short


def ground_item(
    item,
    index: TranscriptIndex,
    *,
    owner_field: Optional[str] = None,
    owner_must_be_speaker: bool = False,
    participant_names: Sequence[str] = (),
    clear_unknown_owner: bool = False,
):
    """Return a copy of `item` with grounding fields set and confidence adjusted.

    owner_field            attribute holding the person (owner_name / assignee_name)
    owner_must_be_speaker  commitments: the quote must be the owner's own words
    clear_unknown_owner    action items: drop an owner nobody mentioned (→ unassigned)
    """
    match = index.find(getattr(item, "evidence_quote", None))
    confidence = float(item.confidence)
    updates: dict = {
        "evidence_verified": match.verified,
        "evidence_speaker": match.speaker,
        "evidence_start_time": match.start_time,
    }

    if not match.verified:
        confidence *= UNVERIFIED_EVIDENCE_PENALTY

    if owner_field:
        owner = getattr(item, owner_field, None)
        if owner_must_be_speaker and match.verified and owner and not names_match(owner, match.speaker):
            confidence *= MISATTRIBUTED_OWNER_PENALTY
        if clear_unknown_owner and owner:
            known = any(names_match(owner, p) for p in participant_names) or index.mentions_person(owner)
            if not known:
                updates[owner_field] = None

    updates["confidence"] = round(confidence, 4)
    return item.model_copy(update=updates)
