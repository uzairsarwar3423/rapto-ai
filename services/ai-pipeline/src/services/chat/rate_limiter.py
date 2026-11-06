"""
services/chat/rate_limiter.py
─────────────────────────────
Per-user (and coarser per-team) token bucket.

PRIMARY: a Redis Lua script — atomic, keys share a hash tag `{team}` so it is valid on
Redis Cluster. Time comes from `redis.call('TIME')` (no client clock skew).

FALLBACK: a rate limit cannot live only in Redis during a Redis outage. When Redis
errors, a PROCESS-LOCAL bucket applies. Documented consequence: the effective limit is
N pods × limit during an outage (runbook_chat.md, Q6).
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass
from typing import Any, Callable

import structlog

from src.rag.metrics import metrics

log = structlog.get_logger(__name__)

# KEYS[1]=user bucket, KEYS[2]=team bucket
# ARGV: u_cap, u_refill_per_s, t_cap, t_refill_per_s, ttl_s
# returns {allowed(0/1), retry_after_ms}
_LUA = """
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local function take(key, cap, refill)
  local d = redis.call('HMGET', key, 'tokens', 'ts')
  local tokens = tonumber(d[1]); local ts = tonumber(d[2])
  if tokens == nil then tokens = cap; ts = now end
  tokens = math.min(cap, tokens + (now - ts) * refill / 1000.0)
  return tokens
end
local ucap = tonumber(ARGV[1]); local urefill = tonumber(ARGV[2])
local tcap = tonumber(ARGV[3]); local trefill = tonumber(ARGV[4]); local ttl = tonumber(ARGV[5])
local ut = take(KEYS[1], ucap, urefill)
local tt = take(KEYS[2], tcap, trefill)
if ut < 1 or tt < 1 then
  local wait_u = 0; local wait_t = 0
  if ut < 1 then wait_u = (1 - ut) / urefill * 1000 end
  if tt < 1 then wait_t = (1 - tt) / trefill * 1000 end
  redis.call('HSET', KEYS[1], 'tokens', ut, 'ts', now); redis.call('EXPIRE', KEYS[1], ttl)
  redis.call('HSET', KEYS[2], 'tokens', tt, 'ts', now); redis.call('EXPIRE', KEYS[2], ttl)
  return {0, math.ceil(math.max(wait_u, wait_t))}
end
redis.call('HSET', KEYS[1], 'tokens', ut - 1, 'ts', now); redis.call('EXPIRE', KEYS[1], ttl)
redis.call('HSET', KEYS[2], 'tokens', tt - 1, 'ts', now); redis.call('EXPIRE', KEYS[2], ttl)
return {1, 0}
"""


@dataclass(frozen=True)
class RateDecision:
    allowed: bool
    retry_after_s: int = 0
    backend: str = "redis"        # "redis" | "local"


class LocalBucket:
    """Process-local token bucket (the outage limiter). Monotonic clock, injectable for tests."""

    def __init__(self, capacity: float, per_minute: float, clock: Callable[[], float] = time.monotonic) -> None:
        self.capacity = capacity
        self.refill_per_s = per_minute / 60.0
        self._clock = clock
        self._state: dict[str, tuple[float, float]] = {}

    def take(self, key: str) -> tuple[bool, float]:
        now = self._clock()
        tokens, ts = self._state.get(key, (self.capacity, now))
        tokens = min(self.capacity, tokens + (now - ts) * self.refill_per_s)
        if tokens < 1:
            self._state[key] = (tokens, now)
            return False, (1 - tokens) / self.refill_per_s
        self._state[key] = (tokens - 1, now)
        if len(self._state) > 50_000:          # bound memory: drop the oldest quarter
            for k, _ in sorted(self._state.items(), key=lambda kv: kv[1][1])[:12_500]:
                self._state.pop(k, None)
        return True, 0.0


def user_key(team_id: str, user_id: str) -> str:
    return f"chat:{{{team_id}}}:rl:u:{user_id}"


def team_key(team_id: str) -> str:
    return f"chat:{{{team_id}}}:rl:t"


class RateLimiter:
    def __init__(self, redis: Any, *, per_min: int, team_per_min: int,
                 local_clock: Callable[[], float] = time.monotonic) -> None:
        self._redis = redis
        self._per_min = per_min
        self._team_per_min = team_per_min
        self._local_user = LocalBucket(per_min, per_min, local_clock)
        self._local_team = LocalBucket(team_per_min, team_per_min, local_clock)

    async def check(self, team_id: str, user_id: str) -> RateDecision:
        try:
            res = await self._redis.eval(
                _LUA, 2, user_key(team_id, user_id), team_key(team_id),
                self._per_min, self._per_min / 60.0, self._team_per_min, self._team_per_min / 60.0, 300,
            )
            allowed, wait_ms = int(res[0]), int(res[1])
            if not allowed:
                metrics.inc("chat_rate_limited_total", backend="redis")
            return RateDecision(bool(allowed), math.ceil(wait_ms / 1000) if wait_ms else 0, "redis")
        except Exception as exc:  # noqa: BLE001 — Redis down: degrade to the local limiter, never to "no limit"
            metrics.inc("chat_rate_limiter_degraded_total", error=type(exc).__name__)
            log.warning("chat_rate_limiter_redis_down", error_type=type(exc).__name__)
            ok_u, wait_u = self._local_user.take(f"{team_id}:{user_id}")
            ok_t, wait_t = self._local_team.take(team_id)
            if ok_u and ok_t:
                return RateDecision(True, 0, "local")
            metrics.inc("chat_rate_limited_total", backend="local")
            return RateDecision(False, max(1, math.ceil(max(wait_u, wait_t))), "local")
