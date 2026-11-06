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
