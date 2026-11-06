"""
services/chat/grounding_guard.py
────────────────────────────────
Two jobs:

1. RELEVANCE GATE (before generation). Decides whether there is anything worth answering from. A failure produces
   the deterministic "nothing found" reply with ZERO generation-model calls. Order of checks (spec §2 #19 — the
   original `top score >= 0.35` was a magic number on an unspecified scale):
        analytics source present                         → pass (a count of 0 is still an answer)
        Day 57 `no_relevant_context`                     → fail
        re-rank GRADED: best grade >= threshold          → pass   (SUMMARY uses a looser threshold)
        re-rank DEGRADED: raw cosine fallback threshold, or a hit found by BOTH legs → pass
   The cosine fallback threshold lives in config and is calibrated from the Day 57 unanswerable slice (Day 60).

2. FINAL VALIDATION (after the stream). Defense in depth behind the streaming scrubber, plus heuristics that FLAG
   (never block): substantive sentences with no citation, numbers/dates absent from every cited source. The
   faithfulness judge runs offline on Day 60; these flags are the cheap online signal and the metrics source.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional, Sequence

from src.config.chat_config import ChatSettings
from src.models.chat_models import Intent
from src.models.rag_models import RetrievalPipelineResult
from src.rag.metrics import metrics
from src.services.chat.context_builder import IncludedSource

# ─── relevance gate ───────────────────────────────────────────────────────────


@dataclass(frozen=True)
class GateDecision:
    passed: bool
    reason: str


def relevance_gate(*, intent: Intent, analytics_present: bool, retrieval: Optional[RetrievalPipelineResult],
                   usable_rag_sources: int, settings: ChatSettings) -> GateDecision:
    if analytics_present:
        return GateDecision(True, "analytics")
    if retrieval is None:
        return GateDecision(False, "no_retrieval")
    if retrieval.no_relevant_context:
        return GateDecision(False, "no_relevant_context")
    if usable_rag_sources <= 0:
        return GateDecision(False, "all_sources_dropped")           # e.g. every commitment was deleted since embedding
    reranked = retrieval.reranked
    graded = [c.rerank_grade for c in reranked if c.rerank_grade is not None]
    if graded:
        need = settings.chat_min_grade_summary if intent is Intent.SUMMARY else settings.chat_min_grade_lookup
        return GateDecision(max(graded) >= need, f"grade>={need}" if max(graded) >= need else "grade_below_threshold")
    # Re-rank degraded/skipped: only raw evidence is left.
    if any(c.retrieval_legs == "both" for c in reranked):
        return GateDecision(True, "both_legs")
    best = max((c.cosine_similarity for c in reranked), default=0.0)
    ok = best >= settings.chat_min_cosine_fallback
    return GateDecision(ok, "cosine_fallback" if ok else "cosine_below_threshold")


# ─── final validation ─────────────────────────────────────────────────────────

_MARKER = re.compile(r"\[S(\d+)\]")
_ANY_MARKERISH = re.compile(r"[\[(]\s*S\s*\d+[^\])]*[\])]", re.IGNORECASE)
_UNSAFE = re.compile(r"!\[[^\]]*\]\(|\]\(\s*[a-z]+:|\bhttps?://|\bwww\.|<\s*[/!?]?[A-Za-z]", re.IGNORECASE)
_REFUSAL = re.compile(
    r"\b(couldn'?t find|could not find|can'?t find|no (?:information|record|mention|details?)|don'?t have|do not have|"
    r"not mentioned|isn'?t mentioned|unable to|doesn'?t (?:mention|say|contain)|nothing (?:about|in)|can'?t share|"
    r"cannot share|only help with|i'?m not sure)\b", re.IGNORECASE)
_SENTENCE = re.compile(r"[^.!?\n]+[.!?]?")
_NUMBER = re.compile(r"(?<![\w.])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?:%|\b)")
_ISO_DATE = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")
_MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october",
           "november", "december"]


@dataclass
class GroundingReport:
    valid: list[str] = field(default_factory=list)
    removed: list[str] = field(default_factory=list)
    grounded: bool = True
    flags: list[str] = field(default_factory=list)


def _norm_numbers(text: str) -> set[str]:
    out: set[str] = set()
    for m in _NUMBER.finditer(text):
        out.add(m.group(1).replace(",", "").lstrip("0") or "0")
    for m in _ISO_DATE.finditer(text):                    # "2026-11-03" also supports "3 November" / "November 3"
        y, mo, d = m.groups()
        out.update({str(int(y)), str(int(mo)), str(int(d))})
        out.add(_MONTHS[int(mo) - 1] if 1 <= int(mo) <= 12 else "")
    return out


def _month_names(text: str) -> set[str]:
    low = text.lower()
    return {m for m in _MONTHS if m in low}


def validate_final(text: str, included: Sequence[IncludedSource], *, scrub_removed: Sequence[str] = ()) -> GroundingReport:
    valid_ids = {s.source_id for s in included}
    rep = GroundingReport(removed=list(dict.fromkeys(scrub_removed)))
    used = []
    for m in _MARKER.finditer(text):
        sid = f"S{m.group(1)}"
        if sid in valid_ids:
            if sid not in used:
                used.append(sid)
        else:
            rep.removed.append(sid)                      # should be impossible after the scrubber: alarm
            rep.flags.append("invalid_marker_after_scrub")
            metrics.inc("chat_invalid_marker_after_scrub_total")
    rep.valid = used
    leftovers = _ANY_MARKERISH.findall(text)
    if any(not _MARKER.fullmatch(x) for x in leftovers):
        rep.flags.append("malformed_marker_after_scrub")
    if _UNSAFE.search(text):
        rep.flags.append("unsafe_markup_after_scrub")    # the scrubber missed something: page-worthy
        metrics.inc("chat_unsafe_markup_after_scrub_total")

    # heuristics (flag, never block) ------------------------------------------------------------
    body = _MARKER.sub("", text).strip()
    if body and not _REFUSAL.search(body):
        uncited = 0
        for sent in _SENTENCE.findall(text):
            s = sent.strip()
            words = re.findall(r"\w+", _MARKER.sub("", s))
            if len(words) >= 8 and not s.endswith("?") and not _MARKER.search(s) and not s.endswith(":"):
                uncited += 1
        if uncited and not used:
            rep.flags.append("no_citations")
            rep.grounded = False
        elif uncited:
            rep.flags.append("uncited_sentences")
        cited = [s for s in included if s.source_id in used] or list(included)
        support = " ".join(s.grounding_text for s in cited)
        known_numbers = _norm_numbers(support) | _month_names(support)
        unsupported = [n for n in _norm_numbers(body) if n and n not in known_numbers and not (len(n) <= 1)]
        if unsupported:
            rep.flags.append("unsupported_numbers")
            rep.grounded = False
    if not rep.grounded:
        metrics.inc("chat_ungrounded_total")
    metrics.inc("chat_citations_removed_total", len(rep.removed)) if rep.removed else None
    return rep
