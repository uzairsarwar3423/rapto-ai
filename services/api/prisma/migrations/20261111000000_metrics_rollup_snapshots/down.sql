-- Manual rollback for 20261111000000_metrics_rollup_snapshots (NOT executed by Prisma).
-- Data in subscription_daily_snapshots is lost; platform_metrics_daily rows keep everything else.
DROP INDEX IF EXISTS "idx_teams_created_id";
DROP INDEX IF EXISTS "idx_users_created_id";
DROP INDEX IF EXISTS "idx_teams_name_trgm";
DROP INDEX IF EXISTS "idx_users_email_trgm";
DROP INDEX IF EXISTS "idx_users_name_trgm";
DROP TABLE IF EXISTS "subscription_daily_snapshots";
DROP TYPE IF EXISTS "SnapshotSource";
ALTER TABLE IF EXISTS "platform_metrics_daily" DROP COLUMN IF EXISTS "dailyRevenueCents";
