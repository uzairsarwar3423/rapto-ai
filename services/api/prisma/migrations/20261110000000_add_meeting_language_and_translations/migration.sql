-- AlterTable
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "language" TEXT;
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "translations" JSONB;
