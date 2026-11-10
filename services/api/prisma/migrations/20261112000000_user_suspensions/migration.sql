-- ─────────────────────────────────────────────────────────────────────────────
-- Admin dashboard Day 6 — user_suspensions (read-side today, written by the Day 8 suspend/lift actions)
--
-- A user's STATUS is derived, never stored:  active suspension (liftedAt IS NULL) → SUSPENDED,
-- else emailVerified = false → UNVERIFIED, else ACTIVE. This table is the suspension history.
--
-- SAFETY:
--   * Fully idempotent (IF NOT EXISTS / catalog checks) and ADDITIVE ONLY.
--   * The admin_users table was created with `prisma db push` (no migration exists for it), so its foreign key is
--     added only when that table exists; on a fresh `migrate deploy` database the FK is skipped with a NOTICE.
-- ROLLBACK: see down.sql next to this file (manual, not executed by Prisma).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "user_suspensions" (
  "id"          TEXT         NOT NULL,
  "userId"      TEXT         NOT NULL,
  "reason"      TEXT         NOT NULL,
  "suspendedBy" TEXT         NOT NULL,
  "suspendedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "liftedAt"    TIMESTAMP(3),
  "liftedBy"    TEXT,
  "liftReason"  TEXT,
  CONSTRAINT "user_suspensions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "user_suspensions_userId_liftedAt_idx" ON "user_suspensions" ("userId", "liftedAt");

-- Exactly ONE active suspension per user. This is what makes Day 8's suspend race-safe:
-- two concurrent suspends → the second hits a unique violation → mapped to 409.
-- (A partial index — Prisma cannot express it in schema.prisma, so it lives here.)
CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_suspensions_active" ON "user_suspensions" ("userId") WHERE "liftedAt" IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_suspensions_userId_fkey') THEN
    ALTER TABLE "user_suspensions"
      ADD CONSTRAINT "user_suspensions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF to_regclass('public.admin_users') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_suspensions_suspendedBy_fkey') THEN
      ALTER TABLE "user_suspensions"
        ADD CONSTRAINT "user_suspensions_suspendedBy_fkey" FOREIGN KEY ("suspendedBy") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_suspensions_liftedBy_fkey') THEN
      ALTER TABLE "user_suspensions"
        ADD CONSTRAINT "user_suspensions_liftedBy_fkey" FOREIGN KEY ("liftedBy") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
  ELSE
    RAISE NOTICE 'admin_users not found — admin foreign keys on user_suspensions skipped';
  END IF;
END $$;
