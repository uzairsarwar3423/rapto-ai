# DAY 56: RAG Infrastructure (pgvector Schema + Embedding Pipeline)
### Principal Engineering Execution Plan · Vocaply AI Pipeline

> **Scope:** plan only. There is no code in this document. Every file, contract, piece of logic, trade-off and test is specified so that implementation is mechanical.
> **Builds on:** Day 46 (OpenAIClient + model routing), Day 48 (chunker → `TextChunk`).
> **Unblocks:** Day 57 (retriever + re-ranking), Days 58–60 (RAG chat, citations, evaluation).

---

## Table of Contents
1. [Objective & Definition of Done](#1-objective--definition-of-done)
2. [Principal Review: Corrections to the Original Spec](#2-principal-review-corrections-to-the-original-spec)
3. [Architecture Overview](#3-architecture-overview)
4. [Architecture Decision Records (ADRs)](#4-architecture-decision-records-adrs)
5. [File Inventory](#5-file-inventory)
6. [Day 56 Execution Timeline (Block by Block)](#6-day-56-execution-timeline-block-by-block)
7. [Security & Multi-Tenancy Model](#7-security--multi-tenancy-model)
8. [Reliability, Idempotency & Failure Handling](#8-reliability-idempotency--failure-handling)
9. [Observability](#9-observability)
10. [Capacity, Performance & Cost Model](#10-capacity-performance--cost-model)
11. [End-of-Day Test Plan](#11-end-of-day-test-plan)
12. [Risk Register](#12-risk-register)
13. [Handoff Contract to Day 57](#13-handoff-contract-to-day-57)
14. [Explicitly Out of Scope](#14-explicitly-out-of-scope)

---

## 1. Objective & Definition of Done

### 1.1 Objective
Build the **write path** (chunk → embed → store) and the **raw read path** (query vector → top-K candidates). Both must be tenant-isolated at the database layer, idempotent, cost-tracked and observable.

### 1.2 Three measurable deliverables
| # | Deliverable | Proof |
|---|---|---|
| D1 | pgvector schema in Supabase with HNSW, RLS and constraints | Migration applies cleanly up and down. `EXPLAIN` shows the HNSW index scan. |
| D2 | Batched, deduplicated, rate-limited embedding pipeline | Unit tests pass. Re-running the same input makes zero OpenAI calls. |
| D3 | Vector store with tenant-isolated upsert and similarity search | Cross-tenant isolation test passes (P0). |

### 1.3 Definition of Done (all required)
- [ ] **P0:** A cross-tenant query never returns another team's rows, whether through app code, a raw SQL session or a missing tenant context.
- [ ] **P0:** A missing tenant context returns **0 rows** (fail closed), not all rows.
- [ ] HNSW index confirmed active: `EXPLAIN (ANALYZE)` shows `Index Scan using idx_embeddings_hnsw`.
- [ ] Idempotency: an identical upsert run twice gives the second run `upserted=0` and makes 0 embedding API calls.
- [ ] End to end: cleaned transcript chunk → embed → upsert → similarity search → correct chunk returned at rank 1 for a verbatim query.
- [ ] Every embedding call is cost-tracked into `CostRecord`.
- [ ] Down-migration tested on a scratch branch database.

---

## 2. Principal Review: Corrections to the Original Spec

The original Day 56 spec is directionally right. It has **nine defects** that would cause security, correctness or scaling bugs in production. These are fixed *before* building.

| # | Original | Problem | Severity | Fix adopted in this plan |
|---|---|---|---|---|
| 1 | `SET LOCAL app.current_team_id = $1` | `SET` cannot take bind parameters. It either fails or tempts string interpolation, which is SQL injection. | **P0** | Use `SELECT set_config('app.current_team_id', $1, true)`. The third argument `true` makes it transaction-local, which is equivalent to `SET LOCAL`. |
| 2 | RLS `ENABLE` only | Table owners and Supabase `postgres`/`service_role` **bypass RLS**. The "0 rows without context" test would falsely fail or falsely pass depending on the role used. | **P0** | `FORCE ROW LEVEL SECURITY`. Create a dedicated `vocaply_ai_app` role (NOINHERIT, no BYPASSRLS) that the pipeline connects as. |
| 3 | Policy has `USING` only | Without `WITH CHECK`, an INSERT/UPDATE can write a row for **another tenant**. | **P0** | Add `WITH CHECK` with the same predicate. |
| 4 | `team_id::text = current_setting(...)` | Casting the column defeats index use, and an empty string is not handled. | P1 | `team_id = NULLIF(current_setting('app.current_team_id', true), '')::uuid`. A missing value becomes NULL and the predicate is false, so it fails closed. |
| 5 | `UNIQUE (team_id, content_hash)` | Identical text in two meetings (for example "Thanks everyone, see you next week") is stored **once**, attached to the first meeting. Citations point to the wrong meeting, and deleting meeting A silently removes retrievable content for meeting B. | **P0 (correctness)** | Row identity = `UNIQUE (team_id, source_type, source_id, chunk_index)`. `content_hash` becomes a **change-detection and embedding-cost cache key**, not a row-identity key (see ADR-4). |
| 6 | "OpenAI limit is 2048 items or 8192 tokens per batch" | Wrong. 8192 is the **per-input** limit. The per-request limit is 2048 inputs and a total-token cap (about 300k). | P2 | Batches are built by **both** item count (≤100) and token budget (configurable, default 100k tokens per request). |
| 7 | HNSW + `WHERE team_id/source_type` filters | HNSW is post-filtered. With `ef_search=100` and a small tenant inside a large table, the filter can discard most candidates and return **fewer than top_k**, even 0. | P1 | pgvector ≥ 0.8: `SET LOCAL hnsw.iterative_scan = relaxed_order` plus `hnsw.max_scan_tuples`. Fallback plan: per-tenant partial indexes or partitioning when a tenant is large (ADR-6). |
| 8 | `ON CONFLICT DO NOTHING` + `executemany()` | `executemany` returns no per-row status, so `upserted_count`/`skipped_count` cannot be computed accurately. | P2 | Bulk insert via `INSERT … SELECT FROM unnest($arrays) … ON CONFLICT … RETURNING id, (xmax = 0) AS inserted`. A single round trip gives exact counts. |
| 9 | FastAPI `BackgroundTasks` for backfill | In-process tasks are lost on pod restart or deploy. There is no progress, no resumability and no concurrency guard, so two backfills can run for the same team. | P1 | `embedding_jobs` table (migration 002) with status, checkpoint cursor and an advisory lock per team. The route enqueues and returns 202. A worker loop executes resumably. |

Additional gaps closed by this plan:
- **Stale chunks on re-processing.** If a transcript is re-chunked from 40 chunks to 35, rows 35–39 would remain as ghost results. Fix: a per-source **replace semantics** transaction (upsert the new set and delete orphan `chunk_index` rows).
- **Deletion and GDPR.** `ON DELETE CASCADE` only covers `teams`. Meetings and commitments live partly in MongoDB, so an explicit `DELETE /embeddings/source` path is needed.
- **Supabase pooler.** Supavisor/PgBouncer in transaction mode breaks asyncpg prepared statements. Use `statement_cache_size=0` on the pooled connection, and a direct session connection for backfill.
- **`meeting_date` inside JSONB** cannot use B-tree range indexes efficiently. Promote it to a real `source_date DATE` column.

---

## 3. Architecture Overview

### 3.1 Write path (incremental, after each new meeting or commitment)
```
Node.js worker (meeting processed)
        │  POST /embeddings/upsert   (internal auth, idempotency key)
        ▼
api/routes/embeddings.py ──► validate, size caps, tenant check
        ▼
rag/chunker_adapter.py  (TextChunk → ChunkToEmbed)       [if raw chunks are sent]
        ▼
rag/embedder.py  embed_chunks()
   1. compute content_hash for every chunk
   2. diff vs DB:  identity unchanged + hash unchanged  → SKIP (no API, no write)
                   hash exists elsewhere in the team    → REUSE vector (no API)
                   new hash                             → EMBED queue
   3. token-aware batching  → Semaphore(5) → embed_batch() → OpenAIClient.generate_embeddings()
   4. dimension + finiteness validation
        ▼
rag/vector_store.py  replace_source_chunks() / upsert()
   BEGIN; set_config(team); bulk upsert via unnest; delete orphans; COMMIT
        ▼
Supabase Postgres (pgvector, HNSW, FORCE RLS)
```

### 3.2 Read path (Day 57 consumes this)
```
query text ─► embed (single, cached) ─► VectorSearchQuery
        ▼
vector_store.similarity_search()
   BEGIN READ ONLY;
   set_config(team_id); SET LOCAL hnsw.ef_search; SET LOCAL hnsw.iterative_scan
   SELECT … WHERE team_id = $1 [filters] ORDER BY embedding <=> $q LIMIT $k
   COMMIT
        ▼
list[VectorSearchResult]  (similarity = 1 − cosine_distance)
```

### 3.3 Defense-in-depth tenancy (three independent layers)
1. **API layer:** the internal JWT or service token carries `team_id`, which must equal the payload `team_id`.
2. **SQL layer:** an explicit `WHERE team_id = $1` in every statement (also a planner hint).
3. **Database layer:** `FORCE RLS` + `USING` + `WITH CHECK` under a non-bypass role.

Any single layer failing still leaves two intact.

---

## 4. Architecture Decision Records (ADRs)

### ADR-1: pgvector on Supabase over a dedicated vector DB
- **Decision:** pgvector.
- **Why:** one transactional store (joins to `teams` and commitments, RLS, backups, PITR), no dual-write consistency problem, and zero new infrastructure. Comfortable to roughly 5–10M vectors with HNSW on an appropriately sized instance.
- **Revisit trigger:** p95 search latency > 150 ms at target QPS, an index that no longer fits in RAM, or more than 20M vectors. The exit path is Qdrant or Turbopuffer behind the same `vector_store` interface, which is why the interface must stay storage-agnostic.

### ADR-2: HNSW over IVFFlat
- HNSW: better recall/latency trade-off, no training step, and good behavior on an empty table that grows incrementally. IVFFlat needs data first to pick lists and degrades as the distribution drifts.
- Cost: slower builds and higher memory. Accepted.
- Params: `m=16, ef_construction=64` (pgvector defaults, a good baseline). Query-time `ef_search=100`. Tune with a recall benchmark on Day 60.

### ADR-3: `vector(1536)` now, `halfvec` as a documented upgrade
- `vector(1536)` is about 6 KB per row. `halfvec(1536)` is about 3 KB, halving index RAM with negligible recall loss for OpenAI embeddings.
- **Decision:** ship `vector(1536)` for simplicity today. Record the halfvec migration path (expression index on `embedding::halfvec(1536)`) in the migration comments. Switch when the HNSW index exceeds about 50% of instance RAM.

### ADR-4: Dedup semantics (identity vs. content)
- **Row identity:** `(team_id, source_type, source_id, chunk_index)`. Each source owns its chunks, which keeps citations and deletes correct.
- **Content hash:** SHA-256 of the *normalized* chunk text (Unicode NFC, trimmed, collapsed whitespace), plus a `model_name` prefix so a model change invalidates the cache.
- **Cost dedup:** if a hash already exists anywhere in the same team with the same model, **copy the vector** instead of calling OpenAI. Cross-team reuse is **forbidden**: it is a side channel, and team B could infer that team A said something.

### ADR-5: Embedding model is a code constant, not an env var
- `text-embedding-3-small`, 1536 dims. Changing it requires a schema change and a full re-embed, so it must go through code review and a migration, never a config flip.
- `model_name` is stored per row so stale rows can be found with `WHERE model_name <> current`.

### ADR-6: Filtered-ANN strategy
- Phase 1 (today): a single HNSW index, `WHERE team_id` filter, pgvector 0.8 iterative scan.
- Phase 2 (when a tenant exceeds about 5% of rows, or recall drops): LIST-partition by a `team_id` hash bucket, or per-large-tenant partial HNSW indexes.
- Today: add a test that detects **under-fill** (fewer results than top_k while more matching rows exist) so the problem is visible early.

### ADR-7: Index creation timing
- On an empty table, create HNSW in the migration (incremental inserts maintain it).
- For **bulk backfill > 100k rows**: the runbook option is drop index → backfill → `CREATE INDEX CONCURRENTLY` with a raised `maintenance_work_mem` and `max_parallel_maintenance_workers`. This is several times faster than incremental insertion.

### ADR-8: asyncpg directly (not supabase-py, not an ORM)
- Needs `unnest` bulk upserts, binary vector codecs (pgvector-python `register_vector`), transaction-scoped settings and pool control. supabase-py goes through PostgREST, which cannot do this.

---

## 5. File Inventory

```
services/ai-pipeline/
├── migrations/
│   ├── 001_pgvector_embeddings_table.up.sql     extension, table, constraints, indexes, RLS, trigger, role grants
│   ├── 001_pgvector_embeddings_table.down.sql   full reversal (drop policy, trigger, indexes, table; extension kept)
│   ├── 002_embedding_jobs.up.sql                backfill job tracking (status, cursor, counts, lock)
│   └── 002_embedding_jobs.down.sql
│
├── src/
│   ├── config/
│   │   └── rag_config.py              frozen constants + env-overridable runtime knobs (pydantic-settings)
│   ├── models/
│   │   └── rag_models.py              EmbeddingSource, ChunkToEmbed, EmbeddedChunk, UpsertResult,
│   │                                  VectorSearchQuery, VectorSearchResult, EmbeddingJob, JobStatus
│   ├── rag/
│   │   ├── __init__.py                public surface: embed_chunks, similarity_search, replace_source_chunks
│   │   ├── hashing.py                 normalize_text, compute_content_hash  (pure, no I/O)
│   │   ├── batching.py                token-aware batch builder, sentence-boundary truncation
│   │   ├── embedder.py                embed_batch, embed_chunks (orchestration)
│   │   ├── vector_store.py            upsert, replace_source_chunks, delete_by_source, similarity_search
│   │   ├── tenant_context.py          async context manager: txn + set_config + per-query settings
│   │   ├── chunker_adapter.py         TextChunk → ChunkToEmbed
│   │   ├── db.py                      asyncpg pool factory, vector codec registration, pooler-safe settings
│   │   └── jobs.py                    backfill job claim/checkpoint/complete (advisory lock)
│   ├── services/
│   │   └── openai_client.py           + generate_embeddings() (EXTEND Day 46)
│   └── api/routes/
│       ├── __init__.py                router registration
│       └── embeddings.py              POST /embeddings/upsert, POST /embeddings/backfill,
│                                      GET /embeddings/backfill/{job_id}, DELETE /embeddings/source
│
├── scripts/
│   └── backfill_embeddings.py         CLI: one-time launch backfill (resumable, dry-run, rate-limited)
│
└── tests/
    ├── unit/
    │   ├── test_hashing.py
    │   ├── test_batching.py
    │   ├── test_embedder.py
    │   ├── test_vector_store_sql.py   SQL shape assertions (team_id in the statement, params bound)
    │   └── test_chunker_adapter.py
    ├── integration/
    │   ├── conftest.py                Postgres+pgvector container (or Supabase branch), roles, migrations
    │   ├── test_migration.py
    │   ├── test_tenant_isolation.py   P0 suite
    │   ├── test_vector_store_live.py
    │   └── test_e2e_embed_search.py
    └── fixtures/
        ├── sample_chunks_for_embedding.json
        ├── sample_vector_search_queries.json
        └── deterministic_vectors.json  precomputed unit vectors, so integration tests need no OpenAI
```

> Two additions versus the original spec: `hashing.py`/`batching.py`/`tenant_context.py`/`db.py`/`jobs.py` split responsibilities for testability (pure functions with no I/O are unit-testable in milliseconds), and `deterministic_vectors.json` keeps CI free of network calls and cost.

---

## 6. Day 56 Execution Timeline (Block by Block)

Each block ends with a **checkpoint test**. Do not start the next block until it is green.

| Block | Time | Focus |
|---|---|---|
| B1 | 0:00–1:15 | Migrations 001 + 002, roles, RLS |
| B2 | 1:15–1:45 | Config + models |
| B3 | 1:45–2:30 | OpenAIClient `generate_embeddings` |
| B4 | 2:30–3:15 | Hashing + batching (pure) |
| B5 | 3:15–4:30 | Embedder orchestration |
| B6 | 4:30–6:00 | Vector store + tenant context + DB pool |
| B7 | 6:00–6:30 | Chunker adapter |
| B8 | 6:30–7:15 | API routes + job tracking |
| B9 | 7:15–7:45 | Backfill script |
| B10 | 7:45–9:00 | Full test suite, EXPLAIN verification, DoD sign-off |

---

### B1: Migrations, Roles & RLS

**Files:** `001_*.up/down.sql`, `002_*.up/down.sql`

**001 up, in order:**
1. `CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;` (Supabase convention). Assert version ≥ 0.8.0 for iterative scan. If it is lower, log it and fall back (document in the README).
2. **Table `embeddings`:**

| Column | Type | Constraint / Notes |
|---|---|---|
| id | uuid | PK, `gen_random_uuid()` |
| team_id | uuid | NOT NULL, FK `teams(id)` ON DELETE CASCADE |
| source_type | text | NOT NULL, `CHECK (source_type IN ('transcript_chunk','commitment','action_item','decision','summary','digest'))`. A CHECK instead of a PG enum, because CHECK changes are cheaper to migrate. |
| source_id | uuid | NOT NULL |
| chunk_index | smallint | NOT NULL DEFAULT 0, `CHECK (chunk_index >= 0)` |
| chunk_text | text | NOT NULL, `CHECK (length(chunk_text) BETWEEN 1 AND 40000)` |
| content_hash | char(64) | NOT NULL, `CHECK (content_hash ~ '^[0-9a-f]{64}$')` |
| embedding | vector(1536) | NOT NULL |
| model_name | text | NOT NULL DEFAULT 'text-embedding-3-small' |
| source_date | date | NULL. Promoted from metadata for range filters. |
| token_count | integer | NULL. For cost audits and re-embed estimates. |
| metadata | jsonb | NOT NULL DEFAULT '{}', `CHECK (jsonb_typeof(metadata)='object')` |
| created_at / updated_at | timestamptz | NOT NULL DEFAULT now() |

3. **Constraints and indexes:**
   - `UNIQUE (team_id, source_type, source_id, chunk_index)`: the row identity and upsert target.
   - `INDEX (team_id, content_hash)` (non-unique): vector-reuse lookup.
   - `INDEX (team_id, source_type, source_date)`: filtered queries and range scans.
   - `INDEX (source_type, source_id)`: delete-by-source.
   - `GIN (metadata jsonb_path_ops)`: `@>` containment filters.
   - `HNSW (embedding vector_cosine_ops) WITH (m=16, ef_construction=64)`.
   - Drop the redundant standalone `(team_id)` index, which is covered by the leading column of the composites. It is write amplification for no read benefit.
4. **RLS:**
   - `ALTER TABLE embeddings ENABLE ROW LEVEL SECURITY; ALTER TABLE embeddings FORCE ROW LEVEL SECURITY;`
   - Policy `embeddings_tenant_isolation FOR ALL TO vocaply_ai_app USING (team_id = NULLIF(current_setting('app.current_team_id', true), '')::uuid) WITH CHECK (same)`.
   - Role `vocaply_ai_app`: LOGIN, NOBYPASSRLS, grants SELECT/INSERT/UPDATE/DELETE on `embeddings` only, plus USAGE on the schema and the `vector` type.
5. **Trigger:** reuse a shared `set_updated_at()` function if one exists (check first, to avoid clobbering an existing `update_updated_at_column` used by other tables). Otherwise create `CREATE OR REPLACE` in a utility schema.
6. Final `ANALYZE embeddings;`.

**001 down:** drop trigger → policy → table (indexes go with it) → role grants. **Do not drop the extension**, because other objects may depend on it.

**002 `embedding_jobs`:** `id, team_id, source_types text[], status (queued|running|succeeded|failed|cancelled), cursor jsonb, total_sources, processed_sources, upserted, reused, skipped, failed, cost_usd numeric(12,6), error text, started_at, finished_at, heartbeat_at, created_by`. Partial unique index `(team_id) WHERE status IN ('queued','running')`, so only one active backfill runs per team. RLS identical to `embeddings`.

**Checkpoint B1**
- [ ] Up → down → up runs cleanly on a scratch database.
- [ ] As `vocaply_ai_app` with no `app.current_team_id`: `SELECT count(*)` = 0 even with seeded rows.
- [ ] As `vocaply_ai_app` with team A set: an INSERT of a row with `team_id = B` fails with an RLS violation (`WITH CHECK` works).
- [ ] `\d embeddings` shows all constraints. `pg_indexes` lists the HNSW index.

---

### B2: Config & Models

**`config/rag_config.py`** has two tiers:

*Frozen constants* (changes need a migration):
- `EMBEDDING_MODEL = "text-embedding-3-small"`
- `EMBEDDING_DIMENSIONS = 1536` (must match `vector(1536)`; asserted at startup by reading `atttypmod` from the catalog)
- `CONTENT_HASH_ALGORITHM = "sha256"`, `HASH_NORMALIZATION_VERSION = 1`

*Runtime knobs* (pydantic-settings, env-overridable, validated ranges):
| Knob | Default | Range | Purpose |
|---|---|---|---|
| EMBEDDING_BATCH_SIZE | 100 | 1–2048 | Items per request |
| EMBEDDING_BATCH_MAX_TOKENS | 100_000 | 1k–250k | Token budget per request |
| EMBEDDING_MAX_INPUT_TOKENS | 8000 | ≤ 8191 | Per-text cap before truncation |
| EMBEDDING_CONCURRENCY | 5 | 1–20 | Semaphore size |
| EMBEDDING_TPM_BUDGET | 800_000 | — | Client-side token bucket (below the org limit) |
| HNSW_EF_SEARCH | 100 | 10–1000 | Must be ≥ top_k |
| HNSW_ITERATIVE_SCAN | "relaxed_order" | off / strict / relaxed | Filtered recall |
| HNSW_MAX_SCAN_TUPLES | 20_000 | — | Bound on iterative cost |
| SIMILARITY_TOP_K | 20 | 1–100 | Candidates before re-rank |
| RERANK_TOP_N | 8 | ≤ TOP_K | Used on Day 57 |
| MIN_SIMILARITY | 0.0 | 0–1 | Optional floor (tuned on Day 60) |
| MAX_CHUNKS_PER_SOURCE | 200 | — | Degenerate-case cap |
| MAX_UPSERT_REQUEST_CHUNKS | 1000 | — | API payload cap |
| SEARCH_STATEMENT_TIMEOUT_MS | 2000 | — | `SET LOCAL statement_timeout` |

Cross-field validation: `ef_search ≥ top_k`, `rerank_top_n ≤ top_k`.

**`models/rag_models.py`** (Pydantic v2, `frozen=True` where immutable, `extra="forbid"` on API inputs):
- `EmbeddingSource(StrEnum)`: the six values, which must stay identical to the SQL CHECK. A unit test parses the migration file and asserts equality, catching drift.
- `ChunkToEmbed`: `content` (min 1, stripped), `source_type`, `source_id: UUID`, `chunk_index: int ≥ 0`, `team_id: UUID`, `source_date: date | None`, `metadata: dict` (≤ 8 KB serialized, JSON-safe values only, reserved keys validated: `meeting_id, speaker_name, speaker_user_id, start_time, end_time, turn_ids, commitment_owner_id, due_date_utc`).
- `EmbeddedChunk(ChunkToEmbed)`: `embedding: list[float]` (validated length == 1536, all finite), `content_hash: str`, `model_name: str`, `token_count: int`, `vector_origin: Literal["api","reused"]`.
- `UpsertResult`: `upserted_count, updated_count, unchanged_count, reused_vector_count, deleted_orphans, failed_count, failures: list[ChunkFailure]`, `total_cost: CostRecord`, `duration_ms`. (The richer counters replace the single `skipped_count`, so ops can tell "nothing changed" apart from "saved an API call".)
- `VectorSearchQuery`: as in the spec, plus `min_similarity`, `source_ids_filter: list[UUID] | None`, and a validator that the embedding length is 1536 and `date_range` start ≤ end.
- `VectorSearchResult`: as in the spec, plus `source_date`, `model_name`, `rank: int`. `similarity_score` is clamped to [0, 1].

**Checkpoint B2**
- [ ] Model validation tests: a wrong dimension, NaN, an oversized metadata blob, a negative chunk_index and an unknown source_type are all rejected.
- [ ] The enum ↔ SQL CHECK parity test passes.

---

### B3: OpenAIClient Extension

**File:** `services/openai_client.py` (extend Day 46; no new client).

**`generate_embeddings(texts, *, model=EMBEDDING_MODEL, request_id) -> AICallResult[list[list[float]]]`**
- Routes through `TaskType.EMBEDDING → ModelTier.EMBED`.
- Calls `client.embeddings.create(model=…, input=texts, encoding_format="float")`.
- **Reorders the response by `data[i].index`**. Never assume response order equals input order.
- Asserts `len(data) == len(texts)`.
- Reuses Day 46 retry policy: exponential backoff with full jitter on 429/5xx/timeouts, honors `Retry-After`, max 5 attempts, **no retry on 400** (a bad input will not get better).
- Timeout 30 s per call. Circuit breaker shared with the other OpenAI task types.
- Cost: `usage.prompt_tokens × price_per_token(model)` recorded into `CostRecord` with `task_type=EMBEDDING`, team_id, request_id. Price comes from the central pricing table (verify current OpenAI pricing; do not hard-code it in this module).
- Emits metrics (see §9).

**Checkpoint B3**
- [ ] Mocked tests cover order restoration from shuffled `index`, retry on 429 with `Retry-After`, no retry on 400, and cost computed from usage.

---

### B4: Hashing & Batching (pure functions)

**`rag/hashing.py`**
- `normalize_text(text)`: Unicode NFC → strip → collapse internal whitespace runs to a single space. Case is **not** lowercased, because embeddings are case-sensitive and the hash must reflect what was embedded.
- `compute_content_hash(text, model_name)`: `sha256(f"v{NORM_VERSION}|{model_name}|{normalized}".encode("utf-8")).hexdigest()`. Including the model means a model upgrade naturally invalidates the reuse cache. The normalization version allows future changes without collisions.

**`rag/batching.py`**
- `count_tokens(text)`: `tiktoken` with the `cl100k_base` encoding (the tokenizer used by text-embedding-3), with the encoder cached at module level. Do **not** reuse a character-ratio estimator here: truncation decisions need exact counts.
- `truncate_to_tokens(text, max_tokens)`: if over the limit, cut at the last sentence boundary (`. ! ? \n`) at or before the token limit. If no boundary exists within the last 20% of the allowed window, cut at the last whitespace. Return `(text, was_truncated, original_tokens)`. A truncation is **logged with source ids and counted in a metric**, never silent.
- `build_batches(items, max_items, max_tokens)`: greedy and order-preserving. A new batch starts when either limit would be exceeded. Every batch is non-empty, and a single item can never exceed `max_tokens`, guaranteed because it was truncated first.

**Checkpoint B4**
- [ ] Hash determinism, including across processes (subprocess test).
- [ ] Whitespace and NFC variants hash identically. A different model gives a different hash.
- [ ] Truncation never splits a word, output ≤ limit, Urdu/Roman-Urdu and emoji text handled (multi-byte safety).
- [ ] Property-based test (Hypothesis): concatenating the batches equals the input in order, and every batch is within both limits.

---

### B5: Embedder Orchestration

**`rag/embedder.py`**

**`embed_batch(texts, client) -> (vectors, usage)`**
1. Truncate any text over `EMBEDDING_MAX_INPUT_TOKENS` (B4).
2. Acquire **token-bucket** capacity (`EMBEDDING_TPM_BUDGET`) for the batch's token count. This prevents 429 storms when backfill and live traffic overlap.
3. Call `client.generate_embeddings`.
4. Validate each vector: length == 1536, all values finite, L2 norm ≈ 1.0 (±1e-3, since OpenAI vectors are normalized). Any failure rejects the **whole batch** with `EmbeddingValidationError`. Nothing malformed reaches the database.

**`embed_chunks(chunks, client, pool) -> UpsertResult`**
1. **Guards:** all chunks share one `team_id` (mixing is a 400). Per source, chunk count ≤ `MAX_CHUNKS_PER_SOURCE`. Duplicate `(source_type, source_id, chunk_index)` within the request is rejected.
2. **Hash:** compute `content_hash` per chunk.
3. **Diff against the DB** in one tenant-scoped read:
   - Fetch existing `(source_type, source_id, chunk_index) → content_hash` for the sources in the request.
   - Fetch existing `content_hash → embedding` for the request's new hashes within the team and the current model (`WHERE team_id=$1 AND content_hash = ANY($2) AND model_name=$3`, `DISTINCT ON (content_hash)`).
4. **Classify** each chunk:
   - `UNCHANGED`: the identity exists with the same hash. Skip entirely.
   - `REUSE`: the hash exists elsewhere in the team. Copy the vector, with no API call.
   - `EMBED`: needs an API call.
5. **In-request dedup:** identical hashes inside the `EMBED` set are embedded **once** and fanned out.
6. **Embed:** `build_batches` → `asyncio.Semaphore(EMBEDDING_CONCURRENCY)` → `asyncio.gather(..., return_exceptions=True)`. Failures are isolated per batch: one failed batch does not discard the successful ones. Failed chunks go to `failures` with a reason code.
7. **Persist:** group by source and call `vector_store.replace_source_chunks` when the caller marks the request as a full source snapshot (`mode="replace"`, default for transcripts). Otherwise call `vector_store.upsert` (`mode="merge"`, for commitments edited individually).
8. **Aggregate** counts, cost and duration. Emit a structured log line with the job summary.

Invariants (asserted in tests):
- OpenAI call count ≤ `ceil(EMBED-set size / batch_size)` adjusted for the token budget.
- A re-run with identical input makes **0** OpenAI calls and **0** writes.

**Checkpoint B5**
- [ ] Mock: 10 chunks, 4 already stored unchanged, 2 reusable → exactly 4 texts sent to OpenAI.
- [ ] Mock: one batch raises → the other batches persist, and `failed_count` equals that batch's size.
- [ ] Mock: an invalid dimension returned → nothing persisted for that batch.

---

### B6: Vector Store, Tenant Context & DB Pool

**`rag/db.py`**
- `create_pool(dsn, *, pooled: bool)`: asyncpg pool (min 2, max 10, per pod). The `init` hook calls `register_vector(conn)` for the binary codec. If `pooled=True` (Supavisor transaction mode), set `statement_cache_size=0`.
- Connects as **`vocaply_ai_app`**, never as `postgres` or `service_role`. Startup check: `SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user` must be false, **or the service refuses to start**.
- Startup check: the column dimension equals `EMBEDDING_DIMENSIONS`.

**`rag/tenant_context.py`**
- `async with tenant_tx(pool, team_id, *, readonly=False, search_settings=False) as conn:` acquires a connection → `BEGIN` (READ ONLY when reading) → `SELECT set_config('app.current_team_id', $1, true)` → when searching, also `set_config('hnsw.ef_search', …, true)`, `hnsw.iterative_scan`, `hnsw.max_scan_tuples`, `statement_timeout`. Because every setting is transaction-local, pooled connections never leak tenant context. This is the **only** way any module obtains a connection for `embeddings`. A lint rule or grep test forbids `pool.acquire()` elsewhere in `rag/`.

**`rag/vector_store.py`**

`upsert(chunks, pool) -> UpsertStats`
- Single statement: `INSERT INTO embeddings (cols…) SELECT * FROM unnest($1::uuid[], $2::text[], …, $n::vector[]) ON CONFLICT (team_id, source_type, source_id, chunk_index) DO UPDATE SET chunk_text, content_hash, embedding, model_name, metadata, source_date, token_count = EXCLUDED.… WHERE embeddings.content_hash IS DISTINCT FROM EXCLUDED.content_hash RETURNING id, (xmax = 0) AS inserted`.
  - The `WHERE` on DO UPDATE means unchanged rows are not rewritten: no dead tuples and no HNSW churn.
  - `xmax = 0` distinguishes inserted from updated rows.
- Chunked at about 500 rows per statement to bound memory and lock time.

`replace_source_chunks(team_id, source_type, source_id, chunks, pool)`
- One transaction: upsert the chunks, then `DELETE FROM embeddings WHERE team_id=$1 AND source_type=$2 AND source_id=$3 AND chunk_index >= $new_count`. Atomic, so readers never see a half-replaced source.
- `pg_advisory_xact_lock(hashtext(team_id||source_id))` serializes concurrent re-processing of the same meeting.

`delete_by_source(team_id, source_type, source_id, pool) -> int`: for meeting or commitment deletion and GDPR erasure.

`similarity_search(query, pool) -> list[VectorSearchResult]`
- `tenant_tx(readonly=True, search_settings=True)`.
- **SQL built from a fixed whitelist of fragments.** Only parameter placeholders vary. No user value is ever interpolated, and no dynamic column names exist.
- Base: `SELECT id, chunk_text, source_type, source_id, chunk_index, metadata, source_date, model_name, embedding <=> $q AS distance FROM embeddings WHERE team_id = $1 AND model_name = $current_model`, plus optional `source_type = ANY($)`, `source_id = ANY($)`, `metadata @> $::jsonb`, `metadata @> {"meeting_id": …}` (via containment so GIN is used), `source_date BETWEEN $ AND $`. Then `ORDER BY embedding <=> $q LIMIT $k`.
- **Important:** `ORDER BY` must use the raw `<=>` expression on the indexed column. Ordering by the derived similarity (`1 - distance DESC`) **will not use the HNSW index**. Convert to similarity in Python after fetching.
- Post-process: `similarity = clamp(1 - distance, 0, 1)`, apply `min_similarity`, and assign `rank`.
- Telemetry: `requested_k`, `returned_k`, and an **under-fill flag** when `returned < k` and filters were present (the early warning for ADR-6).

**Checkpoint B6**
- [ ] SQL-shape unit test: the captured statement contains `team_id = $1`, has no f-string values, and `ORDER BY` uses `<=>`.
- [ ] Live: upsert, then upsert the same rows again gives inserted=0 and updated=0. Changing one chunk's text gives updated=1.
- [ ] Live: replace 40 → 35 chunks deletes exactly 5 orphans.
- [ ] Startup refuses to run with a BYPASSRLS role.

---

### B7: Chunker Adapter

**`rag/chunker_adapter.py`**
- `to_chunks_to_embed(text_chunks, *, team_id, source_type, source_id, source_date, base_metadata) -> list[ChunkToEmbed]`.
- Mapping: `content ← chunk.content`, `chunk_index ← position (re-indexed 0..n-1, contiguous)`, `metadata.turn_ids ← chunk.source_turn_ids`, `metadata.start_time/end_time ← chunk.start_time/end_time` (floats, seconds), and speaker info if the chunk carries a single dominant speaker. Merge `base_metadata` (meeting_id, title) with chunk keys winning on collision, and log it.
- Drops empty or whitespace-only chunks **before** indexing, so indices stay contiguous. Enforces `MAX_CHUNKS_PER_SOURCE` (it raises; it does not silently truncate, so the caller decides).
- Pure function, no I/O. It is the single seam between Day 48 and RAG.

**Checkpoint B7**
- [ ] A Day 48 fixture transcript converts round-trip with contiguous indices, preserved times and a metadata size within limits.

---

### B8: API Routes & Job Tracking

**`api/routes/embeddings.py`** (all routes use internal service auth: an HMAC or JWT with the `svc:ai-pipeline` audience)

| Route | Behavior |
|---|---|
| `POST /embeddings/upsert` | Body: `{team_id, mode: "replace" or "merge", chunks[] ≤ 1000}` plus an `Idempotency-Key` header. The token's team must equal `team_id`. It is synchronous because typical payloads are small (one meeting); 413 if over the cap. Returns `UpsertResult`. Idempotency: the key and result are cached for 24 h (Redis), so a retry returns the same result without re-processing. |
| `POST /embeddings/backfill` | Body: `{team_id, source_types[], since?: date}`. Inserts an `embedding_jobs` row (the partial unique index rejects a second active job with 409 and the existing job_id). Returns **202 + job_id + status URL**. |
| `GET /embeddings/backfill/{job_id}` | Progress: processed/total, counts, cost, status, last heartbeat. |
| `DELETE /embeddings/source` | Body: `{team_id, source_type, source_id}`. Calls `delete_by_source`. Used by the meeting-delete and GDPR flows. |

**Error contract:** 400 validation, 401/403 auth or tenant mismatch, 409 job conflict, 413 payload too large, 429 when the internal concurrency cap is reached, 502 for an upstream OpenAI failure after retries, 503 when the DB is unavailable. Every error body follows the Day 46 error envelope with `request_id`.

**`rag/jobs.py`:** `claim_next_job()` (`SELECT … FOR UPDATE SKIP LOCKED`), `checkpoint(job_id, cursor, deltas)` (after every N sources), `heartbeat()`, `complete()` / `fail()`. A reaper re-queues `running` jobs whose heartbeat is more than 5 minutes old. The worker loop runs inside the ai-pipeline service (or a separate worker deployment). It is resumable from `cursor` (last processed `source_date, source_id`).

**Checkpoint B8**
- [ ] A tenant mismatch between token and body returns 403.
- [ ] The same Idempotency-Key twice returns an identical response with one processing.
- [ ] A second backfill for the same team returns 409 with the existing job id.
- [ ] Kill the worker mid-job, restart, and the job resumes from its checkpoint with no duplicates.

---

### B9: Backfill Script

**`scripts/backfill_embeddings.py`** (CLI)
- Flags: `--team-id` (or `--all-teams`), `--source-types`, `--since`, `--concurrency`, `--tpm-budget`, `--dry-run`, `--resume-job`, `--rebuild-index` (ADR-7 runbook mode).
- Flow: create or resume an `embedding_jobs` row → stream sources (a MongoDB cursor for cleaned transcripts, sorted by `(date, _id)`, with a batch size, never loaded all at once; Postgres keyset pagination for commitments) → chunk via the Day 48 chunker → adapter → `embed_chunks(mode="replace")` → checkpoint.
- `--dry-run` reports source count, chunk count, token total, **estimated cost** and estimated duration, with no API calls. **Run this first and get cost sign-off.**
- Graceful SIGINT/SIGTERM: finish the in-flight batch, checkpoint, exit 0.
- Uses a **direct (session) DB connection**, not the transaction pooler.
- Idempotent by construction (identity upsert + hash diff), so it is safe to re-run.

**Checkpoint B9**
- [ ] A dry run on fixtures prints a correct estimate.
- [ ] A real run on 3 fixture meetings and then a re-run gives a second run with 0 API calls.

---

### B10: Verification & Sign-off
Run §11 in full. Capture `EXPLAIN (ANALYZE, BUFFERS)` output and the test report in the PR description.

---

## 7. Security & Multi-Tenancy Model

| Threat | Control |
|---|---|
| Cross-tenant read | Three layers (§3.3). FORCE RLS under a NOBYPASSRLS role. Startup role check. |
| Cross-tenant write | RLS `WITH CHECK`, plus the API team-vs-token check. |
| Tenant context leaking across pooled connections | Only transaction-local `set_config(..., true)`; never a session-level `SET`. |
| SQL injection via filters | Whitelisted fragments, all values bound. `metadata_filter` is validated against an allowed key set and JSON-scalar values. |
| Cross-tenant inference via the dedup cache | Vector reuse scoped to `team_id`. Hashes are never compared across teams. |
| Prompt injection stored in chunks | Out of scope today (handled at generation, Day 58). Chunks are stored verbatim and flagged as untrusted content in the downstream contract. |
| PII in logs | Never log `chunk_text` or vectors. Log ids, counts and hashes (truncated to 12 characters). |
| Data erasure (GDPR/DSR) | `DELETE /embeddings/source` and team cascade. Erasure is verified by a test. Embeddings count as personal data derived from transcripts. |
| Service credentials | DB credentials and the OpenAI key come from a secret manager. Rotation is documented. Least-privilege grants. |

---

## 8. Reliability, Idempotency & Failure Handling

| Failure | Behavior |
|---|---|
| OpenAI 429 / 5xx / timeout | Backoff with jitter, honor Retry-After, circuit breaker. After retries, the batch is marked failed and the other batches proceed. The caller sees partial success in `UpsertResult`. |
| OpenAI 400 (bad input) | No retry. The chunk is marked failed with the reason. |
| Wrong vector dimension or NaN | Batch rejected, alert metric incremented (this indicates a model or config mismatch). |
| DB transient error | Retry the transaction up to 3 times (serialization or connection errors only). |
| Pod crash mid-upsert | The transaction rolls back. A caller retry with the same Idempotency-Key, plus the identity upsert, gives no duplicates. |
| Pod crash mid-backfill | Heartbeat expires, the reaper re-queues, and the job resumes from its cursor. |
| Concurrent re-processing of one meeting | Advisory lock per source. |
| Model upgrade | New `model_name` → hashes differ → the re-embed path is natural. Search filters `model_name = current`, so mixed vector spaces are never compared. |

**Ordering note for the Node.js caller:** the meeting is saved first, then embeddings are requested. If embedding fails, the meeting still exists without RAG coverage. A nightly reconciliation job (Day 57+ backlog) finds sources with no embeddings and enqueues them. Document this as the eventual-consistency contract.

---

## 9. Observability

**Metrics** (Prometheus or OTel, labels: `source_type`, `outcome`, never `team_id` on high-cardinality series):
- `embedding_api_calls_total`, `embedding_api_latency_seconds` (histogram), `embedding_tokens_total`, `embedding_cost_usd_total`
- `embedding_chunks_total{outcome=embedded|reused|unchanged|failed}`, so the **cache hit ratio** is derivable
- `embedding_truncations_total`, `embedding_validation_failures_total`
- `vector_search_latency_seconds`, `vector_search_results_returned`, `vector_search_underfill_total`
- `embedding_jobs_active`, `embedding_job_duration_seconds`

**Tracing:** span tree `embed_chunks → diff_query → embed_batch[n] → openai.embeddings → vector_store.upsert`, carrying the `request_id` from Node.js.

**Logs:** structured JSON with `request_id, team_id, job_id, counts, cost, duration`. No content.

**Alerts (initial):** validation failures > 0, embedding error rate > 5% over 10 minutes, search p95 > 300 ms, under-fill rate > 10%, a job with no heartbeat for more than 10 minutes.

---

## 10. Capacity, Performance & Cost Model

**Storage per row** ≈ 6.1 KB vector + about 1 KB text and metadata ≈ 7–8 KB. The HNSW index adds roughly the vector size again plus graph links (about 1.5–2× the vector size in total).

| Rows | Table (approx.) | HNSW (approx.) | Note |
|---|---|---|---|
| 100k | ~0.8 GB | ~1 GB | Fine on a small instance |
| 1M | ~8 GB | ~10 GB | Index should fit in RAM. Consider halfvec. |
| 10M | ~80 GB | ~100 GB | Revisit ADR-1 and ADR-6 |

**Volume estimate:** a 1-hour meeting is about 9–10k words, about 13k tokens, and about 30–40 chunks of roughly 400 tokens. Commitments, decisions and summaries add about 10–20 rows per meeting. So roughly **50 rows per meeting**.

**Cost:** embedding cost = total tokens × the current text-embedding-3-small price (pull it from the central pricing table and **verify against OpenAI's pricing page before backfill sign-off**). At that model's price tier, embedding is typically a negligible share of total AI cost compared with generation. The dry-run estimate is the source of truth.

**Latency targets (Day 56 baseline, measured in B10):**
- `similarity_search` p95 < 100 ms at 100k rows, top_k=20, ef_search=100.
- Upsert of a single meeting (about 50 chunks) end to end p95 < 3 s, dominated by OpenAI.

---

## 11. End-of-Day Test Plan

### 11.1 Unit (no network, no DB, < 10 s total)
- [ ] `compute_content_hash` is deterministic in-process and across processes, normalization-invariant, and model-sensitive.
- [ ] `truncate_to_tokens` stays ≤ the limit, never splits a word, and is safe for multi-byte text.
- [ ] `build_batches` preserves order and respects both item and token limits (property-based).
- [ ] `embed_batch` rejects a dimension ≠ 1536, NaN/Inf and non-normalized vectors.
- [ ] `embed_batch` truncates an overlong input, logs it, increments the metric and does not raise.
- [ ] `embed_chunks` classification: UNCHANGED / REUSE / EMBED counts exact. The OpenAI mock call count equals expected (strictly less than the chunk total).
- [ ] `embed_chunks` in-request duplicate text is embedded once.
- [ ] `embed_chunks` partial batch failure: the others persist and `failed_count` is correct.
- [ ] `embed_chunks` mixed team_ids in one request raises a validation error.
- [ ] `similarity_search` SQL shape: the `team_id = $1` predicate is inside the statement, `ORDER BY` uses `<=>`, and every value is a bound parameter (asserted on the captured SQL + args from a fake connection).
- [ ] `generate_embeddings` reorders by `index`, retry policy works and cost is computed.
- [ ] Enum ↔ migration CHECK parity.
- [ ] Chunker adapter mapping and contiguous indices.

### 11.2 Integration (Postgres + pgvector container or a Supabase branch; deterministic vectors)
- [ ] **Migration:** up/down/up clean. Table, constraints, HNSW index, `relrowsecurity` and `relforcerowsecurity` both true.
- [ ] **Fail closed:** as `vocaply_ai_app` with no tenant set, `SELECT` returns 0 rows with data present.
- [ ] **Upsert + search:** 10 chunks for team A, search as A returns ≤ 10 results, all scores in [0, 1], ranked by descending score.
- [ ] **Exact match:** querying with chunk #3's exact vector returns chunk #3 at rank 1 with similarity ≈ 1.0.
- [ ] **Idempotency:** the same 10 chunks twice gives a second run of `upserted=0, updated=0, unchanged=10`, with 0 mocked API calls.
- [ ] **Change detection:** editing 1 chunk's text gives `updated=1`, and `updated_at` advances via the trigger.
- [ ] **Replace semantics:** 40 → 35 chunks gives `deleted_orphans=5`.
- [ ] **Same text, different meetings:** two rows exist with separate citations. Deleting meeting A leaves meeting B's row intact (validates the fix for defect #5).
- [ ] **Filters:** source_type, meeting_id (metadata containment), date range and source_ids each narrow results correctly.

### 11.3 Security (P0, blocking)
- [ ] Team A and team B have overlapping content. A search as A **never** returns B's rows, across 100 randomized queries.
- [ ] Context set to A with an explicit SQL `WHERE team_id = B` returns 0 rows (RLS overrides the query).
- [ ] As A, an INSERT with `team_id = B` raises an RLS violation.
- [ ] Pool leak test: transaction 1 sets A, then transaction 2 on the **same connection** with no context returns 0 rows.
- [ ] Vector reuse never crosses teams: identical text in A and B means B still triggers its own embedding (mock call count).
- [ ] Startup with a BYPASSRLS role makes the service refuse to start.
- [ ] API: token team ≠ body team returns 403.

### 11.4 Performance & index verification
- [ ] Seed 50k deterministic vectors. `EXPLAIN (ANALYZE, BUFFERS)` of the search shows **`Index Scan using idx_embeddings_hnsw`**, not a Seq Scan.
- [ ] Negative control: ordering by `1 - distance DESC` shows a Seq Scan (documents why the rule exists).
- [ ] Filtered under-fill check: a small tenant (500 rows) inside 50k rows with top_k=20 returns 20 results with iterative scan on. Record the result with it off.
- [ ] p95 latency of 200 searches recorded in the PR.

### 11.5 End to end (one live OpenAI call, gated by an env flag in CI)
- [ ] A cleaned transcript fixture → Day 48 chunker → adapter → `embed_chunks` → `similarity_search` with a paraphrased question returns the correct chunk in the top 3, and `CostRecord` is non-zero.

### 11.6 Definition-of-Done sign-off
- [ ] All P0 security tests green.
- [ ] HNSW EXPLAIN captured.
- [ ] E2E green.
- [ ] Coverage ≥ 90% on `rag/` (branches included).
- [ ] Lint, type-check (mypy strict on `rag/` and `models/`) and the migration review approved.
- [ ] Runbook updated: backfill, index rebuild, model-upgrade procedure, erasure.

---

## 12. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| RLS bypassed via a privileged role | Med | Critical | FORCE RLS, dedicated role, startup assertion, P0 tests |
| Filtered HNSW under-fill for small tenants | High (at scale) | High (bad answers) | Iterative scan, under-fill metric, ADR-6 partition plan |
| Backfill cost overrun | Low | Med | Mandatory dry-run estimate, TPM budget, `--since` |
| Index outgrows RAM | Med (12–18 months) | High latency | halfvec path (ADR-3), capacity alert at 50% of RAM |
| Model deprecation | Med | High | `model_name` column, hash includes model, documented re-embed procedure |
| Pooler breaks prepared statements | High if unaddressed | Outage | `statement_cache_size=0`, direct connection for batch work |
| Ghost chunks after re-processing | High if unaddressed | Wrong citations | Replace semantics + orphan delete |
| Embedding/meeting inconsistency | Med | Missing RAG coverage | Idempotent retry + nightly reconciliation (backlog) |

---

## 13. Handoff Contract to Day 57

Day 57 (retriever + re-ranking) may rely on:
- `similarity_search(VectorSearchQuery) → list[VectorSearchResult]`, ranked by descending similarity, tenant-safe, at most `top_k` results, current model only.
- `VectorSearchResult` carries everything needed for citations: `source_type, source_id, chunk_index, chunk_text, metadata.start_time/end_time/meeting_id/speaker_name, source_date`.
- Query embedding must use the **same** `EMBEDDING_MODEL` (expose `embed_query(text)` with an LRU or Redis cache keyed by hash).
- Known limitation to handle on Day 57: no keyword/BM25 yet (hybrid retrieval later). Similarity scores are not calibrated across query types, so use re-rank scores, not raw cosine, for thresholds.

---

## 14. Explicitly Out of Scope (Day 56)
- Re-ranking, hybrid BM25 search, query rewriting (Day 57)
- Prompt assembly, generation, citations UI (Days 58–59)
- Retrieval evaluation set and recall@k benchmarking (Day 60)
- halfvec migration, partitioning (triggered by ADR thresholds)
- Nightly reconciliation job (backlog ticket filed today)
