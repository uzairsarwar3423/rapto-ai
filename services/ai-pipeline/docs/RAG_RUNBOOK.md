# RAG infrastructure — runbook (Day 56)

Write path (`chunk → hash → diff → embed → store`) and the raw read path
(`query vector → top-K`) on Postgres + pgvector. Plan: `DAY_56_RAG_Infrastructure_Plan.md`.
RAG is **opt-in**: with `RAG_ENABLED=false` (default) nothing here connects anywhere.

## 1. Deviations from the plan (and why)

| Plan | Implemented | Reason |
|---|---|---|
| `team_id` / `source_id` `uuid` | `text` | The platform uses Prisma `cuid()` ids; a `uuid` column rejects every real id and `::uuid` casts fail. |
| Tables in `public`, "Supabase" | Schema **`rag`**; pgvector schema auto-detected | `prisma migrate dev` only manages `public`, so `rag.*` never shows up as drift. The DB here is a plain Postgres host, not Supabase. |
| Auth = per-request JWT with `team_id` | Shared `X-Internal-Service-Key` | That is the only auth this service has. Layer 1 of the 3-layer tenancy (token team == body team) is therefore the **Node API's** responsibility; layers 2 (explicit `team_id = $1`) and 3 (FORCE RLS) are enforced here. |
| `embedding_jobs` "RLS identical" | RLS **enabled, not forced** + two `SECURITY DEFINER` functions | A worker must find queued jobs across teams; the tenant role (correctly) cannot. Only `claim_next_embedding_job()` / `requeue_stale_embedding_jobs()` cross tenants. |
| Index `(source_type, source_id)` and standalone `(team_id)` | Not created | Covered by the leading columns of `uq_embeddings_identity`; extra indexes are pure write amplification on an HNSW table. |
| Change detection = `content_hash` only | hash **+ metadata + source_date** | Otherwise a retitled meeting would keep stale citation metadata forever. Metadata-only changes reuse the stored vector (no API call). |
| Vectors as `vector[]` in `unnest` | `text[]` + `::vector` | asyncpg turns a list of vectors into a multi-dimensional array and breaks the codec; text also works behind poolers. |
| Prometheus / OTel spans | Dependency-free registry at `GET /api/v1/embeddings/metrics`; structured logs | No metrics stack exists in this service. Swap `rag/metrics.py` when one does. |
| Circuit breaker around `generate_embeddings` | Not added | The Python client has no breaker today; bounded retries + the TPM bucket + the concurrency cap protect it. |

## 2. Enabling it

1. **Postgres must have pgvector.** `postgres:16-alpine` does **not**. Use a pgvector build.
   *Do not just swap the image on an existing volume*: alpine (musl) → debian (glibc) changes
   collation and can corrupt text indexes. Install the extension on the existing server, or
   dump/restore into a pgvector instance. The external host is untested — confirm first.
2. Apply Prisma migrations (so `public.teams` exists), then the RAG migrations **as the owner role**:
   ```
   RAG_ADMIN_DATABASE_URL=postgresql://owner:***@host/db \
   RAG_APP_ROLE_PASSWORD=<new strong secret> python -m src.rag.migrate up
   python -m src.rag.migrate status
   ```
3. Configure the service (see `.env.example`): `RAG_ENABLED=true`,
   `RAG_DATABASE_URL=postgresql://vocaply_ai_app:<secret>@host/db`.
   **Never** use the owner / `postgres` / `service_role` DSN here: startup aborts if the role is
   SUPERUSER or BYPASSRLS, if RLS is not FORCEd, or if the column is not `vector(1536)`.
4. Behind PgBouncer/Supavisor transaction mode set `RAG_DB_POOLED=true`.
5. `RAG_WORKER_ENABLED=true` on one or more pods runs the backfill worker.

## 3. Backfill

```
# always dry-run first: no API calls, prints sources / chunks / tokens / USD upper bound
python -m scripts.backfill_embeddings --team-id <id> --source-types transcript_chunk commitment decision --dry-run
python -m scripts.backfill_embeddings --team-id <id> --source-types transcript_chunk commitment decision
python -m scripts.backfill_embeddings --team-id <id> --resume-job <uuid>      # after Ctrl+C / crash
```
Use a **direct** (non-pooled) `RAG_DATABASE_URL` for large backfills. Commitments / decisions /
action items / summaries need `RAG_SOURCE_DATABASE_URL` (a **read-only** role on the app DB).
Sources > ~100k rows: `--rebuild-index` prints the drop-index → load → `CREATE INDEX CONCURRENTLY` procedure (ADR-7).
A job survives pod death: a heartbeat older than `RAG_JOB_HEARTBEAT_STALE_SECONDS` re-queues it and it
resumes from its cursor. One active job per team (second request → 409 with the existing job id).

## 4. Operations

* **Erasure / deletion:** `DELETE /api/v1/embeddings/source` (meeting or commitment deleted, GDPR). Team deletion cascades.
* **Model upgrade:** change `EMBEDDING_MODEL` + `vector(N)` via a migration, deploy, then backfill. Hashes include the
  model, so everything re-embeds; search filters `model_name = current`, so spaces never mix.
* **halfvec** (ADR-3): switch when the HNSW index exceeds ~50% of RAM (SQL sketched in migration 001).
* **Reconciliation:** the Node caller saves the meeting first, then requests embeddings; if that fails the meeting simply
  has no RAG coverage. A nightly "sources without embeddings" job is a backlog ticket (not built today).
* **Alerts to create:** `embedding_validation_failures_total > 0`; embedding error rate > 5%/10 min;
  `vector_search_latency_seconds` p95 > 300 ms; `vector_search_underfill_total` rate > 10%; job heartbeat > 10 min.
* **Rate limit:** `EMBEDDING_TPM_BUDGET` is per process → (org TPM × 0.8) / replicas.
* **Prisma drift:** none expected (schema `rag`). If a tool complains, exclude schema `rag`.

## 5. Tests

```
pytest tests/rag                      # 58 unit tests, no DB / network
docker run -d --name aip-pg -e POSTGRES_PASSWORD=pw -p 55433:5432 pgvector/pgvector:pg16
RAG_TEST_ADMIN_DSN=postgresql://postgres:pw@localhost:55433/postgres pytest tests/rag/integration
RAG_TEST_LARGE=1 ...                  # + 50k-vector EXPLAIN / under-fill / latency
RAG_LIVE_OPENAI=1 ...                 # + one real paid OpenAI retrieval check
```
The integration fixtures create and DROP a database named `rag_it_*` — only ever point them at a throwaway server.
