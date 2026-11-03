-- ─────────────────────────────────────────────────────────────────────────────
-- Paddle billing schema reconciliation + durable webhook inbox
--
-- WHY: schema.prisma carried the Paddle billing model (paddle* columns, refunds,
-- billing_audit_logs, teams.gracePeriodEnd, ...) but no migration ever created it
-- (the init migration only has Stripe columns). Databases were evolved with
-- `prisma db push`, so a database rebuilt with `prisma migrate deploy` could not run billing.
--
-- SAFETY:
--   * Fully idempotent (IF NOT EXISTS / catalog checks). On a database that already has the
--     Paddle columns (db push) every statement is a no-op.
--   * Additive only. No column, table, row or index with data is dropped or rewritten.
--     Legacy Stripe columns are KEPT and merely relaxed to NULLABLE so Paddle rows can be inserted.
--   * Paddle NOT NULL constraints are applied only if no existing row would violate them.
-- ROLLBACK: see down.sql next to this file (manual, not executed by Prisma).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── teams ────────────────────────────────────────────────────────────────────
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "paddleCustomerId" TEXT;
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "gracePeriodEnd" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "teams_paddleCustomerId_idx" ON "teams"("paddleCustomerId");
CREATE INDEX IF NOT EXISTS "teams_gracePeriodEnd_idx" ON "teams"("gracePeriodEnd");

-- ── subscriptions ────────────────────────────────────────────────────────────
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "paddleSubscriptionId" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "paddleCustomerId" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "paddlePriceId" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "lastEventOccurredAt" TIMESTAMP(3);

-- Relax legacy Stripe NOT NULL constraints (columns and data are preserved).
DO $$
DECLARE col TEXT;
BEGIN
  FOREACH col IN ARRAY ARRAY['stripeSubscriptionId', 'stripeCustomerId'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = current_schema() AND table_name = 'subscriptions' AND column_name = col) THEN
      EXECUTE format('ALTER TABLE "subscriptions" ALTER COLUMN %I DROP NOT NULL', col);
    END IF;
  END LOOP;
  FOREACH col IN ARRAY ARRAY['stripeInvoiceId', 'stripeCustomerId'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = current_schema() AND table_name = 'invoices' AND column_name = col) THEN
      EXECUTE format('ALTER TABLE "invoices" ALTER COLUMN %I DROP NOT NULL', col);
    END IF;
  END LOOP;
END $$;

-- Enforce NOT NULL on the Paddle identifiers only when it is safe to do so.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "subscriptions" WHERE "paddleSubscriptionId" IS NULL) THEN
    ALTER TABLE "subscriptions" ALTER COLUMN "paddleSubscriptionId" SET NOT NULL;
  ELSE
    RAISE NOTICE 'subscriptions.paddleSubscriptionId left nullable: legacy rows without a Paddle id exist';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "subscriptions" WHERE "paddleCustomerId" IS NULL) THEN
    ALTER TABLE "subscriptions" ALTER COLUMN "paddleCustomerId" SET NOT NULL;
  ELSE
    RAISE NOTICE 'subscriptions.paddleCustomerId left nullable: legacy rows without a Paddle id exist';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_paddleSubscriptionId_key" ON "subscriptions"("paddleSubscriptionId");
CREATE INDEX IF NOT EXISTS "subscriptions_paddleCustomerId_idx" ON "subscriptions"("paddleCustomerId");
CREATE INDEX IF NOT EXISTS "subscriptions_plan_idx" ON "subscriptions"("plan");
CREATE INDEX IF NOT EXISTS "subscriptions_status_trialEnd_idx" ON "subscriptions"("status", "trialEnd");
CREATE INDEX IF NOT EXISTS "subscriptions_cancelAtPeriodEnd_currentPeriodEnd_idx" ON "subscriptions"("cancelAtPeriodEnd", "currentPeriodEnd");

-- ── invoices ─────────────────────────────────────────────────────────────────
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "paddleTransactionId" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "paddleCustomerId" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "amountRefunded" INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "invoices" WHERE "paddleTransactionId" IS NULL) THEN
    ALTER TABLE "invoices" ALTER COLUMN "paddleTransactionId" SET NOT NULL;
  ELSE
    RAISE NOTICE 'invoices.paddleTransactionId left nullable: legacy rows without a Paddle id exist';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "invoices" WHERE "paddleCustomerId" IS NULL) THEN
    ALTER TABLE "invoices" ALTER COLUMN "paddleCustomerId" SET NOT NULL;
  ELSE
    RAISE NOTICE 'invoices.paddleCustomerId left nullable: legacy rows without a Paddle id exist';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "invoices_paddleTransactionId_key" ON "invoices"("paddleTransactionId");

-- ── refunds ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "refunds" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "paddleAdjustmentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "reason" TEXT,
    "action" TEXT NOT NULL DEFAULT 'refund',
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "refunds" ADD COLUMN IF NOT EXISTS "action" TEXT NOT NULL DEFAULT 'refund';
CREATE UNIQUE INDEX IF NOT EXISTS "refunds_paddleAdjustmentId_key" ON "refunds"("paddleAdjustmentId");
CREATE INDEX IF NOT EXISTS "refunds_teamId_idx" ON "refunds"("teamId");

-- ── billing_audit_logs ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "billing_audit_logs" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "eventId" TEXT,
    "eventType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "billing_audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "billing_audit_logs_eventId_key" ON "billing_audit_logs"("eventId");
CREATE INDEX IF NOT EXISTS "billing_audit_logs_teamId_createdAt_idx" ON "billing_audit_logs"("teamId", "createdAt" DESC);

-- ── paddle_webhook_events (durable inbox) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS "paddle_webhook_events" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "teamId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "paddle_webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "paddle_webhook_events_eventId_key" ON "paddle_webhook_events"("eventId");
CREATE INDEX IF NOT EXISTS "paddle_webhook_events_status_receivedAt_idx" ON "paddle_webhook_events"("status", "receivedAt");
CREATE INDEX IF NOT EXISTS "paddle_webhook_events_teamId_idx" ON "paddle_webhook_events"("teamId");

-- ── foreign keys (added only when absent) ────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_teamId_fkey') THEN
    ALTER TABLE "refunds" ADD CONSTRAINT "refunds_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_invoiceId_fkey') THEN
    ALTER TABLE "refunds" ADD CONSTRAINT "refunds_invoiceId_fkey"
      FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_audit_logs_teamId_fkey') THEN
    ALTER TABLE "billing_audit_logs" ADD CONSTRAINT "billing_audit_logs_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
