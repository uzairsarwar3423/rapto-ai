"""
services/chat/intent_router.py
──────────────────────────────
Two-tier intent routing.

TIER 1 — conservative rules (< 5 ms, no model). A rule match counts ONLY if it also resolves to a tool
with extractable, valid parameters (fixes the spec's "how many times did we discuss pricing", which matches
"how many" but cannot be computed by any tool); otherwise it falls through.

TIER 2 — cheap-tier structured classifier, run ONLY when the rules are inconclusive AND there are ambiguity
signals (an analytics-sounding question no tool can answer, or an instruction-style request like "draft a
follow-up to Ahmed…"). Plain questions with no signals go straight to LOOKUP ("default"), so the classifier
does not add a model call to the most common request. Confidence < 0.6 → LOOKUP.

OUT_OF_SCOPE is SOFT: only when confident. In-scope requests phrased as instructions must not be refused.
"""

from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional

import structlog
from pydantic import BaseModel

from src.config.chat_config import ChatSettings
from src.models.chat_models import Intent
from src.models.common import TaskType
from src.rag.metrics import metrics
from src.services.ai_client_protocol import AIClientProtocol
from src.services.chat import date_ranges
from src.services.chat.analytics_tools import can_resolve
from src.services.chat.cost_accumulator import CostAccumulator
from src.services.extraction.prompt_router import load_prompt

log = structlog.get_logger(__name__)

MIN_CLASSIFIER_CONFIDENCE = 0.6
_VALID_SOURCE_TYPES = {"transcript_chunk", "commitment", "action_item", "decision", "summary", "digest"}


@dataclass(frozen=True)
class RetrievalProfile:
    """Per-intent knobs for the Day 57 retriever (candidate count, final top_n, source-type bias)."""
    candidates: int
    top_n: int
    source_types: Optional[tuple[str, ...]] = None
    hard_date_filter: bool = False


PROFILES: dict[Intent, RetrievalProfile] = {
    Intent.LOOKUP: RetrievalProfile(20, 8),
    Intent.SUMMARY: RetrievalProfile(30, 10, ("summary", "digest", "decision", "transcript_chunk")),
    Intent.TEMPORAL: RetrievalProfile(25, 8, None, hard_date_filter=True),
    Intent.COMMITMENT_STATUS: RetrievalProfile(15, 6, ("commitment", "action_item", "decision", "transcript_chunk")),
    Intent.ANALYTICS: RetrievalProfile(10, 5),            # used only for HYBRID analytics + context
    Intent.CHITCHAT: RetrievalProfile(0, 0),
    Intent.OUT_OF_SCOPE: RetrievalProfile(0, 0),
}


@dataclass
class IntentDecision:
    kind: Intent
    source: str                                  # rules | classifier | default
    confidence: float = 1.0
    needs_rag: bool = True
    source_types: Optional[list[str]] = None
    tool: Optional[str] = None
    tool_params: dict[str, Any] = field(default_factory=dict)
    owner_mentions: list[str] = field(default_factory=list)   # to be resolved against the roster
    date_range: Optional[date_ranges.DateRange] = None
    secondary_tool: Optional[str] = None                      # hybrid: e.g. find_commitments with COMMITMENT_STATUS

    @property
    def profile(self) -> RetrievalProfile:
        return PROFILES[self.kind]


# ─── rules ────────────────────────────────────────────────────────────────────

_I = re.IGNORECASE
_COMMIT_NOUN = r"(?:commitments?|promises?|tasks?|action[- ]items?|to-?dos?|deliverables?)"
_MEETING_NOUN = r"(?:meetings?|stand-?ups?|syncs?|calls?)"
_COUNT = re.compile(r"\b(?:how many|number of|count of|total (?:number )?of|count)\b", _I)
_CHITCHAT = re.compile(
    r"^\s*(?:hi|hello|hey|hiya|yo|salam|assalam(?:u|o)?[- ]?(?:alaikum|o alaikum)|thanks|thank you|thx|shukriya|jazak\s?allah|"
    r"ok(?:ay)?|cool|great|nice|bye|goodbye|good (?:morning|afternoon|evening|night))\W*$", _I)
_OOS = re.compile(
    r"^\s*(?:please\s+)?(?:write|compose|generate)\s+(?:me\s+)?(?:a|an|some)\s+(?:poem|song|story|joke|essay|haiku)\b|"
    r"\btell me a joke\b|\bweather (?:in|today|tomorrow)\b|\bstock price\b|\bwho (?:is|was) the (?:president|prime minister)\b|"
    r"\bcapital of\b|\bwrite (?:me )?(?:some )?(?:python|javascript|java|sql|code)\b|\bsolve (?:this|the) equation\b", _I)
_WORKISH = re.compile(r"\b(?:meetings?|stand-?ups?|sync|transcripts?|commitments?|decisions?|action items?|sprint|retro|team|"
                      r"discussed|said|promised|blockers?|risks?|tasks?|deadline|owner)\b", _I)
_INSTRUCTION = re.compile(r"^\s*(?:please\s+)?(?:write|draft|generate|create|compose|translate|explain|help me|can you|could you)\b", _I)
_ANALYTIC_WORDS = re.compile(r"\b(?:how many|average|percentage|percent|rate|ranking|rank|most|least|top|trend|count)\b", _I)
_SUMMARY = re.compile(r"\b(?:summar(?:y|ise|ize|ies)|recap|overview|key (?:points|takeaways)|highlights|tl;?dr|"
                      r"what (?:happened|was discussed|did we discuss) (?:in|at|during))\b", _I)
_STATUS = re.compile(
    r"\b(?:is|are|was|were|has|have|had|did|does|do)\b[^?.!]{0,80}\b(?:done|finished|completed?|delivered|shipped|pending|"
    r"overdue|resolved|fulfilled|late|on track|blocked)\b|\bstatus of\b|\bany update on\b", _I)
_RATE = re.compile(r"\b(?:completion|fulfil+ment|on[- ]time) (?:rate|percentage)\b|\bwhat (?:percent(?:age)?|share|fraction) of\b", _I)
_TOP = re.compile(r"\bwho (?:has|have) (?:the )?(?:most|more)\b|\bwhich (?:person|people|members?|owners?) (?:has|have) the most\b|"
                  rf"\btop owners?\b|\bmost (?:open|pending|overdue|outstanding) {_COMMIT_NOUN}", _I)
_OVERDUE = re.compile(r"\b(?:overdue|past due|late|missed)\b", _I)
_LIST_WORDS = re.compile(r"\b(?:list|show|which|what are|what's|give me|display)\b", _I)
_OWNER_PATTERNS = (
    re.compile(r"\b([A-Z][\w'’\-]+(?:\s+[A-Z][\w'’\-]+)?)['’]s\b"),                                             # Ahmed's commitments
    re.compile(r"\b(?:does|did|has|have|is|was|will)\s+([A-Z][\w\-]+(?:\s+[A-Z][\w\-]+)?)\s+(?:have|got|own|done|finish|ship|complete)"),
    re.compile(r"\b(?:assigned to|owned by|owner is|belonging to|of|for|from)\s+([A-Z][\w\-]+(?:\s+[A-Z][\w\-]+)?)\b"),
)
_NOT_NAMES = {"i", "we", "what", "who", "when", "where", "how", "which", "the", "is", "are", "was", "monday", "tuesday",
              "wednesday", "thursday", "friday", "saturday", "sunday", "january", "february", "march", "april", "may", "june",
              "july", "august", "september", "october", "november", "december", "q1", "q2", "q3", "q4"}


def extract_owner_mentions(text: str) -> list[str]:
    found: list[str] = []
    for pat in _OWNER_PATTERNS:
        for m in pat.finditer(text):
            tokens = m.group(1).split()
            while tokens and tokens[0].lower() in _NOT_NAMES:      # "Is Ahmed's" → "Ahmed"
                tokens.pop(0)
            name = " ".join(tokens)
            if name and name not in found:
                found.append(name)
    return found[:5]


def _status_word(text: str) -> str:
    t = text.lower()
    if _OVERDUE.search(t):
        return "overdue"
    if re.search(r"\b(?:completed?|done|fulfilled|finished|delivered)\b", t):
        return "completed"
    if re.search(r"\b(?:open|pending|outstanding|remaining|active|incomplete)\b", t):
        return "open"
    return "all"


def _dates(rng: Optional[date_ranges.DateRange]) -> dict[str, str]:
    return {"date_from": rng.date_from.isoformat(), "date_to": rng.date_to.isoformat()} if rng else {}


@dataclass
class RuleResult:
    decision: Optional[IntentDecision] = None
    ambiguous: bool = False


def apply_rules(text: str, as_of: datetime) -> RuleResult:
    rng = date_ranges.resolve(text, as_of)
    mentions = extract_owner_mentions(text)
    has_count = bool(_COUNT.search(text))
    work = bool(_WORKISH.search(text))

    if _CHITCHAT.match(text):
        return RuleResult(IntentDecision(Intent.CHITCHAT, "rules", needs_rag=False))
    if _OOS.search(text) and not work:
        return RuleResult(IntentDecision(Intent.OUT_OF_SCOPE, "rules", needs_rag=False))

    # ── analytics: a rule matches ONLY if it resolves to a tool with valid parameters ──
    tool: Optional[tuple[str, dict[str, Any]]] = None
    if _RATE.search(text) and re.search(_COMMIT_NOUN, text, _I):
        tool = ("commitment_completion_rate", _dates(rng))
    elif _TOP.search(text):
        tool = ("top_owners_by_open_commitments", {"limit": 5})
    elif has_count and re.search(_MEETING_NOUN, text, _I) and not re.search(r"\btimes\b", text, _I):
        tool = ("meeting_count", _dates(rng))
    elif has_count and re.search(_COMMIT_NOUN, text, _I) and not re.search(r"\btimes\b", text, _I):
        tool = ("count_commitments", {"status": _status_word(text), **_dates(rng)})
    elif _OVERDUE.search(text) and re.search(_COMMIT_NOUN, text, _I) and _LIST_WORDS.search(text):
        tool = ("list_overdue_commitments", {"limit": 20})
    if tool is not None and can_resolve(*tool):
        return RuleResult(IntentDecision(Intent.ANALYTICS, "rules", needs_rag=False, tool=tool[0], tool_params=tool[1],
                                         owner_mentions=mentions, date_range=rng))
    analytics_unresolved = tool is not None or (bool(_ANALYTIC_WORDS.search(text)) and has_count)

    if _SUMMARY.search(text):
        return RuleResult(IntentDecision(Intent.SUMMARY, "rules", date_range=rng, owner_mentions=mentions))
    if _STATUS.search(text) and (mentions or re.search(_COMMIT_NOUN, text, _I) or work):
        return RuleResult(IntentDecision(Intent.COMMITMENT_STATUS, "rules", owner_mentions=mentions, date_range=rng,
                                         source_types=list(PROFILES[Intent.COMMITMENT_STATUS].source_types or ()),
                                         secondary_tool="find_commitments" if mentions else None))
    if rng is not None:
        return RuleResult(IntentDecision(Intent.TEMPORAL, "rules", date_range=rng, owner_mentions=mentions))

    ambiguous = analytics_unresolved or (bool(_INSTRUCTION.search(text)) and not _CHITCHAT.match(text)) or \
        (bool(_OOS.search(text)) and work)
    return RuleResult(None, ambiguous=ambiguous)


# ─── tier 2 ───────────────────────────────────────────────────────────────────

class IntentOutput(BaseModel):
    kind: str
    confidence: float
    needs_rag: bool
    source_types: list[str]
    tool: str
    params_json: str


class IntentRouter:
    def __init__(self, ai_client: Optional[AIClientProtocol], settings: ChatSettings) -> None:
        self._ai = ai_client
        self._cfg = settings
        self._prompt = load_prompt("chat_intent.txt")

    @property
    def prompt_version(self) -> str:
        return self._prompt.version

    async def route(self, text: str, as_of: datetime, cost: CostAccumulator) -> IntentDecision:
        rules = apply_rules(text, as_of)
        if rules.decision is not None:
            metrics.inc("chat_intent_source", source="rules")
            return rules.decision
        rng = date_ranges.resolve(text, as_of)
        mentions = extract_owner_mentions(text)
        if rules.ambiguous and self._ai is not None:
            classified = await self._classify(text, cost)
            if classified is not None:
                classified.date_range = rng
                classified.owner_mentions = classified.owner_mentions or mentions
                metrics.inc("chat_intent_source", source="classifier")
                return classified
        metrics.inc("chat_intent_source", source="default")
        return IntentDecision(Intent.LOOKUP, "default", confidence=0.5, date_range=rng, owner_mentions=mentions)

    async def _classify(self, text: str, cost: CostAccumulator) -> Optional[IntentDecision]:
        from src.services.chat.prompt_text import escape
        user = f"QUESTION (untrusted data):\n<question>\n{escape(text)}\n</question>"
        try:
            res = await asyncio.wait_for(
                self._ai.generate_structured(TaskType.CHAT_INTENT, self._prompt.body, user, IntentOutput),  # type: ignore[union-attr]
                timeout=self._cfg.chat_intent_timeout_s)
        except Exception as exc:  # noqa: BLE001 — a failed classifier is LOOKUP, never a failure
            metrics.inc("chat_intent_fallback_total", reason=type(exc).__name__)
            return None
        cost.add_record("intent", res.cost)
        out: IntentOutput = res.data
        try:
            kind = Intent(out.kind.strip().upper())
        except ValueError:
            return None
        if out.confidence < MIN_CLASSIFIER_CONFIDENCE:
            metrics.inc("chat_intent_low_confidence_total")
            return None
        source_types = [s for s in out.source_types if s in _VALID_SOURCE_TYPES] or None
        decision = IntentDecision(kind, "classifier", confidence=float(out.confidence), needs_rag=bool(out.needs_rag),
                                  source_types=source_types)
        if kind is Intent.ANALYTICS:
            tool, params = out.tool.strip(), _loads(out.params_json)
            if not tool or not can_resolve(tool, _strip_names(params)):
                return None                                           # no tool can compute it → LOOKUP
            decision.tool, decision.tool_params = tool, _strip_names(params)
            decision.needs_rag = False
            decision.owner_mentions = [str(params["owner_mention"])] if params.get("owner_mention") else []
        if kind in (Intent.CHITCHAT, Intent.OUT_OF_SCOPE):
            decision.needs_rag = False
            if kind is Intent.OUT_OF_SCOPE and out.confidence < 0.8:   # soft: only when confident
                return None
        return decision


def _loads(raw: str) -> dict[str, Any]:
    try:
        v = json.loads(raw or "{}")
        return v if isinstance(v, dict) else {}
    except ValueError:
        return {}


def _strip_names(params: dict[str, Any]) -> dict[str, Any]:
    """Tool parameters never carry names — mentions are resolved to ids later by the entity resolver."""
    return {k: v for k, v in params.items() if k not in {"owner_mention", "owner"} and v not in (None, "")}
