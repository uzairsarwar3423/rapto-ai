-- Reverses 001. The `vector` extension and the `rag` schema are KEPT on purpose:
-- other objects may depend on them, and the migration runner's tracking table
-- lives in `rag`. The runtime role is kept too (it may own live sessions);
-- only its grants are removed.
DROP TRIGGER  IF EXISTS trg_embeddings_updated_at ON rag.embeddings;
DROP POLICY   IF EXISTS embeddings_tenant_isolation ON rag.embeddings;
DROP TABLE    IF EXISTS rag.embeddings;               -- indexes go with the table
DROP FUNCTION IF EXISTS rag.set_updated_at();

DO $$
DECLARE ns text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vocaply_ai_app') THEN
    SELECT n.nspname INTO ns
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'vector';
    IF ns IS NOT NULL THEN
      EXECUTE format('REVOKE USAGE ON SCHEMA %I FROM vocaply_ai_app', ns);
    END IF;
    REVOKE ALL ON SCHEMA rag FROM vocaply_ai_app;
  END IF;
END $$;
