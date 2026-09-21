# 03 — Chat / Mensajería

## Persistencia
Al recibir/enviar mensaje:
1. Upsert `Conversation` por `remoteJid`
2. Crear `Message` (direction `IN`|`OUT`)
3. Actualizar `lastMessageAt`
4. Emitir Socket.IO:
   - `chat:message` — mensaje nuevo
   - `chat:conversation` — conversación actualizada

## REST
| Método | Ruta | Auth | Body / Notas |
|--------|------|------|--------------|
| GET | `/conversations` | Sí | Lista ordenada por `lastMessageAt` desc |
| GET | `/conversations/:id/messages` | Sí | Mensajes de la conversación |
| POST | `/conversations/:id/messages` | Sí | `{ body: string }` → envía por WA + guarda |

## UI
- Layout: lista de conversaciones + hilo + input de envío
- Solo si status `CONNECTED`; si no, panel QR
- Actualización en tiempo real vía Socket.IO

## Identificadores
- `remoteJid`: ej. `51999999999@s.whatsapp.net`
- `waMessageId`: id de Baileys si disponible
