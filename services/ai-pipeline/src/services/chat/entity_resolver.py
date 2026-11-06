"""
services/chat/entity_resolver.py
────────────────────────────────
Resolve person mentions ("Ahmed", "Sara K.") against the TEAM ROSTER.

Ambiguity is a first-class result: when "Ahmed" matches two people, BOTH candidate ids are kept and the
answer must say so — silently picking one would put the wrong person's commitments in front of the user.
Matching is local and deterministic (no model): exact full name → exact token → fuzzy token (difflib).
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Sequence

from src.services.chat.data_store import RosterEntry

_FUZZY_MIN = 0.80
_NON_WORD = re.compile(r"[^\w\s]", re.UNICODE)


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", s).casefold()
    return " ".join(_NON_WORD.sub(" ", s).split())


@dataclass(frozen=True)
class MentionResolution:
    mention: str
    user_ids: tuple[str, ...] = ()
    names: tuple[str, ...] = ()
    method: str = "none"          # exact | token | fuzzy | none

    @property
    def resolved(self) -> bool:
        return bool(self.user_ids)

    @property
    def ambiguous(self) -> bool:
        return len(self.user_ids) > 1


@dataclass
class ResolvedMentions:
    items: list[MentionResolution] = field(default_factory=list)

    @property
    def user_ids(self) -> list[str]:
        return list(dict.fromkeys(uid for r in self.items for uid in r.user_ids))

    @property
    def ambiguous(self) -> list[MentionResolution]:
        return [r for r in self.items if r.ambiguous]

    @property
    def unresolved(self) -> list[str]:
        return [r.mention for r in self.items if not r.resolved]

    def canonical_names(self) -> list[str]:
        return list(dict.fromkeys(n for r in self.items for n in r.names))

    def note(self) -> str:
        """A short, factual note for the prompt (escaped by the caller)."""
        parts = []
        for r in self.ambiguous:
            parts.append(f"The name '{r.mention}' is ambiguous: could be " + ", ".join(r.names) + ".")
        for m in self.unresolved:
            parts.append(f"No team member matched the name '{m}'.")
        return " ".join(parts)


def resolve_mentions(mentions: Sequence[str], roster: Sequence[RosterEntry]) -> ResolvedMentions:
    index = [(r, _norm(r.name), _norm(r.name).split()) for r in roster if r.name]
    out = ResolvedMentions()
    for raw in dict.fromkeys(m.strip() for m in mentions if m and m.strip()):
        key = _norm(raw)
        if not key:
            continue
        exact = [r for r, full, _ in index if full == key]
        if exact:
            out.items.append(_res(raw, exact, "exact"))
            continue
        toks = key.split()
        by_token = [r for r, _, parts in index if all(t in parts for t in toks)]
        if by_token:
            out.items.append(_res(raw, by_token, "token"))
            continue
        scored = []
        for r, full, parts in index:
            best = max([SequenceMatcher(None, key, full).ratio()] + [SequenceMatcher(None, key, p).ratio() for p in parts])
            if best >= _FUZZY_MIN:
                scored.append((best, r))
        if scored:
            top = max(s for s, _ in scored)
            out.items.append(_res(raw, [r for s, r in scored if s >= top - 0.02], "fuzzy"))
            continue
        out.items.append(MentionResolution(mention=raw))
    return out


def _res(raw: str, entries: Sequence[RosterEntry], method: str) -> MentionResolution:
    uniq = list({e.user_id: e for e in entries}.values())
    return MentionResolution(raw, tuple(e.user_id for e in uniq), tuple(e.name for e in uniq), method)
