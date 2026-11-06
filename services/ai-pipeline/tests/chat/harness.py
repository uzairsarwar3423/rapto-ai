"""In-process end-to-end harness: real orchestrator, quota (Lua), leases, repository (mongomock), SSE layer — fake models."""

from __future__ import annotations

import asyncio
import json
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

import fakeredis.aioredis
from mongomock_motor import AsyncMongoMockClient

from src.api.sse import SSEStream
from src.models.chat_models import ChatClaims, ChatFilters, ChatRequest
from src.models.common import TaskType
from src.repositories.chat_repository import ChatRepository, CursorCodec, ensure_indexes
from src.services.chat.chat_orchestrator import ChatDeps, ChatService, PreparedRun
from src.services.chat.conversation_memory import ConversationMemory
from src.services.chat.intent_router import IntentRouter
from src.services.chat.llm import ProviderBreaker
from src.services.chat.quota_service import LedgerOutbox, QuotaService
from src.services.chat.query_rewriter import QueryRewriter
from src.services.chat.rate_limiter import RateLimiter
from src.services.chat.stream_leases import StreamLeaseManager
from tests.chat.conftest import FIXED_NOW, TEAM_A, make_claims, make_settings
from tests.chat.helpers import FakeAI, FakeRetriever, FakeStore, FakeStreamer, make_chunk, make_retrieval, meeting

CODEC = CursorCodec("harness-cursor-secret")


@dataclass
class Frame:
    event: str
    data: dict[str, Any]


def parse_frames(frames: list[bytes]) -> list[Frame]:
    out: list[Frame] = []
    for raw in frames:
        text = raw.decode()
        if text.startswith(":"):
            continue
        name = text.split("\n", 1)[0].removeprefix("event: ")
        data = json.loads(text.split("data: ", 1)[1].strip())
        out.append(Frame(name, data))
    return out


def names(frames: list[Frame]) -> list[str]:
    return [f.event for f in frames]


def streamed_text(frames: list[Frame]) -> str:
    return "".join(f.data["t"] for f in frames if f.event == "token")


@dataclass
class Harness:
    settings: Any
    redis: Any
    db: Any
    store: FakeStore
    retriever: FakeRetriever
    streamer: FakeStreamer
    ai: FakeAI
    svc: ChatService
    deps: ChatDeps
    breaker: ProviderBreaker
    quota: QuotaService
    leases: StreamLeaseManager
    memory: ConversationMemory
    outbox: LedgerOutbox
    seen_streams: list[SSEStream] = field(default_factory=list)

    def repo(self, team: str = TEAM_A, user: str = "userA1") -> ChatRepository:
        return self.deps.repo_factory(team, user)

    def request(self, message: str = "What did Ahmed commit to?", *, session_id: Optional[str] = None,
                client_id: Optional[str] = None, filters: Optional[ChatFilters] = None) -> ChatRequest:
        return ChatRequest(message=message, session_id=uuid.UUID(session_id) if session_id else None,
                           client_message_id=uuid.UUID(client_id) if client_id else uuid.uuid4(), filters=filters or ChatFilters())

    async def prepare(self, claims: Optional[ChatClaims] = None, req: Optional[ChatRequest] = None) -> PreparedRun:
        return await self.svc.prepare(claims or make_claims(), req or self.request())

    def stream_for(self, prepared: PreparedRun, **kw: Any) -> SSEStream:
        kw.setdefault("strict", True)
        kw.setdefault("heartbeat_s", 5.0)
        s = SSEStream(prepared.ctx, self.svc.producer(prepared), self.settings, **kw)
        self.seen_streams.append(s)
        return s

    async def query(self, message: str = "What did Ahmed commit to?", *, claims: Optional[ChatClaims] = None,
                    req: Optional[ChatRequest] = None, **kw: Any) -> tuple[list[Frame], PreparedRun]:
        prepared = await self.prepare(claims, req or self.request(message))
        stream = self.stream_for(prepared, **kw)
        frames = parse_frames([f async for f in stream.body()])
        return frames, prepared

    async def snapshot(self, team: str = TEAM_A) -> dict[str, int]:
        import pytz
        local = FIXED_NOW.astimezone(pytz.timezone("Asia/Karachi"))
        return await self.quota.snapshot(team, local.strftime("%Y%m%d"), local.strftime("%Y%m"))

    async def lease_count(self, team: str = TEAM_A, user: str = "userA1") -> int:
        from src.services.chat.stream_leases import user_lease_key
        return int(await self.redis.zcard(user_lease_key(team, user)))

    def assert_no_leaks(self, snapshot: dict[str, int]) -> None:
        assert snapshot["reserved"] == 0 and snapshot["reserved_u"] == 0, f"leaked reservation: {snapshot}"
        assert self.leases.active_streams == 0, "leaked pod slot"


async def make_harness(*, chunks: Optional[list] = None, no_context: bool = False, deltas: Optional[list[str]] = None,
                       settings_kw: Optional[dict[str, Any]] = None, streamer: Optional[FakeStreamer] = None,
                       ai: Optional[FakeAI] = None, retrieval: Any = None, store: Optional[FakeStore] = None) -> Harness:
    settings = make_settings(**(settings_kw or {}))
    redis = fakeredis.aioredis.FakeRedis()
    db = AsyncMongoMockClient()["harness"]
    await ensure_indexes(db)
    store = store or FakeStore(meetings=dict([meeting("m1"), meeting("m2", "Sprint Review")]),
                               users={"u1": "Ahmed Khan", "u2": "Sara Malik"})
    chunk_list = chunks if chunks is not None else [
        make_chunk("Ahmed will ship the billing migration by Friday and Sara will review it.", meeting_id="m1", rank=1),
        make_chunk("The sprint review is moved to Thursday.", meeting_id="m2", rank=2, index=1)]
    retriever = FakeRetriever(retrieval or make_retrieval(chunk_list, no_context=no_context))
    streamer = streamer or FakeStreamer(deltas or ["Ahmed will ship billing by Friday ", "[S1]", ". Sara reviews it [S1]."])
    ai = ai or FakeAI()
    breaker = ProviderBreaker(settings)
    quota = QuotaService(redis, settings)
    leases = StreamLeaseManager(redis, settings)
    memory = ConversationMemory(ai, settings)
    outbox = LedgerOutbox(redis, store)                        # type: ignore[arg-type]

    def repo_factory(team: str, user: str) -> ChatRepository:
        return ChatRepository(db, team, user, cursors=CODEC, lease_s=settings.chat_total_timeout_s + 30, clock=lambda: FIXED_NOW)

    deps = ChatDeps(
        settings=settings, repo_factory=repo_factory, quota=quota, outbox=outbox, leases=leases,
        limiter=RateLimiter(redis, per_min=settings.chat_rate_limit_per_min, team_per_min=settings.chat_team_rate_limit_per_min),
        breaker=breaker, store=store, retriever=retriever, streamer=streamer, rewriter=QueryRewriter(ai, settings),
        router=IntentRouter(ai, settings), memory=memory, answer_model=lambda: "gpt-4.1", clock=lambda: FIXED_NOW)
    return Harness(settings, redis, db, store, retriever, streamer, ai, ChatService(deps), deps, breaker, quota, leases, memory, outbox)
