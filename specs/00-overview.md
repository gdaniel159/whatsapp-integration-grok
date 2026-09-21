# 00 — Overview / Resumen del sistema

## Objetivo
Administrador de bot WhatsApp: API NestJS + frontend Next.js + PostgreSQL. El operador inicia sesión, escanea QR, ve conversaciones y envía mensajes. Integración LLM (Hugging Face) queda como stub futuro.

## Arquitectura
| Capa | Tecnología |
|------|------------|
| Monorepo | pnpm workspaces |
| API | NestJS (`apps/api`), puerto **3001** |
| Web | Next.js App Router (`apps/web`), puerto **3000** |
| DB | PostgreSQL 16 via Podman Compose |
| ORM | Prisma |
| WhatsApp | `@whiskeysockets/baileys` (headless; sin Chromium) |
| Auth | JWT (access) + bcrypt |
| Realtime | Socket.IO (QR, status, mensajes) |

## Apps
- `apps/api` — REST + Socket.IO + WhatsAppService + Prisma
- `apps/web` — login, dashboard QR/chat
- `packages/shared` — tipos compartidos opcionales

## Flujos MVP
1. Login → JWT → cookie/localStorage en web
2. Arrancar sesión WA → emitir `whatsapp:qr` / `whatsapp:status`
3. Mensajes entrantes → upsert Conversation/Message → `chat:message` / `chat:conversation`
4. Enviar mensaje vía REST → WA + persistencia + emit

## Decisiones
- **Baileys** sobre whatsapp-web.js: más simple en contenedor/headless.
- Auth state en `apps/api/.wa-auth` + status en tabla `WhatsAppSession`.
- LLM: solo stub en `apps/api/src/llm/` (ver `04-llm-knowledge-base-future.md`).

## Puertos
- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- Postgres: `localhost:5432`
