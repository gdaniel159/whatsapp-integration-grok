# 07 — DEV inbound message simulator (infra, not product)

## Purpose
Local/DEV tool to inject inbound messages through the **same pipeline** as Baileys (`processIncomingMessage`), without a real WhatsApp session or CRM features.

## Identity
- JID shape: `{contactKey}@simulator.local` (always `@simulator.local`)
- `contactKey`: alphanumeric + hyphen only
- Treated as personal by `jid.util` / `isPersonalWaJid` / `normalizeWaJid`
- `phoneE164` = `null`
- Helper: `isSimulatorJid(jid)`

## Shared pipeline
`ChatService.processIncomingMessage`:
1. Upsert Contact (`ContactsService.upsertFromWaJid`)
2. Upsert Conversation
3. Create Message `IN`
4. Emit `chat:message` / `chat:conversation`
5. Call `AutoReplyService` (`awaitAutoReply` for DEV endpoint; fire-and-forget for WA)

Baileys `handleIncoming` only maps the event → this input (no duplicated Contact/Conversation logic).

## No real WhatsApp delivery
If `conversation.remoteJid` ends with `@simulator.local`, `ChatService.sendMessage` **skips** `wa.sendText` (auto-reply, welcome, and manual panel send). Still persists Message `OUT`, updates conversation, emits sockets. Real `@s.whatsapp.net` / `@lid` keep calling Baileys.

## Endpoint
`POST /dev/simulate-inbound` (JWT)

```json
{ "contactKey": "test-001", "displayName": "Cliente prueba", "body": "Hola" }
```

- `403 Forbidden` when `NODE_ENV === 'production'`
- Awaits auto-reply (`awaitAutoReply: true`) so tests can assert OUT synchronously
- Returns `{ contactId, conversationId, messageId, remoteJid }`

Module: `apps/api/src/dev/`

## UI
Nav **Simulador** only when `process.env.NODE_ENV !== 'production'` (inlined at Next.js build). Minimal form: Contacto, Identificador, Mensaje → “Simular mensaje”. On success, switches to Chats and selects the conversation.
