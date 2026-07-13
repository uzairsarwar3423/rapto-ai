-- ─────────────────────────────────────────────────────────────────────────────
-- Day 59 Migration: action_items.linked_commitment_id (Path B)
--
-- PURPOSE:
--   Adds the nullable FK column linking an action item back to the commitment
--   it was co-extracted from (e.g. "I'll take care of the payment bug" →
--   both a commitment AND an action item). The jira-sync.service.ts cascade
--   (§14) reads this column to automatically fulfil the linked commitment when
--   the Jira ticket is marked Done.
--
-- SAFETY:
--   • Column is nullable  → zero-downtime, no existing rows affected
--   • ON DELETE SET NULL  → safe, no cascade deletes on the commitment side
--   • Standard additive migration per DB-SCHEMA-001 §13 "backward-compatible first"
--
-- UNIQUE INDEX on jira_issue_id (PARTIAL):
--   • idx_ai_jira_issue enforces uniqueness only for non-NULL jira_issue_id rows
--   • This is the lookup index used by findByJiraIssueId() in the reverse-sync
--     handler — sub-millisecond point lookup regardless of total action_items rows
--   • Was purpose-built anticipating today's access pattern (Day 58 § schema note)
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: add the nullable FK column
ALTER TABLE "action_items"
  ADD COLUMN "linkedCommitmentId" TEXT;

-- Step 2: add the FK constraint (deferred to avoid ordering issues)
ALTER TABLE "action_items"
  ADD CONSTRAINT "action_items_linkedCommitmentId_fkey"
  FOREIGN KEY ("linkedCommitmentId")
  REFERENCES "commitments"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- Step 3: unique partial index on jiraIssueId (WHERE NOT NULL)
--   Mirrors the idx_ai_jira_issue described in Day 59 §5 and §11.
--   Prisma @@unique([jiraIssueId]) maps to "action_items_jiraIssueId_key"
--   but the partial version gives us EXACTLY what the plan specified:
--   fast, unique lookups without polluting the index with NULL rows.
CREATE UNIQUE INDEX "action_items_jiraIssueId_key"
  ON "action_items" ("jiraIssueId")
  WHERE "jiraIssueId" IS NOT NULL;
