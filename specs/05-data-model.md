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
- `createdAt` / `updatedAt`
- `conversations` Conversation[]

### Conversation
- `id` String @id @default(cuid())
- `remoteJid` String @unique
- `name` String?
- `lastMessageAt` DateTime?
- `aiMode` enum AI | MANUAL @default(AI)
- `contactId` String → Contact (onDelete: Restrict); @@index([contactId])
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
- `updatedAt` DateTime @updatedAt

## Auth en disco
Credenciales Baileys en `apps/api/.wa-auth/` (gitignore).

## Enums
- `MessageDirection`: IN | OUT
- `WaSessionStatus`: DISCONNECTED | QR | CONNECTED
- `AiMode`: AI | MANUAL
