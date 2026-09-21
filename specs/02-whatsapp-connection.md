# 02 — WhatsApp Connection / Conexión

## Librería
`@whiskeysockets/baileys` — multi-device, sin Chromium.

## WhatsAppService (abstracto)
Responsabilidades:
1. `start()` — iniciar cliente, cargar creds de `apps/api/.wa-auth`
2. Emitir QR (base64 / data URL) → Socket.IO `whatsapp:qr`
3. Emitir status → `whatsapp:status` (`DISCONNECTED` | `QR` | `CONNECTED`)
4. Persistir auth state en disco (`.wa-auth`)
5. Actualizar fila `WhatsAppSession` en DB
6. `sendMessage(remoteJid, body)`
7. Escuchar mensajes entrantes → ChatService

## Eventos Socket.IO
| Evento | Payload |
|--------|---------|
| `whatsapp:qr` | `{ qr: string }` (data URL o base64 PNG) |
| `whatsapp:status` | `{ status: 'DISCONNECTED'\|'QR'\|'CONNECTED' }` |

## REST auxiliar (opcional MVP)
- `POST /whatsapp/start` — iniciar/reconectar
- `GET /whatsapp/status` — status actual
- `POST /whatsapp/logout` — borrar sesión (nice-to-have)

## Notas
- Requiere escanear QR con WhatsApp real (teléfono).
- En entornos sin red a WA, status quedará en QR/DISCONNECTED.
