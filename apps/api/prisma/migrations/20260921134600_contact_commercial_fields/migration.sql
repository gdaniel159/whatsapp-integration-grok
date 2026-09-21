-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'INTERESTED', 'QUOTED', 'WON', 'LOST');

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN "leadStatus" "LeadStatus" NOT NULL DEFAULT 'NEW',
ADD COLUMN "notes" TEXT,
ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
