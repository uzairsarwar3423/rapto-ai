"""
rag/db.py — asyncpg pool factory and startup safety checks.

THE SERVICE REFUSES TO START (when RAG is enabled) unless:
  * the connected role is neither SUPERUSER nor BYPASSRLS,
  * FORCE ROW LEVEL SECURITY is on for rag.embeddings,
  * the embedding column's dimension equals EMBEDDING_DIMENSIONS.
A misconfigured DSN (e.g. the Supabase `postgres` role) would silently turn the
whole tenancy model off, so this is checked, not documented.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

import asyncpg
import structlog
from pgvector.asyncpg import register_vector

from src.config.rag_config import EMBEDDING_DIMENSIONS, RagSettings
from src.rag.errors import RagUnavailableError, TenantIsolationError

log = structlog.get_logger(__name__)

# Iterative index scans (filtered-ANN recall) need pgvector >= 0.8.0.
_MIN_ITERATIVE = (0, 8, 0)


@dataclass
class RagDatabase:
    pool: asyncpg.Pool
    settings: RagSettings
    vector_schema: str
    vector_version: str
    pooled: bool

    @property
    def supports_iterative_scan(self) -> bool:
        return _version_tuple(self.vector_version) >= _MIN_ITERATIVE

    @property
    def search_path(self) -> str:
        parts = ["rag", self.vector_schema, "public"]
        return ", ".join(dict.fromkeys(parts))      # de-duplicate, keep order

    async def close(self) -> None:
        await self.pool.close()

    async def ping(self) -> bool:
        try:
            async with self.pool.acquire(timeout=3.0) as conn:
                return await conn.fetchval("SELECT 1") == 1
        except Exception:  # noqa: BLE001
            return False


def _version_tuple(version: str) -> tuple[int, ...]:
    head = version.split("-")[0]
    return tuple(int(p) for p in head.split(".") if p.isdigit())


async def create_database(settings: RagSettings) -> RagDatabase:
    """Connect, discover pgvector, build the pool, run the safety checks."""
    if settings.rag_database_url is None:
        raise TenantIsolationError("RAG_DATABASE_URL is not configured")
    dsn = settings.rag_database_url.get_secret_value()
    cache_size = 0 if settings.rag_db_pooled else 100       # pooler-safe (transaction mode)

    try:
        probe = await asyncpg.connect(dsn, statement_cache_size=cache_size, timeout=10)
    except (OSError, asyncpg.PostgresError) as exc:
        raise RagUnavailableError(f"RAG database unreachable: {type(exc).__name__}: {exc}") from exc
    try:
        row = await probe.fetchrow(
            "SELECT n.nspname AS schema, e.extversion AS version "
            "FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace "
            "WHERE e.extname = 'vector'"
        )
    finally:
        await probe.close()
    if row is None:
        raise TenantIsolationError(
            "pgvector extension is not installed in the RAG database (run src.rag.migrate up)"
        )
    vector_schema, vector_version = row["schema"], row["version"]

    async def _init(conn: asyncpg.Connection) -> None:
        await register_vector(conn, schema=vector_schema)
        # jsonb <-> dict (asyncpg returns raw text by default)
        await conn.set_type_codec(
            "jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog"
        )

    try:
        pool = await asyncpg.create_pool(
            dsn,
            min_size=settings.rag_pool_min_size,
            max_size=settings.rag_pool_max_size,
            command_timeout=settings.rag_db_command_timeout_seconds,
            statement_cache_size=cache_size,
            init=_init,
        )
    except (OSError, asyncpg.PostgresError) as exc:
        raise RagUnavailableError(f"RAG pool creation failed: {type(exc).__name__}: {exc}") from exc

    db = RagDatabase(pool, settings, vector_schema, vector_version, settings.rag_db_pooled)
    try:
        await verify_database(db)
    except Exception:
        await db.close()
        raise
    log.info(
        "rag_database_ready",
        pgvector=vector_version,
        vector_schema=vector_schema,
        iterative_scan=db.supports_iterative_scan,
        pooled=settings.rag_db_pooled,
        pool_max=settings.rag_pool_max_size,
    )
    if not db.supports_iterative_scan:
        log.warning("pgvector_below_0_8_filtered_search_may_underfill", version=vector_version)
    return db


async def verify_database(db: RagDatabase) -> None:
    async with db.pool.acquire() as conn:
        role = await conn.fetchrow(
            "SELECT current_user AS name, r.rolsuper, r.rolbypassrls "
            "FROM pg_roles r WHERE r.rolname = current_user"
        )
        if role is None or role["rolsuper"] or role["rolbypassrls"]:
            raise TenantIsolationError(
                f"RAG role {role['name'] if role else '?'} is SUPERUSER or BYPASSRLS — "
                "row level security would not apply. Connect as vocaply_ai_app.",
            )
        rls = await conn.fetchrow(
            "SELECT relrowsecurity, relforcerowsecurity FROM pg_class "
            "WHERE oid = to_regclass('rag.embeddings')"
        )
        if rls is None:
            raise TenantIsolationError("rag.embeddings does not exist (run src.rag.migrate up)")
        if not (rls["relrowsecurity"] and rls["relforcerowsecurity"]):
            raise TenantIsolationError("rag.embeddings must have ENABLE and FORCE ROW LEVEL SECURITY")
        dims = await conn.fetchval(
            "SELECT atttypmod FROM pg_attribute "
            "WHERE attrelid = 'rag.embeddings'::regclass AND attname = 'embedding'"
        )
        if dims != EMBEDDING_DIMENSIONS:
            raise TenantIsolationError(
                f"embedding column is vector({dims}) but EMBEDDING_DIMENSIONS={EMBEDDING_DIMENSIONS}"
            )
