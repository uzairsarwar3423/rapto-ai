"""
services/chat/commitment_hydrator.py
────────────────────────────────────
ADR-5: anything that changes WITHOUT the description changing (status, owner, due date) is fetched from
Postgres at query time. A status change does not re-embed, so reading it from embedded text/metadata would
make the assistant confidently report yesterday's status.

One batched query per kind (commitments, action items) for every such source. Deleted/inaccessible rows are
DROPPED (they would cite something that no longer exists). On failure the source stays, but its volatile
fields are marked "status unavailable" so the model cannot assert one.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Sequence

import structlog

from src.models.rag_models import AccessScope, EmbeddingSource, ScoredChunk
from src.rag.metrics import metrics
from src.services.chat.data_store import ChatDataStore, CommitmentFacts

log = structlog.get_logger(__name__)

HYDRATED = (EmbeddingSource.COMMITMENT, EmbeddingSource.ACTION_ITEM)


@dataclass
class Hydration:
    facts: dict[tuple[str, str], CommitmentFacts] = field(default_factory=dict)
    dropped: set[tuple[str, str]] = field(default_factory=set)
    failed: bool = False

    def facts_for(self, chunk: ScoredChunk) -> CommitmentFacts | None:
        return self.facts.get((chunk.chunk.source_type.value, chunk.chunk.source_id))


async def hydrate(store: ChatDataStore, team_id: str, scope: AccessScope, chunks: Sequence[ScoredChunk],
                  *, timeout_s: float) -> Hydration:
    out = Hydration()
    commitment_ids = sorted({c.chunk.source_id for c in chunks if c.chunk.source_type is EmbeddingSource.COMMITMENT})
    action_ids = sorted({c.chunk.source_id for c in chunks if c.chunk.source_type is EmbeddingSource.ACTION_ITEM})
    if not commitment_ids and not action_ids:
        return out
    try:
        async def fetch() -> tuple[dict[str, CommitmentFacts], dict[str, CommitmentFacts]]:
            c = await store.commitments_by_ids(team_id, commitment_ids, scope) if commitment_ids else {}
            a = await store.action_items_by_ids(team_id, action_ids, scope) if action_ids else {}
            return c, a

        commitments, actions = await asyncio.wait_for(fetch(), timeout=timeout_s)
    except Exception as exc:  # noqa: BLE001 — degrade: omit volatile fields, never fail the answer
        out.failed = True
        metrics.inc("chat_hydrate_failed_total", error=type(exc).__name__)
        log.warning("chat_hydrate_failed", error_type=type(exc).__name__)
        return out
    for cid in commitment_ids:
        key = (EmbeddingSource.COMMITMENT.value, cid)
        if cid in commitments:
            out.facts[key] = commitments[cid]
        else:
            out.dropped.add(key)
    for aid in action_ids:
        key = (EmbeddingSource.ACTION_ITEM.value, aid)
        if aid in actions:
            out.facts[key] = actions[aid]
        else:
            out.dropped.add(key)
    if out.dropped:
        metrics.inc("chat_hydrate_dropped_total", len(out.dropped))
    return out
