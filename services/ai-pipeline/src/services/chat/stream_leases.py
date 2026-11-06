"""
services/chat/stream_leases.py
──────────────────────────────
Concurrency control that survives crashes: LEASES with a TTL and heartbeat refresh.

  * per USER   — at most CHAT_MAX_STREAMS_PER_USER (default 2)          → 429 TOO_MANY_STREAMS
  * per SESSION — exactly one in-flight answer (interleaved messages would corrupt
                  the summary watermark)                               → 409 SESSION_BUSY
  * per POD    — a global semaphore sized to the provider's rate limit, with a short bounded
                  wait and then SHED                                    → 429 TOO_MANY_STREAMS

A holder that dies cannot leak: its lease EXPIRES (TTL) and the next acquire ignores expired
members. Normal paths release explicitly (registered in the CleanupRegistry). A heartbeat task
refreshes live leases; if the refresh fails repeatedly the lease is allowed to lapse.

Redis down → degrade to process-local leases (documented; correct per pod, not per cluster).
"""

from __future__ import annotations

import asyncio
import contextlib
import time
import uuid
from typing import Any, Optional

import structlog

from src.config.chat_config import ChatSettings
from src.rag.metrics import metrics
from src.services.chat.errors import SessionBusyError, TooManyStreamsError

log = structlog.get_logger(__name__)

# KEYS[1]=user zset  ARGV: lease_id, max, ttl_ms   → 1 acquired | 0 denied
_USER_ACQUIRE = """
local t = redis.call('TIME'); local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[2]) then return 0 end
redis.call('ZADD', KEYS[1], now + tonumber(ARGV[3]), ARGV[1])
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[3]) * 4)
return 1
"""
# refresh only if still ours (score exists)
_USER_REFRESH = """
local t = redis.call('TIME'); local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
if redis.call('ZSCORE', KEYS[1], ARGV[1]) == false then return 0 end
redis.call('ZADD', KEYS[1], now + tonumber(ARGV[2]), ARGV[1]); return 1
"""
_SESSION_RELEASE = """
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0
"""
_SESSION_REFRESH = """
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE', KEYS[1], ARGV[2]) end
return 0
"""


def user_lease_key(team_id: str, user_id: str) -> str:
    return f"chat:{{{team_id}}}:lease:u:{user_id}"


def session_lease_key(team_id: str, session_id: str) -> str:
    return f"chat:{{{team_id}}}:lease:s:{session_id}"


class LocalLeases:
    """In-process lease table (Redis-outage fallback; also the unit-test backend)."""

    def __init__(self, clock: Any = time.monotonic) -> None:
        self._clock = clock
        self._users: dict[str, dict[str, float]] = {}
        self._sessions: dict[str, tuple[str, float]] = {}

    def acquire_user(self, key: str, lease_id: str, maximum: int, ttl_s: float) -> bool:
        now = self._clock()
        live = {k: v for k, v in self._users.get(key, {}).items() if v > now}
        if len(live) >= maximum:
            self._users[key] = live
            return False
        live[lease_id] = now + ttl_s
        self._users[key] = live
        return True

    def acquire_session(self, key: str, lease_id: str, ttl_s: float) -> bool:
        now = self._clock()
        held = self._sessions.get(key)
        if held and held[1] > now:
            return False
        self._sessions[key] = (lease_id, now + ttl_s)
        return True

    def release_user(self, key: str, lease_id: str) -> None:
        self._users.get(key, {}).pop(lease_id, None)

    def release_session(self, key: str, lease_id: str) -> None:
        held = self._sessions.get(key)
        if held and held[0] == lease_id:
            self._sessions.pop(key, None)

    def refresh(self, key: str, lease_id: str, ttl_s: float, *, session: bool) -> None:
        now = self._clock()
        if session:
            held = self._sessions.get(key)
            if held and held[0] == lease_id:
                self._sessions[key] = (lease_id, now + ttl_s)
        elif lease_id in self._users.get(key, {}):
            self._users[key][lease_id] = now + ttl_s

    def active_users(self, key: str) -> int:
        now = self._clock()
        return sum(1 for v in self._users.get(key, {}).values() if v > now)


class StreamLease:
    """Everything one request holds. `release()` is idempotent and never raises."""

    def __init__(self, manager: "StreamLeaseManager", team_id: str, user_id: str, session_id: Optional[str]) -> None:
        self._m = manager
        self.team_id, self.user_id, self.session_id = team_id, user_id, session_id
        self.user_lease_id = uuid.uuid4().hex
        self.session_lease_id = uuid.uuid4().hex
        self.holds_user = False
        self.holds_session = False
        self.holds_pod = False
        self.redis_user = False
        self.local = False
        self._hb: Optional[asyncio.Task[None]] = None
        self._released = False

    def start_heartbeat(self) -> None:
        if self._hb is None and not self._released:
            self._hb = asyncio.create_task(self._m._heartbeat(self), name="chat-lease-heartbeat")

    async def release(self) -> None:
        if self._released:
            return
        self._released = True
        if self._hb is not None:
            self._hb.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await self._hb
        await self._m._release(self)

    @property
    def released(self) -> bool:
        return self._released


class StreamLeaseManager:
    def __init__(self, redis: Any, settings: ChatSettings, *, local: Optional[LocalLeases] = None) -> None:
        self._redis = redis
        self._cfg = settings
        self._local = local or LocalLeases()
        self._pod = asyncio.Semaphore(settings.chat_global_max_streams)
        self._active = 0

    @property
    def active_streams(self) -> int:
        return self._active

    async def acquire(self, *, team_id: str, user_id: str, session_id: Optional[str]) -> StreamLease:
        """Acquire pod slot → user lease → session lease. On ANY denial, everything taken so far is released."""
        lease = StreamLease(self, team_id, user_id, session_id)
        try:
            try:
                await asyncio.wait_for(self._pod.acquire(), timeout=self._cfg.chat_global_wait_ms / 1000)
            except asyncio.TimeoutError:
                metrics.inc("chat_lease_denied_total", kind="pod")
                raise TooManyStreamsError(retry_after_s=2) from None
            lease.holds_pod = True
            self._active += 1
            metrics.set_gauge("chat_active_streams", float(self._active))

            ttl_ms = self._cfg.chat_lease_ttl_s * 1000
            ukey = user_lease_key(team_id, user_id)
            try:
                ok = await self._redis.eval(_USER_ACQUIRE, 1, ukey, lease.user_lease_id,
                                            self._cfg.chat_max_streams_per_user, ttl_ms)
                if not int(ok):
                    metrics.inc("chat_lease_denied_total", kind="user")
                    raise TooManyStreamsError(retry_after_s=5)
                lease.holds_user = True
                lease.redis_user = True
                if session_id:
                    got = await self._redis.set(session_lease_key(team_id, session_id), lease.session_lease_id,
                                                nx=True, px=ttl_ms)
                    if not got:
                        metrics.inc("chat_lease_denied_total", kind="session")
                        raise SessionBusyError(retry_after_s=3)
                    lease.holds_session = True
            except (TooManyStreamsError, SessionBusyError):
                raise
            except Exception as exc:  # noqa: BLE001 — Redis down: process-local leases
                metrics.inc("chat_lease_redis_down_total", error=type(exc).__name__)
                self._acquire_local(lease, team_id, user_id, session_id)
            lease.start_heartbeat()
            return lease
        except BaseException:
            await lease.release()          # nothing may stay held after a refusal
            raise

    def _acquire_local(self, lease: StreamLease, team_id: str, user_id: str, session_id: Optional[str]) -> None:
        # Undo any partial Redis acquisition bookkeeping flags; local table is authoritative now.
        lease.local = True
        ttl = float(self._cfg.chat_lease_ttl_s)
        if not lease.holds_user:
            if not self._local.acquire_user(user_lease_key(team_id, user_id), lease.user_lease_id,
                                            self._cfg.chat_max_streams_per_user, ttl):
                metrics.inc("chat_lease_denied_total", kind="user")
                raise TooManyStreamsError(retry_after_s=5)
            lease.holds_user = True
        if session_id and not lease.holds_session:
            if not self._local.acquire_session(session_lease_key(team_id, session_id), lease.session_lease_id, ttl):
                metrics.inc("chat_lease_denied_total", kind="session")
                raise SessionBusyError(retry_after_s=3)
            lease.holds_session = True

    async def _heartbeat(self, lease: StreamLease) -> None:
        interval = self._cfg.chat_lease_refresh_s
        ttl_ms = self._cfg.chat_lease_ttl_s * 1000
        ukey = user_lease_key(lease.team_id, lease.user_id)
        skey = session_lease_key(lease.team_id, lease.session_id) if lease.session_id else None
        while True:
            await asyncio.sleep(interval)
            try:
                if lease.local:
                    self._local.refresh(ukey, lease.user_lease_id, ttl_ms / 1000, session=False)
                    if skey:
                        self._local.refresh(skey, lease.session_lease_id, ttl_ms / 1000, session=True)
                    continue
                if lease.holds_user:
                    await self._redis.eval(_USER_REFRESH, 1, ukey, lease.user_lease_id, ttl_ms)
                if skey and lease.holds_session:
                    await self._redis.eval(_SESSION_REFRESH, 1, skey, lease.session_lease_id, ttl_ms)
            except Exception as exc:  # noqa: BLE001 — a missed refresh is survivable (TTL > 2×interval)
                metrics.inc("chat_lease_refresh_failed_total", error=type(exc).__name__)

    async def _release(self, lease: StreamLease) -> None:
        try:
            if lease.holds_user:
                ukey = user_lease_key(lease.team_id, lease.user_id)
                if lease.redis_user:
                    await self._redis.zrem(ukey, lease.user_lease_id)
                else:
                    self._local.release_user(ukey, lease.user_lease_id)
            if lease.holds_session and lease.session_id:
                skey = session_lease_key(lease.team_id, lease.session_id)
                if lease.local:
                    self._local.release_session(skey, lease.session_lease_id)
                else:
                    await self._redis.eval(_SESSION_RELEASE, 1, skey, lease.session_lease_id)
        except Exception as exc:  # noqa: BLE001 — TTL will expire it; but count it (leak alarm)
            metrics.inc("chat_leak_detected_total", kind="lease_release_failed")
            log.error("chat_lease_release_failed", error_type=type(exc).__name__)
        finally:
            lease.holds_user = lease.holds_session = False
            if lease.holds_pod:
                lease.holds_pod = False
                self._active = max(0, self._active - 1)
                self._pod.release()
                metrics.set_gauge("chat_active_streams", float(self._active))
