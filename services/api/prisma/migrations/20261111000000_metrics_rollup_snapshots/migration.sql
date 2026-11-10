-- ─────────────────────────────────────────────────────────────────────────────
-- Admin dashboard Day 5 — metrics rollup engine + Users/Teams search indexes
--
--   1. platform_metrics_daily."dailyRevenueCents"   revenue collected on that UTC day (fixes cumulative-sum bug)
--   2. subscription_daily_snapshots                 one row per subscription per UTC day (MRR movement source)
--   3. pg_trgm + trigram indexes                    fast ILIKE '%term%' search for the Users / Teams lists
--   4. keyset-pagination indexes                    (createdAt DESC, id DESC) on users and teams
--
-- SAFETY:
--   * Fully idempotent (IF NOT EXISTS / catalog checks) and ADDITIVE ONLY — nothing is dropped or rewritten.
--   * The admin tables were originally created with `prisma db push` (no migration exists for them), so the
--     ALTER on platform_metrics_daily is guarded: on a database where that table does not exist yet it is skipped
--     and the column is created together with the table by whatever creates it.
--   * CREATE EXTENSION needs sufficient privileges. If it fails, the trigram indexes are skipped with a NOTICE and the
--     queries still work (sequential scan) — they just do not scale. Create the indexes CONCURRENTLY by hand on large
--     production tables (see the commented block at the bottom).
-- ROLLBACK: see down.sql next to this file (manual, not executed by Prisma).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. daily revenue column ──────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.platform_metrics_daily') IS NOT NULL THEN
    ALTER TABLE "platform_metrics_daily" ADD COLUMN IF NOT EXISTS "dailyRevenueCents" BIGINT NOT NULL DEFAULT 0;
  END IF;
END $$;

-- ── 2. subscription snapshots ────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SnapshotSource') THEN
    CREATE TYPE "SnapshotSource" AS ENUM ('LIVE', 'RECONSTRUCTED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "subscription_daily_snapshots" (
  "date"        DATE            NOT NULL,
  "teamId"      TEXT            NOT NULL,
  "plan"        TEXT            NOT NULL,
  "amountCents" INTEGER         NOT NULL,
  "status"      TEXT            NOT NULL,
  "source"      "SnapshotSource" NOT NULL DEFAULT 'LIVE',
  "capturedAt"  TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscription_daily_snapshots_pkey" PRIMARY KEY ("date", "teamId")
);

CREATE INDEX IF NOT EXISTS "subscription_daily_snapshots_teamId_date_idx"
  ON "subscription_daily_snapshots" ("teamId", "date");

-- ── 3. trigram search indexes ────────────────────────────────────────────────
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'pg_trgm not created (insufficient privilege) — trigram indexes skipped; ask a DBA to run CREATE EXTENSION pg_trgm';
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS "idx_users_name_trgm"  ON "users" USING gin (lower("name")  gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS "idx_users_email_trgm" ON "users" USING gin (lower("email") gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS "idx_teams_name_trgm"  ON "teams" USING gin (lower("name")  gin_trgm_ops);
  END IF;
END $$;

-- ── 4. keyset-pagination indexes ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "idx_users_created_id" ON "users" ("createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_teams_created_id" ON "teams" ("createdAt" DESC, "id" DESC);

-- Production note: on a large table build these outside a transaction instead, e.g.
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_users_created_id" ON "users" ("createdAt" DESC, "id" DESC);
