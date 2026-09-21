# 00 — Overview / Resumen del sistema

## Objetivo
Administrador de bot WhatsApp: API NestJS + frontend Next.js + PostgreSQL. El operador inicia sesión, escanea QR, ve conversaciones y envía mensajes. **Auto-respuestas IA** con Hugging Face DeepSeek + base de conocimiento editable + toggle IA/Manual.

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
| LLM | Hugging Face Inference Router (`router.huggingface.co/v1`) — DeepSeek |

## Apps
- `apps/api` — REST + Socket.IO + WhatsAppService + Prisma + LLM/KB
- `apps/web` — login, dashboard QR/chat, Base de conocimiento
- `packages/shared` — tipos compartidos

## Flujos
1. Login → JWT → cookie/localStorage en web
2. Arrancar sesión WA → emitir `whatsapp:qr` / `whatsapp:status`
3. Mensajes entrantes → upsert Conversation/Message → `chat:message` / `chat:conversation`
4. Auto-reply solo si `BotSettings.globalAutoReplyEnabled` (default false) **y** `aiMode=AI`: bienvenida (1er inbound) + HF (async). Inbound siempre persiste.
5. Enviar mensaje vía REST → WA + persistencia + emit (no depende del kill switch)
6. Editar KB / bienvenida en tab **Base de conocimiento**; toggle global **Respuestas automáticas** en el header

## Decisiones
- **DEV simulator** (`07-dev-simulator.md`): inbound inject via shared `processIncomingMessage`; `@simulator.local` never calls Baileys.
- **Baileys** sobre whatsapp-web.js: más simple en contenedor/headless.
- Auth state en `apps/api/.wa-auth` + status en tabla `WhatsAppSession`.
- LLM: módulo real en `apps/api/src/llm/` (ver `04-llm-knowledge-base.md`).

## Puertos
- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- Postgres: `localhost:5432`
