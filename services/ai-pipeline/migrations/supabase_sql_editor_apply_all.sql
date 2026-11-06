-- ═══════════════════════════════════════════════════════════════════════════════
-- RAG schema: migrations 001 + 002 + 003 in ONE script, for the Supabase SQL Editor.
--
-- RUN ONCE, as the default `postgres` role of a project that already has the Prisma tables
-- (public.teams, public.meetings, public.users). It is atomic: if any statement fails, nothing is kept.
-- It records the migrations in rag.schema_migrations so `python -m src.rag.migrate status` agrees.
-- Afterwards set the runtime role's password yourself (this script never contains a secret):
--     ALTER ROLE vocaply_ai_app PASSWORD '<strong secret>';
-- ═══════════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL search_path = rag, extensions, public;

CREATE SCHEMA IF NOT EXISTS rag;
CREATE TABLE IF NOT EXISTS rag.schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());

-- ───────── 001_pgvector_embeddings_table ─────────
-- ─────────────────────────────────────────────────────────────────────────────
-- 001 · RAG embeddings table (Day 56)
--
-- Applied by `python -m src.rag.migrate up` as an ADMIN/OWNER role (never as the
-- runtime role). The runner sets:  SET LOCAL search_path = rag, extensions, public
--
-- DESIGN NOTES (see DAY_56_RAG_Infrastructure_Plan.md §2/§4 and docs/RAG_RUNBOOK.md):
--  * Own schema `rag`, so Prisma (which only manages `public`) never sees these
--    objects as drift when running `prisma migrate dev`.
--  * team_id / source_id are TEXT, not uuid: the platform uses Prisma cuid() ids.
--  * Row identity = (team_id, source_type, source_id, chunk_index).
--    content_hash is a change-detection + embedding-cost cache key, NOT identity.
--  * FORCE ROW LEVEL SECURITY + a dedicated NOBYPASSRLS role; the policy has both
--    USING and WITH CHECK; a missing tenant setting fails CLOSED (0 rows).
--  * ADR-3 upgrade path (halfvec): when the HNSW index exceeds ~50% of RAM add
--      CREATE INDEX CONCURRENTLY ... USING hnsw ((embedding::halfvec(1536)) halfvec_cosine_ops)
--    and query with `embedding::halfvec(1536) <=> $q::halfvec(1536)`.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS rag;

-- pgvector: honour the Supabase convention (schema `extensions`) when it exists.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
      CREATE EXTENSION vector WITH SCHEMA extensions;
    ELSE
      -- Explicit schema: without it the extension would land in the FIRST schema
      -- of the runner's search_path (= rag), which is wrong.
      CREATE EXTENSION vector WITH SCHEMA public;
    END IF;
  END IF;
END $$;

-- hnsw.iterative_scan (filtered-ANN recall, ADR-6) needs pgvector >= 0.8.0.
DO $$
DECLARE v text;
BEGIN
  SELECT extversion INTO v FROM pg_extension WHERE extname = 'vector';
  IF string_to_array(split_part(v, '-', 1), '.')::int[] < ARRAY[0, 8, 0] THEN
    RAISE WARNING 'pgvector % < 0.8.0: iterative scan unavailable; filtered searches may under-fill (ADR-6).', v;
  END IF;
END $$;

-- Runtime role. No password here: set it out-of-band (RAG_APP_ROLE_PASSWORD or ALTER ROLE).
-- RE-RUN SAFE for a non-superuser owner (Supabase's `postgres`): an ALTER ROLE that merely MENTIONS
-- SUPERUSER/NOSUPERUSER needs superuser on PG16+, so an existing role is VERIFIED, never altered.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vocaply_ai_app') THEN
    CREATE ROLE vocaply_ai_app LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  ELSIF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vocaply_ai_app'
                AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb)) THEN
    RAISE EXCEPTION 'role vocaply_ai_app already exists with elevated attributes (SUPERUSER/BYPASSRLS/CREATEROLE/CREATEDB); fix or drop it first, row level security would not apply';
  END IF;
END $$;

CREATE TABLE rag.embeddings (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       text         NOT NULL REFERENCES public.teams (id) ON DELETE CASCADE,
  source_type   text         NOT NULL
                CHECK (source_type IN ('transcript_chunk','commitment','action_item','decision','summary','digest')),
  source_id     text         NOT NULL CHECK (length(source_id) BETWEEN 1 AND 64),
  chunk_index   smallint     NOT NULL DEFAULT 0 CHECK (chunk_index >= 0),
  chunk_text    text         NOT NULL CHECK (length(chunk_text) BETWEEN 1 AND 40000),
  content_hash  char(64)     NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  embedding     vector(1536) NOT NULL,
  model_name    text         NOT NULL DEFAULT 'text-embedding-3-small',
  source_date   date,
  token_count   integer      CHECK (token_count IS NULL OR token_count >= 0),
  metadata      jsonb        NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT uq_embeddings_identity UNIQUE (team_id, source_type, source_id, chunk_index)
);

-- Vector-reuse lookup (same team + same content hash).
CREATE INDEX idx_embeddings_team_hash      ON rag.embeddings (team_id, content_hash);
-- Filtered queries / date range scans.
CREATE INDEX idx_embeddings_team_type_date ON rag.embeddings (team_id, source_type, source_date);
-- `@>` containment filters (meeting_id, speaker, ...).
CREATE INDEX idx_embeddings_metadata_gin   ON rag.embeddings USING gin (metadata jsonb_path_ops);
-- ANN index (ADR-2). m=16 / ef_construction=64 = pgvector defaults.
CREATE INDEX idx_embeddings_hnsw           ON rag.embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
-- NOT created, on purpose (deviation from the plan, documented in docs/RAG_RUNBOOK.md):
--  * standalone (team_id): covered by the leading column of every composite above.
--  * (source_type, source_id): delete-by-source always has team_id in the predicate,
--    so the UNIQUE index (team_id, source_type, source_id, ...) already serves it.

-- updated_at trigger lives in schema rag so it can never clobber a shared helper.
CREATE FUNCTION rag.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

CREATE TRIGGER trg_embeddings_updated_at
  BEFORE UPDATE ON rag.embeddings
  FOR EACH ROW EXECUTE FUNCTION rag.set_updated_at();

-- Row level security: fail closed, FORCEd so the table owner is not exempt either.
ALTER TABLE rag.embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag.embeddings FORCE  ROW LEVEL SECURITY;

CREATE POLICY embeddings_tenant_isolation ON rag.embeddings
  FOR ALL TO vocaply_ai_app
  USING      (team_id = NULLIF(current_setting('app.current_team_id', true), ''))
  WITH CHECK (team_id = NULLIF(current_setting('app.current_team_id', true), ''));

-- Least privilege: this role touches nothing else.
GRANT USAGE ON SCHEMA rag TO vocaply_ai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON rag.embeddings TO vocaply_ai_app;

-- The role must resolve the `vector` type and its operators.
DO $$
DECLARE ns text;
BEGIN
  SELECT n.nspname INTO ns
  FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'vector';
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO vocaply_ai_app', ns);
END $$;

ANALYZE rag.embeddings;
INSERT INTO rag.schema_migrations (version) VALUES ('001_pgvector_embeddings_table') ON CONFLICT DO NOTHING;

-- ───────── 002_embedding_jobs ─────────
-- ─────────────────────────────────────────────────────────────────────────────
-- 002 · Backfill job tracking (Day 56)
--
-- Difference from "identical RLS to embeddings" in the plan:
--  A worker has to find the next queued job ACROSS teams. Under FORCE RLS that
--  is impossible for the tenant-scoped runtime role, and giving the role a
--  bypass would defeat the point of RLS. So:
--    * RLS is ENABLED (not FORCEd) on this table: the tenant-scoped role sees
--      only its own team's jobs; the table owner (migration role) is exempt.
--    * Two SECURITY DEFINER functions (owned by the migration role) are the
--      ONLY cross-tenant surface: claim_next_embedding_job() and
--      requeue_stale_embedding_jobs(). Both pin search_path and expose only
--      what a worker needs.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE rag.embedding_jobs (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id           text          NOT NULL REFERENCES public.teams (id) ON DELETE CASCADE,
  source_types      text[]        NOT NULL CHECK (cardinality(source_types) >= 1),
  since             date,
  status            text          NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  cursor            jsonb         NOT NULL DEFAULT '{}'::jsonb,
  total_sources     integer       CHECK (total_sources IS NULL OR total_sources >= 0),
  processed_sources integer       NOT NULL DEFAULT 0,
  upserted          integer       NOT NULL DEFAULT 0,
  reused            integer       NOT NULL DEFAULT 0,
  skipped           integer       NOT NULL DEFAULT 0,
  failed            integer       NOT NULL DEFAULT 0,
  cost_usd          numeric(12,6) NOT NULL DEFAULT 0,
  error             text,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  started_at        timestamptz,
  finished_at       timestamptz,
  heartbeat_at      timestamptz,
  created_by        text
);

-- At most ONE active backfill per team (queued or running).
CREATE UNIQUE INDEX uq_embedding_jobs_active_team
  ON rag.embedding_jobs (team_id) WHERE status IN ('queued', 'running');
CREATE INDEX idx_embedding_jobs_claim
  ON rag.embedding_jobs (created_at) WHERE status = 'queued';

ALTER TABLE rag.embedding_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY embedding_jobs_tenant_isolation ON rag.embedding_jobs
  FOR ALL TO vocaply_ai_app
  USING      (team_id = NULLIF(current_setting('app.current_team_id', true), ''))
  WITH CHECK (team_id = NULLIF(current_setting('app.current_team_id', true), ''));

GRANT SELECT, INSERT, UPDATE ON rag.embedding_jobs TO vocaply_ai_app;

CREATE FUNCTION rag.claim_next_embedding_job()
RETURNS TABLE (job_id uuid, job_team_id text)
LANGUAGE sql SECURITY DEFINER SET search_path = rag, pg_catalog
AS $$
  UPDATE rag.embedding_jobs j
     SET status = 'running',
         started_at = COALESCE(j.started_at, now()),
         heartbeat_at = now()
   WHERE j.id = (SELECT q.id FROM rag.embedding_jobs q
                  WHERE q.status = 'queued'
                  ORDER BY q.created_at
                  FOR UPDATE SKIP LOCKED
                  LIMIT 1)
  RETURNING j.id, j.team_id;
$$;

CREATE FUNCTION rag.requeue_stale_embedding_jobs(max_age interval)
RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = rag, pg_catalog
AS $$
  WITH moved AS (
    UPDATE rag.embedding_jobs
       SET status = 'queued', heartbeat_at = NULL
     WHERE status = 'running' AND heartbeat_at < now() - max_age
    RETURNING 1)
  SELECT count(*)::int FROM moved;
$$;

REVOKE ALL ON FUNCTION rag.claim_next_embedding_job()             FROM PUBLIC;
REVOKE ALL ON FUNCTION rag.requeue_stale_embedding_jobs(interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rag.claim_next_embedding_job()             TO vocaply_ai_app;
GRANT EXECUTE ON FUNCTION rag.requeue_stale_embedding_jobs(interval) TO vocaply_ai_app;
INSERT INTO rag.schema_migrations (version) VALUES ('002_embedding_jobs') ON CONFLICT DO NOTHING;

-- ───────── 003_embeddings_fulltext_and_source_context ─────────
-- ─────────────────────────────────────────────────────────────────────────────
-- 003 · Lexical leg + source-context view (Day 57)
--
--  * `chunk_tsv`: GENERATED ... STORED, so Postgres maintains it and it can never
--    drift from chunk_text. `simple` config = no stemming, no stop words:
--    language-neutral and safe for names and Roman Urdu. Stop words are removed
--    in the application (versioned list), see ADR-2.
--    NOTE: adding a STORED generated column rewrites the table. Cheap today; on a
--    large table schedule it off-peak.
--  * Plain GIN index. A composite (team_id, tsv) via btree_gin was evaluated: it
--    needs an extra extension and the planner already combines this GIN index
--    with the team_id btree through a bitmap AND. Revisit if EXPLAIN shows otherwise.
--  * `v_rag_source_context`: the ONLY way the runtime role reads core tables.
--    Column allow-list, tenant predicate on app.current_team_id (fail closed),
--    security_barrier so a caller-supplied function can never see rows the
--    predicate would filter out. The role gets SELECT on the view, nothing else.
--    The view runs with its OWNER's rights, so no grant on public.* is needed.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.meetings') IS NULL OR to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'public.meetings and public.users must exist (apply the Prisma migrations first)';
  END IF;
END $$;

ALTER TABLE rag.embeddings
  ADD COLUMN chunk_tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', chunk_text)) STORED;

CREATE INDEX idx_embeddings_chunk_tsv ON rag.embeddings USING gin (chunk_tsv);

CREATE VIEW rag.v_rag_source_context WITH (security_barrier = true) AS
  SELECT 'meeting'::text              AS kind,
         m.id                         AS ref_id,
         m."teamId"                   AS team_id,
         m.title                      AS label,
         m."scheduledAt"              AS at,
         m.status::text               AS status
    FROM public.meetings m
   WHERE m."teamId" = NULLIF(current_setting('app.current_team_id', true), '')
  UNION ALL
  SELECT 'user'::text,
         u.id,
         u."teamId",
         u.name,
         NULL::timestamptz,
         NULL::text
    FROM public.users u
   WHERE u."teamId" = NULLIF(current_setting('app.current_team_id', true), '')
     AND u."deletedAt" IS NULL;

REVOKE ALL ON rag.v_rag_source_context FROM PUBLIC;
GRANT SELECT ON rag.v_rag_source_context TO vocaply_ai_app;

ANALYZE rag.embeddings;
INSERT INTO rag.schema_migrations (version) VALUES ('003_embeddings_fulltext_and_source_context') ON CONFLICT DO NOTHING;

COMMIT;
