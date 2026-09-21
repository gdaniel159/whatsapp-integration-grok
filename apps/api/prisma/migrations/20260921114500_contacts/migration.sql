-- CreateTable Contact
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "waJid" TEXT NOT NULL,
    "phoneE164" TEXT,
    "displayName" TEXT,
    "profileName" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Contact_waJid_key" ON "Contact"("waJid");
CREATE UNIQUE INDEX "Contact_phoneE164_key" ON "Contact"("phoneE164");

-- Add nullable contactId first
ALTER TABLE "Conversation" ADD COLUMN "contactId" TEXT;

-- Delete group / non-personal conversations (and messages via cascade) so remaining can be NOT NULL
DELETE FROM "Message"
WHERE "conversationId" IN (
  SELECT "id" FROM "Conversation"
  WHERE "remoteJid" NOT LIKE '%@s.whatsapp.net'
);

DELETE FROM "Conversation"
WHERE "remoteJid" NOT LIKE '%@s.whatsapp.net';

-- Backfill Contact + contactId for personal JIDs only
INSERT INTO "Contact" ("id", "waJid", "phoneE164", "displayName", "profileName", "firstSeenAt", "lastSeenAt", "createdAt", "updatedAt")
SELECT
  'c' || substr(md5(c."id" || c."remoteJid"), 1, 24),
  -- normalize: strip :device suffix from user part
  CASE
    WHEN position(':' in split_part(c."remoteJid", '@', 1)) > 0 THEN
      split_part(split_part(c."remoteJid", '@', 1), ':', 1) || '@' || split_part(c."remoteJid", '@', 2)
    ELSE c."remoteJid"
  END,
  CASE
    WHEN split_part(
      CASE
        WHEN position(':' in split_part(c."remoteJid", '@', 1)) > 0 THEN
          split_part(split_part(c."remoteJid", '@', 1), ':', 1) || '@' || split_part(c."remoteJid", '@', 2)
        ELSE c."remoteJid"
      END,
      '@', 1
    ) ~ '^[0-9]+$' THEN
      '+' || split_part(
        CASE
          WHEN position(':' in split_part(c."remoteJid", '@', 1)) > 0 THEN
            split_part(split_part(c."remoteJid", '@', 1), ':', 1) || '@' || split_part(c."remoteJid", '@', 2)
          ELSE c."remoteJid"
        END,
        '@', 1
      )
    ELSE NULL
  END,
  c."name",
  c."name",
  c."createdAt",
  c."lastMessageAt",
  c."createdAt",
  CURRENT_TIMESTAMP
FROM "Conversation" c
WHERE c."remoteJid" LIKE '%@s.whatsapp.net'
ON CONFLICT ("waJid") DO NOTHING;

-- Link conversations to contacts (normalized waJid match)
UPDATE "Conversation" c
SET "contactId" = ct."id"
FROM "Contact" ct
WHERE ct."waJid" = (
  CASE
    WHEN position(':' in split_part(c."remoteJid", '@', 1)) > 0 THEN
      split_part(split_part(c."remoteJid", '@', 1), ':', 1) || '@' || split_part(c."remoteJid", '@', 2)
    ELSE c."remoteJid"
  END
)
AND c."contactId" IS NULL;

-- Safety: any remaining without contactId (should be none) — delete orphans
DELETE FROM "Message"
WHERE "conversationId" IN (
  SELECT "id" FROM "Conversation" WHERE "contactId" IS NULL
);
DELETE FROM "Conversation" WHERE "contactId" IS NULL;

-- Make contactId required + FK + index
ALTER TABLE "Conversation" ALTER COLUMN "contactId" SET NOT NULL;

ALTER TABLE "Conversation"
ADD CONSTRAINT "Conversation_contactId_fkey"
FOREIGN KEY ("contactId") REFERENCES "Contact"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Conversation_contactId_idx" ON "Conversation"("contactId");
