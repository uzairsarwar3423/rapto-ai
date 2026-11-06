"""
services/chat/suggestions.py
────────────────────────────
Deterministic, data-aware conversation starters (no model call): only questions the user's own accessible data can
answer, 4–6 items, cached per (team, user, scope) for ~10 minutes. Titles come from the database, so they are
sanitized (control/bidi stripped, length-capped, quotes neutralized) and the UI escapes them again.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Optional

from src.config.chat_config import ChatSettings
from src.models.rag_models import AccessScope
from src.services.chat.data_store import ChatDataStore
from src.services.chat.input_sanitizer import sanitize_text

STATIC_STARTERS = [
    "What were the key decisions in our last meeting?",
    "What commitments are still open?",
    "Which commitments are overdue?",
    "Summarize last week's meetings.",
]
MIN_ITEMS, MAX_ITEMS = 4, 6


def _title(raw: str) -> str:
    t = sanitize_text(raw).replace('"', "'").replace("<", "").replace(">", "")
    return t[:60].rstrip()


async def build_suggestions(store: ChatDataStore, *, team_id: str, tz: str, today: Any, scope: AccessScope) -> list[str]:
    items: list[str] = []
    try:
        overdue = await store.overdue_commitment_count(team_id, today, tz, scope)
        if overdue > 0:
            items.append("Which commitments are overdue?")
        meetings = await store.recent_meetings(team_id, scope, 3)
        for m in meetings[:2]:
            t = _title(m.title)
            if t:
                items.append(f"What was decided in {t}?")
        if meetings:
            items.append("Summarize last week's meetings.")
            items.append("What commitments are still open?")
    except Exception:  # noqa: BLE001 — suggestions are a nicety: fall back to the static set
        items = []
    for s in STATIC_STARTERS:
        if len(items) >= MIN_ITEMS + 1:
            break
        if s not in items:
            items.append(s)
    return list(dict.fromkeys(items))[:MAX_ITEMS]


class SuggestionService:
    def __init__(self, redis: Any, store: ChatDataStore, settings: ChatSettings) -> None:
        self._redis, self._store, self._cfg = redis, store, settings

    @staticmethod
    def _key(team_id: str, user_id: str, scope: AccessScope) -> str:
        sig = hashlib.sha1(json.dumps([scope.kind, sorted(scope.meeting_ids or [])]).encode()).hexdigest()[:12]
        return f"chat:{{{team_id}}}:sugg:{user_id}:{sig}"

    async def get(self, *, team_id: str, user_id: str, tz: str, today: Any, scope: AccessScope) -> list[str]:
        key = self._key(team_id, user_id, scope)
        ttl = self._cfg.chat_suggestions_ttl_s
        if ttl:
            try:
                raw: Optional[bytes] = await self._redis.get(key)
                if raw:
                    return list(json.loads(raw))
            except Exception:  # noqa: BLE001
                pass
        items = await build_suggestions(self._store, team_id=team_id, tz=tz, today=today, scope=scope)
        if ttl:
            try:
                await self._redis.set(key, json.dumps(items), ex=ttl)
            except Exception:  # noqa: BLE001
                pass
        return items
