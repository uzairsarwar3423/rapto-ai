"""Jobs, resumable backfill (Postgres + Mongo-shaped sources) and the HTTP routes."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from types import SimpleNamespace

import asyncpg
import fakeredis.aioredis
import pytest
import pytest_asyncio
from bson import ObjectId

from src.config.rag_config import RagSettings
from src.models.rag_models import JobStatus
from src.rag import jobs
from src.rag.backfill import BackfillRunner, TranscriptReader, turns_from_mongo
from src.rag.embedder import QueryEmbedder
from src.rag.errors import RagConflictError
from src.rag.rate_limit import TokenBucket
from src.rag.runtime import RagRuntime
from tests.rag.helpers import FakeEmbeddingClient, vec_for
from tests.rag.integration.conftest import make_settings

pytestmark = pytest.mark.asyncio


# ── jobs ─────────────────────────────────────────────────────────────────────


async def test_one_active_job_per_team_and_tenant_visibility(rag_db):
    job = await jobs.create_job(rag_db, "teamA", ["commitment"], None, "test")
    assert job.status is JobStatus.QUEUED
    with pytest.raises(RagConflictError, match=str(job.id)):
        await jobs.create_job(rag_db, "teamA", ["decision"])
    await jobs.create_job(rag_db, "teamB", ["decision"])                       # other team is independent
    assert await jobs.get_job(rag_db, "teamB", job.id) is None                 # RLS: B cannot see A's job


async def test_claim_checkpoint_complete_cancel_and_reaper(rag_db, admin):
    a = await jobs.create_job(rag_db, "teamA", ["commitment"])
    claimed = await jobs.claim_next_job(rag_db)
    assert claimed == (a.id, "teamA")
    assert await jobs.claim_next_job(rag_db) is None                           # nothing else queued

    assert await jobs.checkpoint(rag_db, "teamA", a.id, cursor={"type_index": 0, "after": {"ts": "x", "id": "1"}},
                                 processed=3, upserted=2, reused=1, cost_usd=0.5, total_sources=10)
    running = await jobs.get_job(rag_db, "teamA", a.id)
    assert (running.processed_sources, running.upserted, running.reused, running.total_sources) == (3, 2, 1, 10)
    assert running.cursor["after"]["id"] == "1" and running.cost_usd == 0.5

    # reaper: a stale heartbeat puts the job back in the queue, cursor intact
    await admin.execute("UPDATE rag.embedding_jobs SET heartbeat_at = now() - interval '1 hour'")
    assert await jobs.requeue_stale(rag_db, 300) == 1
    assert (await jobs.get_job(rag_db, "teamA", a.id)).status is JobStatus.QUEUED
    assert (await jobs.get_job(rag_db, "teamA", a.id)).cursor["after"]["id"] == "1"

    await jobs.claim_next_job(rag_db)
    assert await jobs.cancel(rag_db, "teamA", a.id)
    assert not await jobs.checkpoint(rag_db, "teamA", a.id, cursor={})        # runner learns it was cancelled
    await jobs.create_job(rag_db, "teamA", ["decision"])                       # cancelled frees the slot


# ── backfill from the application database ──────────────────────────────────

COMMITMENTS_DDL = """
CREATE TABLE IF NOT EXISTS public.commitments (
  id text PRIMARY KEY, "teamId" text NOT NULL, "meetingId" text NOT NULL, text text NOT NULL,
  "ownerNameRaw" text, "ownerId" text, "dueDate" timestamptz, "createdAt" timestamptz NOT NULL DEFAULT now());
TRUNCATE public.commitments;
"""


@pytest_asyncio.fixture
async def source_pool(rag_dsns, admin):
    await admin.execute(COMMITMENTS_DDL)
    for i in range(7):
        await admin.execute(
            'INSERT INTO public.commitments (id,"teamId","meetingId",text,"ownerNameRaw","createdAt") VALUES ($1,$2,$3,$4,$5,$6)',
            f"c{i}", "teamA", "m1", f"ship feature number {i}", "Alice", datetime(2026, 5, 1 + i, tzinfo=timezone.utc))
    await admin.execute(
        'INSERT INTO public.commitments (id,"teamId","meetingId",text,"createdAt") VALUES ($1,$2,$3,$4,$5)',
        "other", "teamB", "m9", "team B secret", datetime(2026, 5, 2, tzinfo=timezone.utc))
    pool = await asyncpg.create_pool(rag_dsns["admin"], min_size=1, max_size=2)
    yield pool
    await pool.close()


async def test_postgres_backfill_is_scoped_resumable_and_idempotent(rag_dsns, admin, source_pool):
    db = None
    from src.rag.db import create_database

    db = await create_database(make_settings(rag_dsns["app"], rag_backfill_page_size=3, rag_job_checkpoint_every_sources=2))
    try:
        client = FakeEmbeddingClient()
        runner = BackfillRunner(db, client, source_pool=source_pool)

        estimate = await runner.estimate("teamA", ["commitment"], None)
        assert estimate.sources == 7 and estimate.chunks == 7 and estimate.tokens > 0 and estimate.cost_usd > 0
        assert client.calls == []                                               # dry run makes no API calls

        job = await jobs.create_job(db, "teamA", ["commitment"])
        await jobs.claim_next_job(db)
        job = await jobs.get_job(db, "teamA", job.id)

        stop = asyncio.Event()
        original = jobs.checkpoint
        seen = {"n": 0}

        async def stop_after_first_page(*a, **k):                              # simulate SIGTERM mid-job
            seen["n"] += 1
            if seen["n"] == 2:
                stop.set()
            return await original(*a, **k)

        jobs.checkpoint = stop_after_first_page                               # type: ignore[assignment]
        try:
            assert await runner.run_job(job, stop) == "released"
        finally:
            jobs.checkpoint = original                                         # type: ignore[assignment]
        partial = await jobs.get_job(db, "teamA", job.id)
        assert partial.status is JobStatus.QUEUED and 0 < partial.processed_sources < 7
        stored_before = await admin.fetchval("SELECT count(*) FROM rag.embeddings")

        # resume from the checkpoint → finishes, no duplicates
        await jobs.claim_next_job(db)
        resumed = await jobs.get_job(db, "teamA", job.id)
        assert await runner.run_job(resumed, None) == "succeeded"
        done = await jobs.get_job(db, "teamA", job.id)
        assert done.status is JobStatus.SUCCEEDED and done.finished_at is not None
        rows = await admin.fetch("SELECT team_id, source_id, chunk_text FROM rag.embeddings ORDER BY source_id")
        assert [r["source_id"] for r in rows] == [f"c{i}" for i in range(7)]
        assert {r["team_id"] for r in rows} == {"teamA"}                        # team B's row never touched
        assert "Commitment by Alice: ship feature number 0" in rows[0]["chunk_text"]
        assert stored_before <= 7

        # a brand-new job over the same data costs nothing
        calls = len(client.calls)
        again = await jobs.create_job(db, "teamA", ["commitment"])
        await jobs.claim_next_job(db)
        assert await runner.run_job(await jobs.get_job(db, "teamA", again.id), None) == "succeeded"
        assert len(client.calls) == calls
        assert (await jobs.get_job(db, "teamA", again.id)).skipped == 7
    finally:
        await db.close()


# ── transcripts (Mongo-shaped) ───────────────────────────────────────────────


class FakeCursor:
    def __init__(self, docs):
        self._docs = docs

    def sort(self, keys):
        for key, direction in reversed(keys):
            self._docs = sorted(self._docs, key=lambda d: d[key], reverse=direction < 0)
        return self

    def limit(self, n):
        self._docs = self._docs[:n]
        return self

    async def to_list(self, length):
        return self._docs[:length]


class FakeCollection:
    """Supports exactly the filter shapes TranscriptReader emits."""

    def __init__(self, docs):
        self.docs = docs

    def _match(self, d, f):
        if d["team_id"] != f["team_id"] or not d.get("normalized_transcript"):
            return False
        if "created_at" in f and d["created_at"] < f["created_at"]["$gte"]:
            return False
        if "$or" in f:
            gt, eq = f["$or"]
            return d["created_at"] > gt["created_at"]["$gt"] or (
                d["created_at"] == eq["created_at"] and d["_id"] > eq["_id"]["$gt"])
        return True

    async def count_documents(self, f):
        return sum(1 for d in self.docs if self._match(d, f))

    def find(self, f):
        return FakeCursor([d for d in self.docs if self._match(d, f)])


def turns(n):
    return [{"turn_id": f"t{i}", "cleaned_text": f"We should discuss item {i} in the billing review today.",
             "speaker_name": "Alice" if i % 2 else "Bob", "start_time": i * 5.0, "end_time": i * 5.0 + 4.0}
            for i in range(n)]


async def test_transcript_backfill_chunks_and_keysets(rag_dsns, admin):
    from src.rag.db import create_database

    docs = [{"_id": ObjectId(), "team_id": "teamA", "meeting_id": f"mt{i}", "normalized_transcript": turns(30),
             "created_at": datetime(2026, 5, 1 + i, tzinfo=timezone.utc)} for i in range(4)]
    docs.append({"_id": ObjectId(), "team_id": "teamB", "meeting_id": "bb", "normalized_transcript": turns(3),
                 "created_at": datetime(2026, 5, 1, tzinfo=timezone.utc)})
    db = await create_database(make_settings(rag_dsns["app"], rag_backfill_page_size=3, rag_chunk_max_tokens=120))
    try:
        runner = BackfillRunner(db, FakeEmbeddingClient(), mongo_db={"transcripts": FakeCollection(docs)})
        job = await jobs.create_job(db, "teamA", ["transcript_chunk"])
        await jobs.claim_next_job(db)
        assert await runner.run_job(await jobs.get_job(db, "teamA", job.id), None) == "succeeded"

        per_meeting = {r["source_id"]: r["n"] for r in await admin.fetch(
            "SELECT source_id, count(*) n FROM rag.embeddings GROUP BY 1")}
        assert set(per_meeting) == {f"mt{i}" for i in range(4)} and all(n > 1 for n in per_meeting.values())
        meta = json.loads(await admin.fetchval("SELECT metadata FROM rag.embeddings WHERE source_id='mt0' AND chunk_index=0"))
        assert meta["meeting_id"] == "mt0" and "start_time" in meta and meta["turn_ids"]
        indices = [r[0] for r in await admin.fetch("SELECT chunk_index FROM rag.embeddings WHERE source_id='mt0' ORDER BY 1")]
        assert indices == list(range(len(indices)))
    finally:
        await db.close()


def test_turns_from_mongo_accepts_raw_degraded_turns():
    out = turns_from_mongo([{"id": "x", "text": "hi there", "speaker_tag": "S1", "start_timestamp": 1, "end_timestamp": 2},
                            {"text": "   "}])
    assert len(out) == 1 and out[0].speaker_name == "S1" and out[0].cleaned_text == "hi there"


# ── HTTP routes ──────────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def rag_app(app, rag_dsns, admin):
    from src.rag.db import create_database

    settings = make_settings(rag_dsns["app"], max_upsert_request_chunks=5)
    db = await create_database(settings)
    fake_client = FakeEmbeddingClient()
    bucket = TokenBucket(settings.embedding_tpm_budget)
    redis = SimpleNamespace(client=fakeredis.aioredis.FakeRedis())
    runtime = RagRuntime(db=db, client=fake_client, bucket=bucket, query_embedder=QueryEmbedder(fake_client, settings, bucket),
                         upsert_slots=asyncio.Semaphore(4), settings=settings, redis=redis,
                         runner=SimpleNamespace(reader_for=lambda t: None))
    app.state.rag = runtime
    yield app, runtime, fake_client
    app.state.rag = None
    await db.close()


def body(n=2, team="teamA", **extra):
    return {"team_id": team, "chunks": [{"content": f"api chunk {i}", "source_type": "transcript_chunk",
                                         "source_id": "m1", "chunk_index": i} for i in range(n)], **extra}


async def test_upsert_route_and_idempotency_replay(rag_app, client, auth_headers, admin):
    _, _, fake = rag_app
    headers = {**auth_headers, "Idempotency-Key": "req-1"}
    first = await client.post("/api/v1/embeddings/upsert", json=body(), headers=headers)
    assert first.status_code == 200 and first.json()["upserted_count"] == 2
    calls = len(fake.calls)

    replay = await client.post("/api/v1/embeddings/upsert", json=body(), headers=headers)
    assert replay.status_code == 200 and replay.json() == first.json() and len(fake.calls) == calls

    other = await client.post("/api/v1/embeddings/upsert", json=body(3), headers=headers)          # same key, other payload
    assert other.status_code == 409 and other.json()["error_code"] == "RAG_CONFLICT"

    no_key = await client.post("/api/v1/embeddings/upsert", json=body(), headers=auth_headers)    # natural idempotency
    assert no_key.json()["upserted_count"] == 0 and no_key.json()["unchanged_count"] == 2
    assert await admin.fetchval("SELECT count(*) FROM rag.embeddings") == 2


async def test_upsert_route_error_contract(rag_app, client, auth_headers):
    big = await client.post("/api/v1/embeddings/upsert", json=body(6), headers=auth_headers)
    assert big.status_code == 413 and big.json()["error_code"] == "PAYLOAD_TOO_LARGE"
    gap = body(2)
    gap["chunks"][1]["chunk_index"] = 5
    bad = await client.post("/api/v1/embeddings/upsert", json=gap, headers=auth_headers)
    assert bad.status_code == 400 and bad.json()["error_code"] == "RAG_VALIDATION_ERROR"
    unknown = await client.post("/api/v1/embeddings/upsert", json={**body(), "extra": 1}, headers=auth_headers)
    assert unknown.status_code == 422 or unknown.status_code == 400
    assert (await client.post("/api/v1/embeddings/upsert", json=body())).status_code in (401, 403)       # no key


async def test_upstream_total_failure_is_502_and_not_cached(rag_app, client, auth_headers):
    _, _, fake = rag_app
    from src.models.exceptions import AITimeoutError

    fake.fail_when = lambda texts: AITimeoutError("down", timeout_seconds=1)
    headers = {**auth_headers, "Idempotency-Key": "will-fail"}
    r = await client.post("/api/v1/embeddings/upsert", json=body(), headers=headers)
    assert r.status_code == 502 and r.json()["error_code"] == "EMBEDDING_UPSTREAM_FAILED"
    fake.fail_when = None
    ok = await client.post("/api/v1/embeddings/upsert", json=body(), headers=headers)       # same key may retry
    assert ok.status_code == 200 and ok.json()["upserted_count"] == 2


async def test_delete_source_and_disabled_mode(rag_app, client, auth_headers, admin):
    app, _, _ = rag_app
    await client.post("/api/v1/embeddings/upsert", json=body(), headers=auth_headers)
    r = await client.request("DELETE", "/api/v1/embeddings/source", headers=auth_headers,
                             json={"team_id": "teamA", "source_type": "transcript_chunk", "source_id": "m1"})
    assert r.status_code == 200 and r.json() == {"deleted": 2}
    other_team = await client.request("DELETE", "/api/v1/embeddings/source", headers=auth_headers,
                                      json={"team_id": "teamB", "source_type": "transcript_chunk", "source_id": "m1"})
    assert other_team.json() == {"deleted": 0}

    app.state.rag = None
    off = await client.post("/api/v1/embeddings/upsert", json=body(), headers=auth_headers)
    assert off.status_code == 503 and off.json()["error_code"] == "RAG_DISABLED"


async def test_backfill_routes(rag_app, client, auth_headers):
    created = await client.post("/api/v1/embeddings/backfill", headers=auth_headers,
                                json={"team_id": "teamA", "source_types": ["commitment"]})
    assert created.status_code == 202
    job_id = created.json()["job_id"]
    dup = await client.post("/api/v1/embeddings/backfill", headers=auth_headers,
                            json={"team_id": "teamA", "source_types": ["decision"]})
    assert dup.status_code == 409 and job_id in dup.json()["message"]
    got = await client.get(f"/api/v1/embeddings/backfill/{job_id}", params={"team_id": "teamA"}, headers=auth_headers)
    assert got.status_code == 200 and got.json()["status"] == "queued"
    hidden = await client.get(f"/api/v1/embeddings/backfill/{job_id}", params={"team_id": "teamB"}, headers=auth_headers)
    assert hidden.status_code == 404
    from src.rag.metrics import metrics as registry

    registry.inc("embedding_api_calls_total")
    scraped = await client.get("/api/v1/embeddings/metrics", headers=auth_headers)
    assert scraped.status_code == 200 and "# TYPE embedding_api_calls_total counter" in scraped.text
    assert (await client.get("/api/v1/embeddings/metrics")).status_code in (401, 403)      # not world-readable
