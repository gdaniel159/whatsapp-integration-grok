# 08 — Contact commercial fields (CRM-lite)

Commercial lead data lives **on Contact** — there is **no** separate Lead model.

## Fields (Contact)
| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `leadStatus` | enum `LeadStatus` | `NEW` | Pipeline stage |
| `notes` | String? | — | Internal free text |
| `tags` | String[] | `[]` | Free-form labels (e.g. Toyota, Hilux) |

### LeadStatus
`NEW` | `IN_PROGRESS` | `INTERESTED` | `QUOTED` | `WON` | `LOST`

Spanish UI labels: Nuevo, En conversación, Interesado, Cotización, Ganado, Perdido.

## API
- `GET /contacts` / `GET /contacts/:id` — already return full Contact (new fields included).
- `PATCH /contacts/:id` (JWT) — partial update of `leadStatus` | `notes` | `tags` only. Never mutates `waJid` / `phoneE164` / timestamps.

## UI
Contactos detail panel: status select, notes textarea, tag chips, **Guardar cambios** (single PATCH).

## DEV seed
`pnpm db:seed:dev` → `apps/api/prisma/seed-dev.ts` — 8 `@simulator.local` mocks; idempotent cleanup of those JIDs only. Aborts if `NODE_ENV=production`.
