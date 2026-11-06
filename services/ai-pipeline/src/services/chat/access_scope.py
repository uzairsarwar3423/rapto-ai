"""
services/chat/access_scope.py
─────────────────────────────
Q1 — within-team visibility. Tenant RLS stops cross-TEAM reads; it does not stop a teammate from asking
about a 1:1 they were not in. This module turns the product decision into the Day 57 `AccessScope`
(SQL-layer meeting-id restriction), threaded through retrieval, analytics, hydration, history reads and
suggestions:

  team_wide      → AccessScope(kind="team")                       (today's behaviour)
  attendee_only  → AccessScope(kind="meetings", meeting_ids=[…])  (meetings the caller attended)

Post-filtering in the application is REJECTED: it under-fills result lists and is a weaker control.
GA is blocked until Q1 is decided (see docs/chat/privacy_decisions.md). The attendee set is capped by
AccessScope (5,000); beyond that the migration-005 `meeting_id` column + access-view join is the scale path.
"""

from __future__ import annotations

import structlog

from src.config.chat_config import ChatSettings
from src.models.rag_models import AccessScope
from src.rag.metrics import metrics
from src.services.chat.data_store import ChatDataStore

log = structlog.get_logger(__name__)
MAX_SCOPE_MEETINGS = 5_000


async def resolve_access_scope(store: ChatDataStore, settings: ChatSettings, team_id: str, user_id: str) -> AccessScope:
    if settings.chat_access_scope_mode == "team_wide":
        return AccessScope()
    ids = await store.attended_meeting_ids(team_id, user_id, MAX_SCOPE_MEETINGS)
    if len(ids) >= MAX_SCOPE_MEETINGS:
        metrics.inc("chat_access_scope_truncated_total")
        log.warning("chat_access_scope_truncated", limit=MAX_SCOPE_MEETINGS)
    return AccessScope(kind="meetings", meeting_ids=list(dict.fromkeys(ids))[:MAX_SCOPE_MEETINGS])
