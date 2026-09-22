# 11 — Commercial pipeline interactions

Polish for the Pipeline Kanban from `10-commercial-pipeline-kanban.md`: card UX, relative activity, Sheet preview, and move toasts. Still **no** Lead model / Prisma enum changes.

## Labels
Shared `LEAD_STATUS_OPTIONS` in `apps/web/src/lib/lead-status.ts`:

| Enum | Label |
|------|--------|
| `NEW` | Nuevo |
| `IN_PROGRESS` | En seguimiento |
| `INTERESTED` | Interesado |
| `QUOTED` | Cotizado |
| `WON` | Ganado |
| `LOST` | Perdido |

## Cards
- Primary name: `displayName || profileName || phoneE164 || waJid` user-part (never full JID as primary).
- Tags: show up to 3 + `+N` overflow.
- `lastSeenAt` as relative Spanish (`hace 2 h`, `hace 5 min`, …) via `formatRelativeLastSeen`.
- Notes: icon indicator only on the card (full notes in Sheet).
- Empty column copy: **No hay contactos**.
- Column counts from local optimistic state.

## Drag → PATCH
- Optimistic `moveContactStatus` + `PATCH /contacts/:id` body **only** `{ leadStatus }`.
- Success toast: `Contacto movido a {label}`.
- Error toast: `No se pudo actualizar el estado` + rollback snapshot.
- Unchanged: ignore same-column drops; `movingId` guards.

## Card click → Sheet (not navigate)
Right `Sheet` preview: name, status, tags, notes, last activity, phone.
- Fetch `GET /contacts/:id` for `conversationId` when Sheet opens.
- **Ver conversación** → Dashboard `onOpenConversation` (select conversation + tab chats). Toast if no `conversationId`.
- **Editar contacto** → Dashboard `onOpenContact` (select contact + tab contacts).
- Does **not** embed the full commercial editor (edit stays on Contactos).

## Layout
Unchanged: `h-dvh` shell, horizontal board scroll, per-column vertical scroll, mobile-usable column width (~280px).

## Helpers / tests
- Pure helpers in `lead-status.ts`: `moveContactStatus`, `contactDisplayName`, `formatRelativeLastSeen`, `leadStatusLabel`.
- API: keep `PATCH` only-`leadStatus` does not clear notes/tags (`contacts.service.spec.ts`).
- Web unit: `lead-status.spec.ts` for helpers.

## Out of scope
Lead/Opportunity model, Prisma schema/enum changes, DeepSeek / Baileys / simulator / auto-reply, amounts, owner, history, automations.

## Related
- Kanban foundation: `10-commercial-pipeline-kanban.md`
- Commercial fields: `08-contact-commercial.md`
