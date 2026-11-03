-- MANUAL ROLLBACK for 20260901000100_paddle_billing_schema_and_webhook_inbox (Prisma does not run this file).
-- Only objects introduced by THIS release are removed. The Paddle columns / refunds / billing_audit_logs
-- pre-date this release in databases built with `db push` and hold billing history: they are NOT dropped.
-- Run inside a transaction and take a backup first.
BEGIN;
DROP TABLE IF EXISTS "paddle_webhook_events";
DROP INDEX IF EXISTS "subscriptions_status_trialEnd_idx";
DROP INDEX IF EXISTS "subscriptions_cancelAtPeriodEnd_currentPeriodEnd_idx";
DROP INDEX IF EXISTS "teams_gracePeriodEnd_idx";
ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "lastEventOccurredAt";
ALTER TABLE "refunds" DROP COLUMN IF EXISTS "action";
COMMIT;
-- Enum values added by 20260901000000_billing_enum_values cannot be removed from a PostgreSQL enum; they are harmless.
