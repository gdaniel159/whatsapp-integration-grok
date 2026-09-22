# 12 — Commercial activity history

Append-only commercial timeline on Contact. Activities are generated **only on the backend** — never from the frontend, and never per Message.

## Model

### Enums
- `CommercialActivityType`: `CONTACT_CREATED` | `STATUS_CHANGED` | `NOTES_UPDATED` | `TAGS_UPDATED`
- `CommercialActivitySource`: `SYSTEM` | `USER` | `SEED`  
  (`DEEPSEEK` added in phase 13 for automation-sourced activities.)

### CommercialActivity
| Field | Type | Notes |
|-------|------|-------|
| `id` | cuid | |
| `contactId` | FK → Contact | `onDelete: Cascade` |
| `type` | CommercialActivityType | |
| `source` | CommercialActivitySource | |
| `title` | String | Human-readable Spanish title |
| `description` | String? | Optional; **never** store full old/new notes |
| `metadata` | Json? | e.g. `{from,to}`, `{added,removed}` |
| `createdAt` | DateTime | `@default(now())` |

Index: `@@index([contactId, createdAt])`  
Contact relation: `commercialActivities CommercialActivity[]`

## Generation rules (centralized)

Helpers: `apps/api/src/contacts/commercial-activity.util.ts`  
Orchestration: `ContactsService` (same module).

### `updateCommercial` (USER)
1. Load existing contact.
2. Diff only fields present in the DTO:
   - `leadStatus` change → `STATUS_CHANGED` — title `Estado cambiado a {Spanish label}`; metadata `{from,to}`
   - `notes` change — normalize `null`/`undefined`/`''` as equal empty → `NOTES_UPDATED` — title `Notas actualizadas` (no note bodies in description/metadata)
   - `tags` change by **set** equality (order ignored) → `TAGS_UPDATED` — title `Etiquetas actualizadas`; metadata `{added, removed}`
3. Omitted field → no check. Same value → no activity.
4. Multi-field PATCH can create up to **3** activities.
5. Persist Contact update + `createMany` activities in **one** `prisma.$transaction`.
6. Return `getById` as today.

DnD pipeline PATCH (`{ leadStatus }`) uses the same path.

### `upsertFromWaJid` create path (SYSTEM)
Create Contact + `CONTACT_CREATED` (`title: Contacto creado`, source `SYSTEM`) in the **same transaction**.  
Update path: **no** `CONTACT_CREATED`.

## Invariants
- No activities from frontend.
- No activities per Message.
- PATCH with only the same `leadStatus` → zero activities.
- Empty notes equivalents (`null` ↔ `''`) do not create `NOTES_UPDATED`.
- Tag order-only changes do not create `TAGS_UPDATED`.

## API
- `GET /contacts/:id/activities` (JWT) — `createdAt DESC`, optional `?limit=` (default 50, max 200).
- Route registered **before** `GET :id`.
- **No** POST / PATCH / DELETE for activities.

## UI timeline
Reusable `CommercialActivityTimeline` (shadcn only — no timeline library):
- Used in Pipeline Sheet (fetch when Sheet opens, parallel with detail GET).
- Also on Contactos detail.
- `STATUS_CHANGED`: Spanish from/to via `lead-status` helpers.
- `TAGS_UPDATED`: `+added` / `−removed` chips when metadata present.
- Loading / empty states.

## DEV seed
`pnpm db:seed:dev` — for each of the 8 mock JIDs, recreate a coherent `CommercialActivity` chain with `source: SEED` matching final `leadStatus` (Carlos NEW = only `CONTACT_CREATED`; others have sensible status/notes/tags paths). Timestamps older-first. Idempotent cleanup of those 8 JIDs only (activities deleted before/cascade with contacts). Aborts if `NODE_ENV=production`.

## Acceptance
1. New WA contact → one `CONTACT_CREATED` SYSTEM.
2. NEW→INTERESTED → one `STATUS_CHANGED` USER with Spanish title + metadata.
3. NEW→NEW → zero activities.
4. Notes A→B → `NOTES_UPDATED` without bodies stored.
5. Same notes → none.
6. Tags add Hilux → `TAGS_UPDATED` metadata.added.
7. Tags remove Toyota → metadata.removed.
8. Same tags different order → none.
9. status+notes+tags → three activities, one transaction.
10. `GET .../activities` returns DESC.
11. Pipeline DnD uses `updateCommercial` (status activity).
12. `seed-dev` twice stays idempotent (8 mocks, coherent SEED chains).

## Out of scope
- AI-sourced activities (source reserved for later).
- Message-linked activity stream.
- Editing / deleting history from UI.
