"""
services/chat/runtime.py
────────────────────────
Wires the chat backend at process start (opt-in, like RAG): builds the Day 57 Retriever on top of the RAG runtime,
the Mongo repositories (+ idempotent indexes), Redis-backed quota/leases/limits, the streaming model client and the
JWT verifier; starts the ledger flusher and the retention janitor; and tears them down in order.

REFUSES TO START (rather than silently serving 401s or running without idempotency) when chat is enabled but
    * RAG is not running (retrieval needs it), or
    * INTERNAL_JWT_PUBLIC_KEYS is empty (nobody could authenticate), or
    * the Mongo indexes cannot be ensured (the idempotency guarantee depends on the unique index).
"""

from __future__ import annotations

import asyncio
import contextlib
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

import structlog

from src.api.internal_auth import InternalJWTVerifier
from src.config.chat_config import ChatSettings
from src.config.settings import Settings
from src.rag.reranker import LLMReranker
from src.rag.retriever import Retriever
from src.rag.source_context import SourceContextResolver
from src.repositories.chat_repository import ChatRepository, CursorCodec, SystemMaintenance, ensure_indexes
from src.services.chat.chat_orchestrator import ChatDeps, ChatService
from src.services.chat.conversation_memory import ConversationMemory
from src.services.chat.intent_router import IntentRouter
from src.services.chat.llm import OpenAIChatStreamer, ProviderBreaker
from src.services.chat.pg_chat_store import PgChatStore
from src.services.chat.query_rewriter import QueryRewriter
from src.services.chat.quota_service import LedgerOutbox, QuotaService
from src.services.chat.rate_limiter import RateLimiter
from src.services.chat.stream_leases import StreamLeaseManager
from src.services.chat.suggestions import SuggestionService

log = structlog.get_logger(__name__)

LEDGER_FLUSH_INTERVAL_S = 5.0
MAINTENANCE_INTERVAL_S = 6 * 3600.0


@dataclass
class ChatRuntime:
    service: ChatService
    verifier: InternalJWTVerifier
    suggestions: SuggestionService
    store: PgChatStore
    settings: ChatSettings
    repo_factory: Any
    outbox: LedgerOutbox
    memory: ConversationMemory
    mongo_db: Any
    stop: asyncio.Event = field(default_factory=asyncio.Event)
    tasks: list[asyncio.Task[None]] = field(default_factory=list)


async def start_chat_runtime(app_settings: Settings, chat: ChatSettings, *, rag: Any, redis: Any, mongo: Any,
                             ai_client: Any) -> Optional[ChatRuntime]:
    if not (chat.chat_enabled or chat.enabled_team_ids):
        log.info("chat_disabled")
        return None
    if rag is None:
        raise RuntimeError("CHAT_ENABLED requires RAG_ENABLED=true (retrieval and the analytics views need the RAG database)")
    if not chat.jwt_key_set():
        raise RuntimeError("CHAT_ENABLED requires INTERNAL_JWT_PUBLIC_KEYS (a JSON map of kid → PEM public key)")

    verifier = InternalJWTVerifier(chat)
    db = mongo.db.client[chat.chat_mongo_database]
    await ensure_indexes(db)                                    # raises → the service refuses to start

    secret = chat.chat_cursor_secret.get_secret_value() or app_settings.api_shared_secret.get_secret_value()
    cursors = CursorCodec(secret)
    lease_s = chat.chat_total_timeout_s + 30.0

    def repo_factory(team_id: str, user_id: str) -> ChatRepository:
        return ChatRepository(db, team_id, user_id, cursors=cursors, title_max_chars=chat.chat_title_max_chars, lease_s=lease_s)

    store = PgChatStore(rag.db)
    redis_client = redis.client
    streamer = OpenAIChatStreamer(app_settings, chat)
    reranker = LLMReranker(ai_client, rag.settings)
    retriever = Retriever(rag.db, rag.query_embedder, reranker, SourceContextResolver(rag.db, rag.settings), rag.settings)
    outbox = LedgerOutbox(redis_client, store)
    memory = ConversationMemory(ai_client, chat)
    deps = ChatDeps(
        settings=chat, repo_factory=repo_factory, quota=QuotaService(redis_client, chat), outbox=outbox,
        leases=StreamLeaseManager(redis_client, chat), limiter=RateLimiter(redis_client, per_min=chat.chat_rate_limit_per_min,
                                                                            team_per_min=chat.chat_team_rate_limit_per_min),
        breaker=ProviderBreaker(chat), store=store, retriever=retriever, streamer=streamer,
        rewriter=QueryRewriter(ai_client, chat), router=IntentRouter(ai_client, chat), memory=memory,
        answer_model=streamer.model_name)
    runtime = ChatRuntime(service=ChatService(deps), verifier=verifier, suggestions=SuggestionService(redis_client, store, chat),
                          store=store, settings=chat, repo_factory=repo_factory, outbox=outbox, memory=memory, mongo_db=db)
    runtime.tasks.append(asyncio.create_task(_ledger_flusher(runtime), name="chat-ledger-flusher"))
    runtime.tasks.append(asyncio.create_task(_maintenance(runtime), name="chat-maintenance"))
    log.info("chat_runtime_started", global_streams=chat.chat_global_max_streams, access_scope=chat.chat_access_scope_mode,
             jwt_kids=verifier.key_ids)
    return runtime


async def _ledger_flusher(rt: ChatRuntime) -> None:
    while not rt.stop.is_set():
        try:
            while await rt.outbox.flush():
                pass
        except Exception as exc:  # noqa: BLE001
            log.error("chat_ledger_flush_loop_error", error_type=type(exc).__name__)
        with contextlib.suppress(asyncio.TimeoutError):
            await asyncio.wait_for(rt.stop.wait(), timeout=LEDGER_FLUSH_INTERVAL_S)


async def _maintenance(rt: ChatRuntime) -> None:
    sysm = SystemMaintenance(rt.mongo_db)
    while not rt.stop.is_set():
        with contextlib.suppress(asyncio.TimeoutError):
            await asyncio.wait_for(rt.stop.wait(), timeout=MAINTENANCE_INTERVAL_S)
        if rt.stop.is_set():
            return
        try:
            out = await sysm.purge(retention_days=rt.settings.chat_session_retention_days,
                                   empty_ttl_hours=rt.settings.chat_empty_session_ttl_hours, now=datetime.now(timezone.utc))
            log.info("chat_retention_purge", **out)
        except Exception as exc:  # noqa: BLE001
            log.error("chat_retention_purge_failed", error_type=type(exc).__name__)


async def stop_chat_runtime(rt: Optional[ChatRuntime]) -> None:
    if rt is None:
        return
    rt.stop.set()
    await rt.memory.drain()
    for t in rt.tasks:
        t.cancel()
    await asyncio.gather(*rt.tasks, return_exceptions=True)
    for _ in range(20):                                          # final drain so a clean shutdown loses no ledger rows
        try:
            if not await rt.outbox.flush():
                break
        except Exception:  # noqa: BLE001
            break
    log.info("chat_runtime_stopped")
