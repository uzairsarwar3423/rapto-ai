"""
rag/tenant_context.py
──────────────────────
THE ONLY way any module obtains a connection for rag.* tables.

Every setting is TRANSACTION-LOCAL (`set_config(..., true)`), so a pooled
connection can never carry tenant context from one request to the next, and a
statement outside tenant_tx() sees 0 rows (RLS fails closed). `SET LOCAL` is
not used: it cannot take bind parameters.

tests/test_rag_static.py greps rag/ to forbid `pool.acquire(` anywhere else.
"""

from __future__ import annotations

import asyncio
import random
import re
from contextlib import asynccontextmanager
from typing import AsyncIterator, Awaitable, Callable, TypeVar

import asyncpg
import structlog

from src.rag.db import RagDatabase
from src.rag.errors import RagUnavailableError, RagValidationError

log = structlog.get_logger(__name__)

T = TypeVar("T")

_TEAM_ID = re.compile(r"^[A-Za-z0-9_\-]{1,64}$")

_TRANSIENT = (
    asyncpg.SerializationError,
    asyncpg.DeadlockDetectedError,
    asyncpg.ConnectionDoesNotExistError,
    asyncpg.ConnectionFailureError,
    asyncpg.CannotConnectNowError,
    asyncpg.InterfaceError,
    ConnectionError,
)
_UNAVAILABLE = (
    *_TRANSIENT,
    asyncpg.TooManyConnectionsError,
    asyncpg.QueryCanceledError,        # statement_timeout
    asyncio.TimeoutError,
    OSError,
)


def check_team_id(team_id: str) -> str:
    if not isinstance(team_id, str) or not _TEAM_ID.match(team_id):
        raise RagValidationError("team_id is missing or malformed")
    return team_id


@asynccontextmanager
async def tenant_tx(
    db: RagDatabase,
    team_id: str,
    *,
    readonly: bool = False,
    search: bool = False,
    top_k: int | None = None,
) -> AsyncIterator[asyncpg.Connection]:
    """Transaction with the tenant (and optional ANN search settings) applied."""
    check_team_id(team_id)
    cfg = db.settings
    async with db.pool.acquire() as conn:
        async with conn.transaction(readonly=readonly):
            await conn.execute(
                "SELECT set_config('app.current_team_id', $1, true), "
                "       set_config('search_path', $2, true)",
                team_id, db.search_path,
            )
            if search:
                ef = max(cfg.hnsw_ef_search, top_k or 0)      # ef_search caps the result count
                await conn.execute(
                    "SELECT set_config('hnsw.ef_search', $1, true), "
                    "       set_config('statement_timeout', $2, true)",
                    str(ef), str(cfg.search_statement_timeout_ms),
                )
                if cfg.rag_force_index_search:
                    await conn.execute(
                        "SELECT set_config('enable_seqscan', 'off', true), "
                        "       set_config('enable_bitmapscan', 'off', true)"
                    )
                if db.supports_iterative_scan and cfg.hnsw_iterative_scan != "off":
                    await conn.execute(
                        "SELECT set_config('hnsw.iterative_scan', $1, true), "
                        "       set_config('hnsw.max_scan_tuples', $2, true)",
                        cfg.hnsw_iterative_scan, str(cfg.hnsw_max_scan_tuples),
                    )
            yield conn


@asynccontextmanager
async def system_tx(db: RagDatabase) -> AsyncIterator[asyncpg.Connection]:
    """Transaction with NO tenant set. Only for the SECURITY DEFINER job
    functions (claim / requeue); on tenant tables it sees 0 rows."""
    async with db.pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("SELECT set_config('search_path', $1, true)", db.search_path)
            yield conn


async def run_tenant_tx(
    db: RagDatabase,
    team_id: str,
    fn: Callable[[asyncpg.Connection], Awaitable[T]],
    *,
    readonly: bool = False,
    search: bool = False,
    top_k: int | None = None,
) -> T:
    """Run `fn(conn)` in a tenant transaction, retrying transient DB errors.

    Serialization failures, deadlocks and dropped connections are retried
    (default 3 attempts, jittered backoff). Exhaustion → RagUnavailableError (503).
    Constraint / RLS / data errors are NOT retried and propagate unchanged.
    """
    attempts = db.settings.rag_db_max_attempts
    last: BaseException | None = None
    for attempt in range(1, attempts + 1):
        try:
            async with tenant_tx(db, team_id, readonly=readonly, search=search, top_k=top_k) as conn:
                return await fn(conn)
        except _TRANSIENT as exc:
            last = exc
            log.warning("rag_db_transient_error", attempt=attempt, error_type=type(exc).__name__)
            if attempt < attempts:
                await asyncio.sleep(min(2.0, 0.1 * 2 ** attempt) * (0.5 + random.random()))
        except _UNAVAILABLE as exc:
            raise RagUnavailableError(f"RAG database unavailable: {type(exc).__name__}") from exc
    raise RagUnavailableError(f"RAG database unavailable after {attempts} attempts") from last


def to_unavailable(exc: BaseException) -> RagUnavailableError | None:
    """Map low-level DB errors to a 503 for routes that touch the DB directly."""
    return RagUnavailableError(f"RAG database unavailable: {type(exc).__name__}") if isinstance(exc, _UNAVAILABLE) else None


__all__ = ["check_team_id", "run_tenant_tx", "system_tx", "tenant_tx", "to_unavailable"]
