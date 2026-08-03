-- AlterTable
ALTER TABLE "commitments" ALTER COLUMN "ownerId" DROP NOT NULL;
ALTER TABLE "commitments" ADD COLUMN "ownerNameRaw" TEXT;
