"""
rag/migrate.py
───────────────
Minimal, dependency-free SQL migration runner for the `rag` schema.

WHY NOT PRISMA: the platform's Prisma migrations own schema `public`. These
tables live in schema `rag` (so `prisma migrate dev` never reports drift) and
need a pgvector-capable, role-aware setup that Prisma cannot express.

USAGE (admin/owner DSN, NEVER the runtime role):
  RAG_ADMIN_DATABASE_URL=postgresql://... python -m src.rag.migrate status
  python -m src.rag.migrate up                 # apply all pending
  python -m src.rag.migrate down --steps 1     # revert the latest migration
  python -m src.rag.migrate up --dsn postgresql://...

  RAG_APP_ROLE_PASSWORD=...  → after `up`, sets the runtime role password
  (the SQL files deliberately contain no secrets).

GUARANTEES:
  * one migration per transaction (DDL is transactional in Postgres)
  * a session advisory lock serialises concurrent runners
  * applied versions tracked in rag.schema_migrations
  * `public.teams` must already exist (Prisma applied first)
"""

from __future__ import annotations

import argparse
import asyncio
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path

import asyncpg

from src.config.rag_config import APP_ROLE, get_rag_settings

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent.parent / "migrations"
_FILE_RE = re.compile(r"^(?P<version>\d{3}_[a-z0-9_]+)\.(?P<dir>up|down)\.sql$")
_LOCK_KEY = 0x5241475F4D49  # "RAG_MI"
SEARCH_PATH_SQL = "SET LOCAL search_path = rag, extensions, public"


@dataclass(frozen=True)
class Migration:
    version: str
    up: Path
    down: Path


def discover(directory: Path = MIGRATIONS_DIR) -> list[Migration]:
    files: dict[str, dict[str, Path]] = {}
    for path in sorted(directory.glob("*.sql")):
        match = _FILE_RE.match(path.name)
        if match:
            files.setdefault(match["version"], {})[match["dir"]] = path
    migrations = []
    for version, pair in sorted(files.items()):
        if set(pair) != {"up", "down"}:
            raise RuntimeError(f"migration {version} must have both .up.sql and .down.sql")
        migrations.append(Migration(version, pair["up"], pair["down"]))
    return migrations


async def _prepare(conn: asyncpg.Connection) -> None:
    exists = await conn.fetchval("SELECT to_regclass('public.teams') IS NOT NULL")
    if not exists:
        raise RuntimeError("public.teams does not exist — apply the Prisma migrations first")
    await conn.execute("CREATE SCHEMA IF NOT EXISTS rag")
    await conn.execute(
        "CREATE TABLE IF NOT EXISTS rag.schema_migrations ("
        "version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
    )


async def _applied(conn: asyncpg.Connection) -> list[str]:
    rows = await conn.fetch("SELECT version FROM rag.schema_migrations ORDER BY version")
    return [r["version"] for r in rows]


async def status(dsn: str) -> list[tuple[str, bool]]:
    conn = await asyncpg.connect(dsn)
    try:
        await _prepare(conn)
        done = set(await _applied(conn))
        return [(m.version, m.version in done) for m in discover()]
    finally:
        await conn.close()


async def migrate_up(dsn: str, *, app_role_password: str | None = None) -> list[str]:
    conn = await asyncpg.connect(dsn)
    applied_now: list[str] = []
    try:
        await conn.execute("SELECT pg_advisory_lock($1)", _LOCK_KEY)
        await _prepare(conn)
        done = set(await _applied(conn))
        for migration in discover():
            if migration.version in done:
                continue
            async with conn.transaction():
                await conn.execute(SEARCH_PATH_SQL)
                await conn.execute(migration.up.read_text(encoding="utf-8"))
                await conn.execute(
                    "INSERT INTO rag.schema_migrations (version) VALUES ($1)", migration.version
                )
            applied_now.append(migration.version)
        if app_role_password:
            statement = await conn.fetchval(
                "SELECT format('ALTER ROLE %I PASSWORD %L', $1::text, $2::text)",
                APP_ROLE, app_role_password,
            )
            await conn.execute(statement)
        return applied_now
    finally:
        await conn.execute("SELECT pg_advisory_unlock($1)", _LOCK_KEY)
        await conn.close()


async def migrate_down(dsn: str, *, steps: int = 1) -> list[str]:
    conn = await asyncpg.connect(dsn)
    reverted: list[str] = []
    try:
        await conn.execute("SELECT pg_advisory_lock($1)", _LOCK_KEY)
        await _prepare(conn)
        done = await _applied(conn)
        by_version = {m.version: m for m in discover()}
        for version in reversed(done):
            if len(reverted) >= steps:
                break
            migration = by_version.get(version)
            if migration is None:
                raise RuntimeError(f"applied migration {version} has no file on disk")
            async with conn.transaction():
                await conn.execute(SEARCH_PATH_SQL)
                await conn.execute(migration.down.read_text(encoding="utf-8"))
                await conn.execute("DELETE FROM rag.schema_migrations WHERE version = $1", version)
            reverted.append(version)
        return reverted
    finally:
        await conn.execute("SELECT pg_advisory_unlock($1)", _LOCK_KEY)
        await conn.close()


def _resolve_dsn(cli_dsn: str | None) -> str:
    if cli_dsn:
        return cli_dsn
    secret = get_rag_settings.__wrapped__().rag_admin_database_url  # bypass cache; read env now
    if secret is None:
        raise SystemExit("Set RAG_ADMIN_DATABASE_URL (owner/admin DSN) or pass --dsn")
    return secret.get_secret_value()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="RAG schema migrations")
    parser.add_argument("command", choices=("up", "down", "status"))
    parser.add_argument("--dsn", help="admin DSN (default: RAG_ADMIN_DATABASE_URL)")
    parser.add_argument("--steps", type=int, default=1, help="migrations to revert for `down`")
    args = parser.parse_args(argv)
    dsn = _resolve_dsn(args.dsn)

    if args.command == "status":
        for version, applied in asyncio.run(status(dsn)):
            print(f"{'applied' if applied else 'pending':8} {version}")
        return 0
    if args.command == "up":
        done = asyncio.run(migrate_up(dsn, app_role_password=os.getenv("RAG_APP_ROLE_PASSWORD")))
        print("applied:", ", ".join(done) if done else "(nothing pending)")
        return 0
    done = asyncio.run(migrate_down(dsn, steps=args.steps))
    print("reverted:", ", ".join(done) if done else "(nothing applied)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
