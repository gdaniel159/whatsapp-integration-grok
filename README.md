# WhatsApp Integration Grok

Administrador de bot WhatsApp: **NestJS** (API) + **Next.js** (UI) + **PostgreSQL** (Podman).

Documentación de especificaciones en [`specs/`](./specs/).

## Requisitos

- Node.js ≥ 18
- [pnpm](https://pnpm.io/) 9.x (`npm i -g pnpm` o Corepack)
- [Podman](https://podman.io/) (preferido) o Docker Compose

## 1. Instalar dependencias

```bash
cd /workspace/whatsapp-integration-grok
pnpm install
```

## 2. Base de datos (Podman)

```bash
# Preferido
podman compose up -d

# Si usas Docker / alias docker-compose:
# docker compose up -d
# podman-compose up -d   # alias frecuente
```

Espera el healthcheck (`pg_isready`). Credenciales DB: user/password/db = `whatsapp`, puerto `5432`.

## 3. Variables de entorno

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

Ajusta `JWT_SECRET` en `apps/api/.env`.

## 4. Migrar y seed

```bash
pnpm db:generate
pnpm db:migrate   # o: pnpm db:push
pnpm db:seed
```

Credenciales admin: ver [`SEED_CREDENTIALS.md`](./SEED_CREDENTIALS.md) → `admin` / `Admin123!`

## 5. Ejecutar

```bash
# Terminal 1 — API (puerto 3001)
pnpm dev:api

# Terminal 2 — Web (puerto 3000)
pnpm dev:web
```

Abrir: http://localhost:3000 → login → escanear QR de WhatsApp → chat.

## Stack

| Pieza | Detalle |
|-------|---------|
| WhatsApp | Baileys (`@whiskeysockets/baileys`), auth en `apps/api/.wa-auth` |
| Auth | JWT + bcrypt |
| Realtime | Socket.IO (`whatsapp:qr`, `whatsapp:status`, `chat:*`) |
| LLM | Stub futuro — `specs/04-llm-knowledge-base-future.md` |

## Limitaciones conocidas

- El QR requiere escanear con un teléfono WhatsApp real.
- Sin Podman/Docker en la máquina, Postgres debe instalarse por otro medio.
- Hugging Face / KB: no implementado (solo stub).

## Estructura

```
apps/api     NestJS + Prisma + Baileys + Socket.IO
apps/web     Next.js App Router (login + dashboard chat)
packages/shared  Tipos compartidos
specs/       Spec-Driven Development
compose.yml  PostgreSQL 16
```

## Notas de este entorno (box)

- En la máquina de scaffold **no había Podman/Docker**. Se verificó migrate/seed con PostgreSQL 16 portable local. En tu máquina usa `podman compose up -d` como indica arriba.
- Librería WhatsApp: **Baileys** (no whatsapp-web.js) para headless sin Chromium.
- El QR solo funciona escaneando con un teléfono WhatsApp real.
