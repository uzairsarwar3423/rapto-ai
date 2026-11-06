-- AI Pipeline Upgrade (Phase 5): v3.1 enriched extraction fields.
-- Additive only: every column is nullable or has a constant default, so on
-- PostgreSQL 11+ each ALTER is a metadata-only change (no table rewrite) and
-- existing rows/readers are unaffected. Safe to apply before or after the
-- AI pipeline starts returning the new fields.

-- Decisions: reversibility + dissent
ALTER TABLE "decisions" ADD COLUMN IF NOT EXISTS "reversible" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "decisions" ADD COLUMN IF NOT EXISTS "dissent" TEXT;

-- Blockers: escalation + estimated unblock phrase
ALTER TABLE "blockers" ADD COLUMN IF NOT EXISTS "escalationFlag" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "blockers" ADD COLUMN IF NOT EXISTS "estimatedUnblockDate" TEXT;

-- Risks: probability + mitigation
ALTER TABLE "risks" ADD COLUMN IF NOT EXISTS "probability" TEXT NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE "risks" ADD COLUMN IF NOT EXISTS "mitigationMentioned" TEXT;
