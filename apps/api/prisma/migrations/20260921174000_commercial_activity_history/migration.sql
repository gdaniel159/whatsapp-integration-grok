-- CreateEnum
CREATE TYPE "CommercialActivityType" AS ENUM ('CONTACT_CREATED', 'STATUS_CHANGED', 'NOTES_UPDATED', 'TAGS_UPDATED');

-- CreateEnum
CREATE TYPE "CommercialActivitySource" AS ENUM ('SYSTEM', 'USER', 'SEED');

-- CreateTable
CREATE TABLE "CommercialActivity" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "type" "CommercialActivityType" NOT NULL,
    "source" "CommercialActivitySource" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommercialActivity_contactId_createdAt_idx" ON "CommercialActivity"("contactId", "createdAt");

-- AddForeignKey
ALTER TABLE "CommercialActivity" ADD CONSTRAINT "CommercialActivity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
