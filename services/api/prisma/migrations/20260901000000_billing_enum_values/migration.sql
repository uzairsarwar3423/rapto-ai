-- Billing enum values that exist in schema.prisma but were never migrated.
-- Idempotent: safe on databases that already received them through `prisma db push`.
-- Kept in its own migration because a new enum value cannot be used in the same transaction that adds it.
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'refunded';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PAYMENT_SUCCESS';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_UPGRADED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_CANCELLED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TRIAL_STARTED';
