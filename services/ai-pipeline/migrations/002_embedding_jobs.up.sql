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
