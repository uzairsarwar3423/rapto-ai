-- Workspace slugs must be unique regardless of letter case.
--
-- teams.slug already has a UNIQUE index (teams_slug_key), which is case-SENSITIVE.
-- The application always writes lowercase slugs, but this functional index makes the
-- database itself reject "Uzair" when "uzair" exists — no matter which code path
-- (script, admin tool, future endpoint) performs the insert.
--
-- Fails loudly, before changing anything, if case-only duplicates already exist so they
-- can be resolved by hand instead of the index silently not being created.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "teams" GROUP BY lower("slug") HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'teams contains slugs that differ only by case; resolve them before applying this migration';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "teams_slug_lower_key" ON "teams" (lower("slug"));
