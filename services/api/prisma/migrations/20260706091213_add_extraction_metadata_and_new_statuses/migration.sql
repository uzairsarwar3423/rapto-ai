-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MeetingStatus" ADD VALUE 'TRANSCRIBED';
ALTER TYPE "MeetingStatus" ADD VALUE 'TRANSCRIPT_CLEANED';
ALTER TYPE "MeetingStatus" ADD VALUE 'TRANSCRIPT_CLEANUP_FAILED';
ALTER TYPE "MeetingStatus" ADD VALUE 'TRANSCRIPT_CLEANUP_DEGRADED';
ALTER TYPE "MeetingStatus" ADD VALUE 'EXTRACTED';
ALTER TYPE "MeetingStatus" ADD VALUE 'EXTRACTED_PARTIAL';
ALTER TYPE "MeetingStatus" ADD VALUE 'EXTRACTION_FAILED';
ALTER TYPE "MeetingStatus" ADD VALUE 'RESOLVED';
ALTER TYPE "MeetingStatus" ADD VALUE 'RESOLUTION_FAILED';

-- AlterTable
ALTER TABLE "commitments" ADD COLUMN     "dedupKey" TEXT,
ADD COLUMN     "detectionConfidence" DOUBLE PRECISION,
ADD COLUMN     "fulfilledAt" TIMESTAMP(3),
ADD COLUMN     "fulfilledByStatement" TEXT,
ADD COLUMN     "lastReferencedAt" TIMESTAMP(3),
ADD COLUMN     "referenceCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "resolutionPromptVersion" TEXT,
ADD COLUMN     "similarityScore" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "meetings" ADD COLUMN     "extractionCostUsd" DOUBLE PRECISION,
ADD COLUMN     "extractionModel" TEXT,
ADD COLUMN     "extractionPromptVersion" TEXT,
ADD COLUMN     "resolutionComplete" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resolutionFailed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resolutionPartial" BOOLEAN NOT NULL DEFAULT false;
