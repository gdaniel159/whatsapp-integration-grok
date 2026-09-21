-- Follow-up for DBs that already applied the destructive contacts migration
-- (contactId NOT NULL + deletes). Make contactId nullable again for historical
-- compatibility. Unlinked rows (e.g. groups if any remain, or future orphans)
-- keep contactId NULL. NO deletes.

-- Drop NOT NULL if currently required
ALTER TABLE "Conversation" ALTER COLUMN "contactId" DROP NOT NULL;

-- Ensure FK exists and allows null (recreate if needed with same Restrict semantics)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Conversation_contactId_fkey'
  ) THEN
    -- Existing FK already permits NULL on the referencing column once NOT NULL is dropped.
    NULL;
  ELSE
    ALTER TABLE "Conversation"
    ADD CONSTRAINT "Conversation_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "Contact"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Conversation_contactId_idx" ON "Conversation"("contactId");

-- Historical unlinked Conversation rows intentionally remain with contactId NULL.
-- App layer: new personal @s.whatsapp.net conversations MUST upsert Contact and set contactId.
