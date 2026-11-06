"""
services/chat/quota_service.py
──────────────────────────────
Reserve → commit / release quota with a Postgres source of truth (ADR-6).

REDIS is the fast gate; the Postgres ledger (rag.chat_usage_ledger) is authoritative and
can rebuild the counters (after a failover, or via scripts/reconcile_quota.py).

RESERVE is atomic (one Lua script, keys share the `{team}` hash tag → Cluster-safe) and checks
  1. the plan's DAILY query limit (team-timezone day boundary — Q5), and
  2. the MONTHLY dollar ceiling against a WORST-CASE estimate (full input budget + max output),
     so N concurrent requests cannot overshoot the ceiling;
and is idempotent on (user, client_message_id).

CRASH SAFETY: every reservation is mirrored into a per-team ZSET scored by its expiry. The reserve
script reaps expired members inline (decrementing the `reserved` counters), so a pod that dies
mid-stream cannot lock a team out — its reservation simply expires.

REDIS OUTAGE (Q6, pending finance sign-off): FREE plan fails CLOSED (QuotaUnavailableError);
paid plans fail OPEN under the local rate limiter, the request is marked `unmetered`, and the
ledger records it for billing review. Counters heal from the ledger afterwards.

COST COMMIT uses the CostAccumulator (every stage). On cancel there is no provider usage, so the
accumulator holds a local ESTIMATE (flagged) and the nightly reconciliation corrects drift.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Optional

import structlog

from src.config.chat_config import ChatSettings
from src.config.model_routing import compute_cost
from src.models.common import ModelTier
from src.rag.metrics import metrics
from src.services.chat.cost_accumulator import CostAccumulator
from src.services.chat.data_store import ChatDataStore
from src.services.chat.errors import QuotaExceededError, QuotaUnavailableError

log = structlog.get_logger(__name__)

MICRO = 1_000_000          # counters hold integer micro-dollars (Lua numbers are doubles; ints stay exact)

_REAP = """
local function reap(prefix, resq, now)
  local expired = redis.call('ZRANGEBYSCORE', resq, '-inf', now, 'LIMIT', 0, 50)
  for _, m in ipairs(expired) do
    local cm, eu, d, mo = string.match(m, '^([^|]+)|(%d+)|([%w%-]+)|([%w%-]+)$')
    if cm then
      local dk = prefix .. 'q:d:' .. d
      local mk = prefix .. 'q:m:' .. mo
      local r = tonumber(redis.call('HGET', dk, 'reserved') or '0')
      redis.call('HSET', dk, 'reserved', math.max(0, r - 1))
      local ru = tonumber(redis.call('HGET', mk, 'reserved_u') or '0')
      redis.call('HSET', mk, 'reserved_u', math.max(0, ru - tonumber(eu)))
      redis.call('DEL', prefix .. 'res:' .. cm)
    end
    redis.call('ZREM', resq, m)
  end
  return #expired
end
"""

# KEYS: day, mon, res, resq   ARGV: limit_day, ceiling_u, est_u, ttl_s, day, month, member_id, prefix
# returns {code, remaining}   code: 0 ok | 1 existing | -1 daily limit | -2 monthly ceiling
_RESERVE = _REAP + """
local t = redis.call('TIME'); local now = tonumber(t[1])
local limit = tonumber(ARGV[1]); local ceiling = tonumber(ARGV[2]); local est = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4]); local prefix = ARGV[8]
reap(prefix, KEYS[4], now)
local used = tonumber(redis.call('HGET', KEYS[1], 'used') or '0')
local resv = tonumber(redis.call('HGET', KEYS[1], 'reserved') or '0')
if redis.call('EXISTS', KEYS[3]) == 1 then
  return {1, limit - used - resv}
end
if used + resv + 1 > limit then return {-1, 0} end
local mu = tonumber(redis.call('HGET', KEYS[2], 'used_u') or '0')
local mr = tonumber(redis.call('HGET', KEYS[2], 'reserved_u') or '0')
if mu + mr + est > ceiling then return {-2, 0} end
redis.call('HINCRBY', KEYS[1], 'reserved', 1)
redis.call('HINCRBY', KEYS[2], 'reserved_u', est)
local member = ARGV[7] .. '|' .. ARGV[3] .. '|' .. ARGV[5] .. '|' .. ARGV[6]
redis.call('HSET', KEYS[3], 'est_u', est, 'day', ARGV[5], 'month', ARGV[6], 'zm', member)
redis.call('EXPIRE', KEYS[3], ttl + 60)
redis.call('ZADD', KEYS[4], now + ttl, member)
redis.call('EXPIRE', KEYS[1], 259200); redis.call('EXPIRE', KEYS[2], 3456000)
redis.call('EXPIRE', KEYS[4], ttl + 3600)
return {0, limit - used - resv - 1}
"""

# KEYS: day, mon, res, resq   ARGV: actual_u, counts(0/1), limit_day
_COMMIT = """
local actual = tonumber(ARGV[1]); local counts = tonumber(ARGV[2]); local limit = tonumber(ARGV[3])
local d = redis.call('HMGET', KEYS[3], 'est_u', 'zm')
local code = 0
if d[1] then
  local r = tonumber(redis.call('HGET', KEYS[1], 'reserved') or '0')
  redis.call('HSET', KEYS[1], 'reserved', math.max(0, r - 1))
  local ru = tonumber(redis.call('HGET', KEYS[2], 'reserved_u') or '0')
  redis.call('HSET', KEYS[2], 'reserved_u', math.max(0, ru - tonumber(d[1])))
  redis.call('DEL', KEYS[3]); redis.call('ZREM', KEYS[4], d[2])
else
  code = -1
end
if counts == 1 then redis.call('HINCRBY', KEYS[1], 'used', 1) end
redis.call('HINCRBY', KEYS[2], 'used_u', actual)
redis.call('EXPIRE', KEYS[1], 259200); redis.call('EXPIRE', KEYS[2], 3456000)
local used = tonumber(redis.call('HGET', KEYS[1], 'used') or '0')
local resv = tonumber(redis.call('HGET', KEYS[1], 'reserved') or '0')
return {code, limit - used - resv}
"""

# KEYS: day, mon, res, resq   ARGV: limit_day
_RELEASE = """
local limit = tonumber(ARGV[1])
local d = redis.call('HMGET', KEYS[3], 'est_u', 'zm')
if d[1] then
  local r = tonumber(redis.call('HGET', KEYS[1], 'reserved') or '0')
  redis.call('HSET', KEYS[1], 'reserved', math.max(0, r - 1))
  local ru = tonumber(redis.call('HGET', KEYS[2], 'reserved_u') or '0')
  redis.call('HSET', KEYS[2], 'reserved_u', math.max(0, ru - tonumber(d[1])))
  redis.call('DEL', KEYS[3]); redis.call('ZREM', KEYS[4], d[2])
end
local used = tonumber(redis.call('HGET', KEYS[1], 'used') or '0')
local resv = tonumber(redis.call('HGET', KEYS[1], 'reserved') or '0')
return {0, limit - used - resv}
"""


def _prefix(team_id: str) -> str:
    return f"chat:{{{team_id}}}:"


@dataclass
class Reservation:
    team_id: str
    user_id: str
    client_message_id: str
    day: str
    month: str
    est_usd: float
    limit_day: int
    unmetered: bool = False
    reused: bool = False
    remaining: Optional[int] = None
    settled: bool = False

    @property
    def member_id(self) -> str:
        return f"{self.user_id}:{self.client_message_id}"


class QuotaService:
    def __init__(self, redis: Any, settings: ChatSettings) -> None:
        self._redis = redis
        self._cfg = settings

    # ── keys ─────────────────────────────────────────────────────────────────

    def _keys(self, r: Reservation) -> list[str]:
        p = _prefix(r.team_id)
        return [f"{p}q:d:{r.day}", f"{p}q:m:{r.month}", f"{p}res:{r.member_id}", f"{p}resq"]

    # ── estimate ─────────────────────────────────────────────────────────────

    def estimate_reservation_usd(self, plan: str) -> float:
        """Worst case: the FULL input budget and the full output cap on the answer tier, plus allowances."""
        base = compute_cost(self._cfg.ctx_budget(plan), self._cfg.max_output_tokens(plan), ModelTier.FULL)
        return round(base + self._cfg.chat_rewrite_cost_allowance_usd + self._cfg.chat_rerank_cost_allowance_usd, 6)

    @staticmethod
    def seconds_until_reset(now_local: datetime) -> int:
        nxt = (now_local + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        return max(1, int((nxt - now_local).total_seconds()))

    # ── reserve ──────────────────────────────────────────────────────────────

    async def reserve(self, *, team_id: str, user_id: str, plan: str, client_message_id: str,
                      now_local: datetime) -> Reservation:
        res = Reservation(
            team_id=team_id, user_id=user_id, client_message_id=client_message_id,
            day=now_local.strftime("%Y%m%d"), month=now_local.strftime("%Y%m"),
            est_usd=self.estimate_reservation_usd(plan), limit_day=self._cfg.daily_limit(plan),
        )
        ceiling_u = int(self._cfg.monthly_usd_ceiling(plan) * MICRO)
        est_u = max(1, int(res.est_usd * MICRO))
        try:
            code, remaining = await self._redis.eval(
                _RESERVE, 4, *self._keys(res),
                res.limit_day, ceiling_u, est_u, self._cfg.chat_reservation_ttl_s,
                res.day, res.month, res.member_id, _prefix(team_id),
            )
        except Exception as exc:  # noqa: BLE001
            return self._on_redis_down(res, plan, exc)
        code, remaining = int(code), int(remaining)
        if code == -1:
            metrics.inc("chat_quota_rejections_total", kind="daily")
            raise QuotaExceededError("daily_queries", retry_after_s=self.seconds_until_reset(now_local))
        if code == -2:
            metrics.inc("chat_quota_rejections_total", kind="monthly_usd")
            raise QuotaExceededError("monthly_budget")
        res.reused = code == 1
        res.remaining = max(0, remaining)
        return res

    def _on_redis_down(self, res: Reservation, plan: str, exc: Exception) -> Reservation:
        metrics.inc("chat_quota_redis_down_total", error=type(exc).__name__)
        if self._cfg.is_paid(plan) and self._cfg.chat_fail_open_paid_plans:
            metrics.inc("chat_unmetered_total")
            log.error("chat_quota_fail_open", plan=plan, error_type=type(exc).__name__)
            res.unmetered = True
            return res
        log.error("chat_quota_fail_closed", plan=plan, error_type=type(exc).__name__)
        raise QuotaUnavailableError() from exc

    # ── commit / release ─────────────────────────────────────────────────────

    async def commit(self, res: Reservation, cost: CostAccumulator, *, counts_as_query: bool) -> Optional[int]:
        """Settle a reservation to ACTUAL usage. Idempotent (a second call is a no-op). Never raises."""
        if res.settled:
            return res.remaining
        res.settled = True
        actual_u = int(round(cost.total_cost_usd * MICRO))
        if res.unmetered:
            return None
        try:
            code, remaining = await self._redis.eval(
                _COMMIT, 4, *self._keys(res), actual_u, 1 if counts_as_query else 0, res.limit_day)
            res.remaining = max(0, int(remaining))
            if int(code) == -1:
                metrics.inc("chat_commit_without_reservation_total")      # TTL-reaped before commit; usage still recorded
            return res.remaining
        except Exception as exc:  # noqa: BLE001 — the ledger row is the truth; counters heal from it
            res.unmetered = True
            metrics.inc("chat_quota_commit_failed_total", error=type(exc).__name__)
            log.error("chat_quota_commit_failed", error_type=type(exc).__name__)
            return None

    async def release(self, res: Reservation) -> None:
        """Full refund (nothing was spent). Idempotent. Never raises."""
        if res.settled:
            return
        res.settled = True
        if res.unmetered:
            return
        try:
            await self._redis.eval(_RELEASE, 4, *self._keys(res), res.limit_day)
        except Exception as exc:  # noqa: BLE001 — the TTL reaper frees it eventually
            metrics.inc("chat_quota_release_failed_total", error=type(exc).__name__)
            log.error("chat_quota_release_failed", error_type=type(exc).__name__)

    async def settle(self, res: Reservation, cost: CostAccumulator, *, counts_as_query: bool) -> Optional[int]:
        """Release when truly nothing was spent and nothing counts; otherwise commit actuals.
        (Retrieval/rewrite cost already incurred before a model failure still hits the $ ledger.)"""
        if not counts_as_query and cost.total_cost_usd == 0.0:
            await self.release(res)
            return res.remaining
        return await self.commit(res, cost, counts_as_query=counts_as_query)

    # ── introspection / repair ───────────────────────────────────────────────

    async def snapshot(self, team_id: str, day: str, month: str) -> dict[str, int]:
        p = _prefix(team_id)
        d = await self._redis.hgetall(f"{p}q:d:{day}")
        m = await self._redis.hgetall(f"{p}q:m:{month}")

        def _i(h: dict[Any, Any], k: str) -> int:
            v = h.get(k.encode()) if k.encode() in h else h.get(k)
            return int(v) if v is not None else 0

        return {"used": _i(d, "used"), "reserved": _i(d, "reserved"),
                "used_u": _i(m, "used_u"), "reserved_u": _i(m, "reserved_u")}

    async def rebuild_from_ledger(self, store: ChatDataStore, team_id: str, now_local: datetime) -> dict[str, int]:
        """Reset a team's counters from the Postgres ledger (used after a Redis failover)."""
        day_start = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
        month_start = day_start.replace(day=1)
        queries, _usd_day, usd_month = await store.sum_usage(team_id, day_start, month_start)
        p = _prefix(team_id)
        day, month = now_local.strftime("%Y%m%d"), now_local.strftime("%Y%m")
        await self._redis.hset(f"{p}q:d:{day}", mapping={"used": queries, "reserved": 0})
        await self._redis.hset(f"{p}q:m:{month}", mapping={"used_u": int(usd_month * MICRO), "reserved_u": 0})
        await self._redis.delete(f"{p}resq")
        return {"used": queries, "used_u": int(usd_month * MICRO)}


# ─── Ledger outbox (crash-safe write to Postgres) ─────────────────────────────

OUTBOX_KEY = "chat:ledger:outbox"


class LedgerOutbox:
    """Rows are queued durably (Redis list) and flushed to Postgres with ON CONFLICT DO NOTHING, so a
    crash between 'answered' and 'ledger written' cannot lose usage. Redis down → in-memory spill."""

    def __init__(self, redis: Any, store: ChatDataStore, *, batch: int = 200) -> None:
        self._redis = redis
        self._store = store
        self._batch = batch
        self._spill: list[str] = []

    def rows_for(self, *, request_id: str, team_id: str, user_id: str, cost: CostAccumulator,
                 counts_as_query: bool, category: str, now: datetime) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = [{
            "request_id": request_id, "team_id": team_id, "user_id": user_id, "stage": "request",
            "provider": "none", "model": "none", "input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0,
            "estimated": False, "category": category, "counts_as_query": counts_as_query,
            "created_at": now.isoformat(),
        }]
        seen: dict[str, int] = {}
        for e in cost.entries:
            n = seen.get(e.stage, 0)
            seen[e.stage] = n + 1
            rows.append({
                "request_id": request_id, "team_id": team_id, "user_id": user_id,
                "stage": e.stage if n == 0 else f"{e.stage}#{n + 1}", "provider": e.provider, "model": e.model,
                "input_tokens": e.input_tokens, "output_tokens": e.output_tokens, "cost_usd": e.cost_usd,
                "estimated": e.estimated, "category": category, "counts_as_query": False,
                "created_at": now.isoformat(),
            })
        return rows

    async def enqueue(self, rows: list[dict[str, Any]]) -> None:
        payloads = [json.dumps(r, separators=(",", ":")) for r in rows]
        try:
            await self._redis.rpush(OUTBOX_KEY, *payloads)
        except Exception:  # noqa: BLE001
            self._spill.extend(payloads)
            metrics.inc("chat_ledger_spill_total", len(payloads))

    async def flush(self) -> int:
        """Drain up to one batch. Returns rows written. Failed batches are re-queued, never dropped."""
        batch: list[str] = []
        if self._spill:
            batch.extend(self._spill[: self._batch])
            del self._spill[: len(batch)]
        try:
            while len(batch) < self._batch:
                item = await self._redis.lpop(OUTBOX_KEY)
                if item is None:
                    break
                batch.append(item.decode() if isinstance(item, bytes) else item)
        except Exception:  # noqa: BLE001
            pass
        if not batch:
            return 0
        rows = [json.loads(b) for b in batch]
        try:
            await self._store.write_ledger(rows)
            return len(rows)
        except Exception as exc:  # noqa: BLE001
            metrics.inc("chat_ledger_flush_failed_total", error=type(exc).__name__)
            log.error("chat_ledger_flush_failed", error_type=type(exc).__name__, rows=len(rows))
            try:
                await self._redis.lpush(OUTBOX_KEY, *reversed(batch))
            except Exception:  # noqa: BLE001
                self._spill = batch + self._spill
            return 0

    async def depth(self) -> int:
        try:
            return int(await self._redis.llen(OUTBOX_KEY)) + len(self._spill)
        except Exception:  # noqa: BLE001
            return len(self._spill)
