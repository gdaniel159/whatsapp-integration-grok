# 05 — Data Model / Modelo de datos

## Prisma models

### User
- `id` String @id @default(cuid())
- `username` String @unique
- `passwordHash` String
- `createdAt` DateTime @default(now())

### Conversation
- `id` String @id @default(cuid())
- `remoteJid` String @unique
- `name` String?
- `lastMessageAt` DateTime?
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
- `id` String @id @default(cuid()) — o singleton `id = "default"`
- `status` enum DISCONNECTED | QR | CONNECTED
- `lastQrAt` DateTime?
- `updatedAt` DateTime @updatedAt

## Auth en disco
Credenciales Baileys en `apps/api/.wa-auth/` (gitignore).
