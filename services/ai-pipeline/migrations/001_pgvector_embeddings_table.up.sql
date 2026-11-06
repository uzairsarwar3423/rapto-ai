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
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vocaply_ai_app') THEN
    CREATE ROLE vocaply_ai_app LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  ELSE
    ALTER ROLE vocaply_ai_app NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
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
