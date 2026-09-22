# 05 — Data Model / Modelo de datos

## Prisma models

### User
- `id` String @id @default(cuid())
- `username` String @unique
- `passwordHash` String
- `createdAt` DateTime @default(now())

### Contact
- `id` String @id @default(cuid())
- `waJid` String @unique — JID personal canónico (`@s.whatsapp.net`)
- `phoneE164` String? @unique — `+…` si el user part es solo dígitos
- `displayName` String?
- `profileName` String?
- `firstSeenAt` DateTime @default(now())
- `lastSeenAt` DateTime?
- `leadStatus` enum LeadStatus @default(NEW) — commercial pipeline (no separate Lead model)
- `notes` String? — internal commercial notes
- `tags` String[] @default([]) — free-form labels
- `createdAt` / `updatedAt`
- `conversations` Conversation[]
- `commercialActivities` CommercialActivity[]


### CommercialActivity
- `id` cuid; `contactId` → Contact (`onDelete: Cascade`)
- `type` enum CommercialActivityType: CONTACT_CREATED | STATUS_CHANGED | NOTES_UPDATED | TAGS_UPDATED
- `source` enum CommercialActivitySource: SYSTEM | USER | SEED (AI reserved later)
- `title` String; `description` String?; `metadata` Json?; `createdAt`
- @@index([contactId, createdAt])
- Generated only by ContactsService (never frontend / never per Message). See `12-commercial-activity-history.md`.

### Conversation
- `id` String @id @default(cuid())
- `remoteJid` String @unique
- `name` String?
- `lastMessageAt` DateTime?
- `aiMode` enum AI | MANUAL @default(AI)
- `contactId` String? → Contact? (onDelete: Restrict; nullable for historical/unlinked rows); @@index([contactId])
  - App: new personal chats always set contactId via ContactsService upsert; groups never create Contact
- `createdAt` DateTime @default(now())
- `messages` Message[]

### Message
- `id` String @id @default(cuid())
- `conversationId` String
- `conversation` Conversation @relation(...)
- `direction` enum IN | OUT
- `body` String
- `timestamp` DateTime
- `waMessageId` String?
- `rawMeta` Json?

### WhatsAppSession
- `id` String @id @default("default")
- `status` enum DISCONNECTED | QR | CONNECTED
- `lastQrAt` DateTime?
- `updatedAt` DateTime @updatedAt

### KnowledgeBase (singleton)
- `id` String @id @default("default")
- `content` String @db.Text
- `updatedAt` DateTime @updatedAt

### BotSettings (singleton)
- `id` String @id @default("default")
- `welcomeMessage` String @db.Text
- `firstAction` String @db.Text
- `hfModel` String? — override de `HF_MODEL`
- `globalAutoReplyEnabled` Boolean @default(false) — kill switch global de auto-respuestas
- `commercialAutomationMode` enum CommercialAutomationMode @default(OFF) — OFF | OBSERVE | APPLY
- `updatedAt` DateTime @updatedAt

## Auth en disco
Credenciales Baileys en `apps/api/.wa-auth/` (gitignore).

## Enums
- `MessageDirection`: IN | OUT
- `WaSessionStatus`: DISCONNECTED | QR | CONNECTED
- `AiMode`: AI | MANUAL
- `LeadStatus`: NEW | IN_PROGRESS | INTERESTED | QUOTED | WON | LOST
- `CommercialActivityType`: CONTACT_CREATED | STATUS_CHANGED | NOTES_UPDATED | TAGS_UPDATED
- `CommercialActivitySource`: SYSTEM | USER | SEED | DEEPSEEK
- `CommercialAutomationMode`: OFF | OBSERVE | APPLY

See also `08-contact-commercial.md`, `12-commercial-activity-history.md`.

See also `13-deepseek-commercial-decision-engine.md`.
