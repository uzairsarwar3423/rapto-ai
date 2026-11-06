"""
Shared fixtures for the Day 58 chat suites.

Everything here is hermetic: fakeredis (with real Lua via lupa), mongomock-motor, injected
clocks and recorded/fake model clients. Integration tests that need a REAL Postgres use
RAG_TEST_ADMIN_DSN (see tests/rag/integration/conftest.py) and are skipped without it.
"""

from __future__ import annotations

import asyncio
import datetime as dt
from typing import Any

import fakeredis.aioredis
import pytest
import pytest_asyncio

from src.config.chat_config import ChatSettings
from src.models.chat_models import ChatClaims
from src.services.chat.request_context import RequestContext

FIXED_NOW = dt.datetime(2026, 11, 6, 9, 30, tzinfo=dt.timezone.utc)      # a Friday
TEAM_A = "teamA"
TEAM_B = "teamB"


def make_settings(**overrides: Any) -> ChatSettings:
    base: dict[str, Any] = dict(chat_enabled=True)
    base.update(overrides)
    return ChatSettings(_env_file=None, **base)


def make_claims(team: str = TEAM_A, user: str = "userA1", plan: str = "PRO", tz: str = "Asia/Karachi",
                role: str = "MEMBER") -> ChatClaims:
    return ChatClaims(team_id=team, user_id=user, role=role, plan=plan, tz=tz, request_id=None)


def make_ctx(claims: ChatClaims | None = None, *, now: dt.datetime = FIXED_NOW, request_id: str = "req-1") -> RequestContext:
    return RequestContext(claims=claims or make_claims(), request_id=request_id, clock=lambda: now)


@pytest.fixture
def settings() -> ChatSettings:
    return make_settings()


@pytest_asyncio.fixture
async def redis():
    r = fakeredis.aioredis.FakeRedis()          # bytes responses, like the production wrapper
    yield r
    await r.flushall()
    await r.aclose()


@pytest.fixture
def ctx() -> RequestContext:
    return make_ctx()


class ManualClock:
    """Monotonic-style clock the tests advance explicitly."""

    def __init__(self, start: float = 1000.0) -> None:
        self.t = start

    def __call__(self) -> float:
        return self.t

    def advance(self, seconds: float) -> None:
        self.t += seconds


@pytest.fixture
def manual_clock() -> ManualClock:
    return ManualClock()


async def eventually(predicate, *, timeout: float = 2.0, interval: float = 0.01) -> bool:
    """Poll `predicate()` (sync or async) until truthy."""
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        res = predicate()
        if asyncio.iscoroutine(res):
            res = await res
        if res:
            return True
        await asyncio.sleep(interval)
    return False
