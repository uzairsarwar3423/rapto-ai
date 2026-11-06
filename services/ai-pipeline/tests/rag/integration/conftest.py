"""
Integration fixtures — a REAL Postgres + pgvector.

Enabled by RAG_TEST_ADMIN_DSN (a superuser/owner DSN on a THROWAWAY server), e.g.

  docker run -d --name aip-pg -e POSTGRES_PASSWORD=pw -p 55433:5432 pgvector/pgvector:pg16
  RAG_TEST_ADMIN_DSN=postgresql://postgres:pw@localhost:55433/postgres pytest tests/rag/integration

Never point this at a real database: the session fixture creates and DROPs a
database named rag_it_<random>. Without the variable every test here is skipped.
"""

from __future__ import annotations

import asyncio
import os
import secrets
from urllib.parse import urlsplit, urlunsplit

import asyncpg
import pytest
import pytest_asyncio

from src.config.rag_config import RagSettings
from src.rag import migrate
from src.rag.db import RagDatabase, create_database

ADMIN_DSN = os.getenv("RAG_TEST_ADMIN_DSN")
APP_PASSWORD = "it_app_pw"
TEAMS = ("teamA", "teamB", "teamC")


def dsn_for(dsn: str, database: str, user: str | None = None, password: str | None = None) -> str:
    parts = urlsplit(dsn)
    netloc = parts.netloc
    if user:
        netloc = f"{user}:{password}@{parts.hostname}:{parts.port or 5432}"
    return urlunsplit(parts._replace(path=f"/{database}", netloc=netloc))


async def _create(name: str) -> None:
    root = await asyncpg.connect(dsn_for(ADMIN_DSN, "postgres"))
    try:
        await root.execute(f'CREATE DATABASE "{name}"')
    finally:
        await root.close()
    conn = await asyncpg.connect(dsn_for(ADMIN_DSN, name))
    try:
        await conn.execute("CREATE TABLE public.teams (id text PRIMARY KEY)")      # stand-in for Prisma's table
        await conn.executemany("INSERT INTO public.teams VALUES ($1)", [(t,) for t in TEAMS])
    finally:
        await conn.close()


async def _drop(name: str) -> None:
    root = await asyncpg.connect(dsn_for(ADMIN_DSN, "postgres"))
    try:
        await root.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
    finally:
        await root.close()


@pytest.fixture(scope="session")
def rag_dsns():
    if not ADMIN_DSN:
        pytest.skip("RAG_TEST_ADMIN_DSN not set (integration tests need a throwaway pgvector Postgres)")
    name = f"rag_it_{secrets.token_hex(4)}"
    asyncio.run(_create(name))
    admin = dsn_for(ADMIN_DSN, name)
    asyncio.run(migrate.migrate_up(admin, app_role_password=APP_PASSWORD))
    yield {
        "admin": admin,
        "app": dsn_for(ADMIN_DSN, name, "vocaply_ai_app", APP_PASSWORD),
        "root": ADMIN_DSN,
        "name": name,
    }
    asyncio.run(_drop(name))


def make_settings(dsn: str, **overrides) -> RagSettings:
    params = {"rag_pool_min_size": 1, "rag_pool_max_size": 6, **overrides}
    return RagSettings(rag_enabled=True, rag_database_url=dsn, **params)


@pytest_asyncio.fixture
async def admin(rag_dsns):
    conn = await asyncpg.connect(rag_dsns["admin"])
    await conn.execute("TRUNCATE rag.embeddings, rag.embedding_jobs")
    yield conn
    await conn.close()


@pytest_asyncio.fixture
async def rag_db(rag_dsns, admin) -> RagDatabase:
    db = await create_database(make_settings(rag_dsns["app"]))
    yield db
    await db.close()
