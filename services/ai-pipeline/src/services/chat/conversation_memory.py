"""
services/chat/conversation_memory.py
────────────────────────────────────
Bounded conversation memory.

WINDOW   the last CHAT_HISTORY_TURNS turns verbatim AFTER the summary watermark, hard-capped by the estimator at
         CHAT_HISTORY_MAX_TOKENS (the context builder re-checks), citation markers stripped, prior sources NEVER carried
         over (each turn re-retrieves; turn 8's "S2" is not turn 3's "S2").

SUMMARY  when the unsummarized window overflows, older turns are folded into `session.summary` by the cheap tier —
         ASYNCHRONOUSLY after the response completed, never on the hot path. The prompt is restricted to user INTENTS and
         CONCLUSIONS (no raw source text), its output is passed through the streaming scrubber's rules (no URLs/HTML) and
         is delimited as DATA when used (stored-injection defense). Its cost is booked to the ledger as a SYSTEM cost.

WATERMARK `summary_upto_msg_id` + compare-and-set means two summarizers can never interleave or produce gaps/duplicates;
         if the next request arrives before a summary finishes, the window simply still contains the unsummarized turns.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any, Optional

import structlog
from pydantic import BaseModel

from src.config.chat_config import ChatSettings
from src.models.common import TaskType
from src.rag.metrics import metrics
from src.repositories.chat_repository import ChatRepository
from src.services.ai_client_protocol import AIClientProtocol
from src.services.chat.cost_accumulator import CostAccumulator
from src.services.chat.prompt_text import block, new_nonce, strip_citation_markers
from src.services.chat.stream_sanitizer import StreamScrubber
from src.services.chat.token_estimator import estimate_tokens, truncate_to_tokens
from src.services.extraction.prompt_router import load_prompt

log = structlog.get_logger(__name__)

SUMMARY_SLACK_TURNS = 2           # fold only once we are this many turns past the window (avoids summarizing every turn)
MAX_FOLD_MESSAGES = 60


class SummaryOutput(BaseModel):
    summary: str


@dataclass
class MemoryWindow:
    summary: str = ""
    turns: list[dict[str, str]] = field(default_factory=list)       # chronological [{role, content}]
    upto: Optional[str] = None


class ConversationMemory:
    def __init__(self, ai_client: Optional[AIClientProtocol], settings: ChatSettings) -> None:
        self._ai = ai_client
        self._cfg = settings
        self._prompt = load_prompt("chat_memory_summary.txt")
        self._tasks: set[asyncio.Task[None]] = set()

    @property
    def prompt_version(self) -> str:
        return self._prompt.version

    async def window(self, repo: ChatRepository, session: dict[str, Any], *, exclude_id: Optional[str]) -> MemoryWindow:
        if self._cfg.chat_history_turns == 0:
            return MemoryWindow(summary=session.get("summary") or "", upto=session.get("summary_upto_msg_id"))
        rows = await repo.recent_turns(session["_id"], limit=self._cfg.chat_history_turns * 2, exclude_id=exclude_id,
                                       after_id=session.get("summary_upto_msg_id"))
        turns = [{"role": r["role"], "content": strip_citation_markers(r.get("content") or "")} for r in rows]
        # hard cap by tokens: drop the OLDEST until the window fits
        while turns and sum(estimate_tokens(t["content"]) + 4 for t in turns) > self._cfg.chat_history_max_tokens:
            turns.pop(0)
        return MemoryWindow(summary=session.get("summary") or "", turns=turns, upto=session.get("summary_upto_msg_id"))

    def schedule_summary(self, repo: ChatRepository, session_id: str, cost_sink: Any) -> None:
        """Fire-and-forget after the response is complete. `cost_sink(CostAccumulator)` books the system cost."""
        if self._ai is None:
            return
        task = asyncio.create_task(self._summarize_safely(repo, session_id, cost_sink), name="chat-summarize")
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def drain(self) -> None:
        """Test/shutdown hook: wait for in-flight summaries."""
        if self._tasks:
            await asyncio.gather(*list(self._tasks), return_exceptions=True)

    async def _summarize_safely(self, repo: ChatRepository, session_id: str, cost_sink: Any) -> None:
        try:
            await asyncio.wait_for(self.summarize_if_needed(repo, session_id, cost_sink), timeout=10.0)
        except Exception as exc:  # noqa: BLE001 — a skipped summary only means a longer window next turn
            metrics.inc("chat_summary_failed_total", error=type(exc).__name__)

    async def summarize_if_needed(self, repo: ChatRepository, session_id: str, cost_sink: Any) -> bool:
        try:
            session = await repo.get_session(session_id)
        except Exception:  # noqa: BLE001 — deleted meanwhile
            return False
        upto = session.get("summary_upto_msg_id")
        pending = await repo.count_unsummarized(session_id, upto)
        keep = self._cfg.chat_history_turns * 2
        if pending <= keep + SUMMARY_SLACK_TURNS * 2:
            return False
        rows = await repo.recent_turns(session_id, limit=min(pending, MAX_FOLD_MESSAGES), after_id=upto)
        fold = rows[: max(0, len(rows) - keep)]
        if not fold:
            return False
        nonce = new_nonce()
        turns = "\n".join(f"{r['role']}: {strip_citation_markers(r.get('content') or '')[:800]}" for r in fold)
        user = block("summary", nonce, session.get("summary") or "(empty)") + "\n" + block("history", nonce, turns)
        cost = CostAccumulator()
        res = await self._ai.generate_structured(TaskType.CHAT_MEMORY, self._prompt.body, user, SummaryOutput)  # type: ignore[union-attr]
        cost.add_record("memory", res.cost)
        scrub = StreamScrubber(set(), "")                         # no valid markers, no canary: strips URLs/HTML/markers
        text = scrub.feed(res.data.summary) + scrub.finish()
        text = truncate_to_tokens(strip_citation_markers(text), self._cfg.chat_summary_max_tokens).strip()
        if not text:
            metrics.inc("chat_summary_rejected_total", reason="empty")
            return False
        ok = await repo.set_summary_if_watermark(session_id, expected_upto=upto, summary=text, new_upto=fold[-1]["_id"])
        metrics.inc("chat_summary_total", result="applied" if ok else "lost_race")
        if cost_sink is not None:
            await cost_sink(cost)
        return ok
