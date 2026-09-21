-- CreateTable Contact (non-destructive; groups/unlinked conversations kept)
CREATE TABLE IF NOT EXISTS "Contact" (
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

CREATE UNIQUE INDEX IF NOT EXISTS "Contact_waJid_key" ON "Contact"("waJid");
CREATE UNIQUE INDEX IF NOT EXISTS "Contact_phoneE164_key" ON "Contact"("phoneE164");

-- Add nullable contactId (do NOT set NOT NULL — historical / group rows may stay unlinked)
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "contactId" TEXT;

-- Backfill Contact for personal @s.whatsapp.net JIDs only (normalize :device)
INSERT INTO "Contact" ("id", "waJid", "phoneE164", "displayName", "profileName", "firstSeenAt", "lastSeenAt", "createdAt", "updatedAt")
SELECT
  'c' || substr(md5(c."id" || c."remoteJid"), 1, 24),
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

-- Link matchable personal conversations (leave groups / unmatched as NULL)
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

-- FK Restrict (nullable allowed) + index — only if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Conversation_contactId_fkey'
  ) THEN
    ALTER TABLE "Conversation"
    ADD CONSTRAINT "Conversation_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "Contact"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Conversation_contactId_idx" ON "Conversation"("contactId");

-- NOTE: contactId stays NULLABLE. No DELETE on Conversation/Message.
-- New personal chats must still link Contact in app layer (ContactsService upsert).
