# 10 — Commercial pipeline Kanban

Kanban board for CRM-lite lead stages on **Contact** — no separate Lead / Opportunity model.

## Source of truth
- `Contact.leadStatus` enum: `NEW` | `IN_PROGRESS` | `INTERESTED` | `QUOTED` | `WON` | `LOST`
- Spanish column labels shared with Contactos (`LEAD_STATUS_OPTIONS` in `apps/web/src/lib/lead-status.ts`): Nuevo, En seguimiento, Interesado, Cotizado, Ganado, Perdido. Interactions polish: `11-commercial-pipeline-interactions.md`.
- Fields on cards: same Contact row shape as Dashboard (`id`, `waJid`, `phoneE164`, `displayName`, `profileName`, `firstSeenAt`, `lastSeenAt`, `leadStatus`, `notes`, `tags`).

## UI
- Nav tab **Pipeline** next to Contactos (`Tab` += `'pipeline'`).
- Board: one column per `LeadStatus`; header = label + count badge; empty-state per empty column.
- Cards: name (`displayName || profileName || phone || jid`), phone/JID, tags as Badges, last activity (`lastSeenAt`), status indicator.
- Click card → right Sheet preview (see `11`); Edit navigates to Contactos; Ver conversación opens Chats.
- Layout: inside existing `h-dvh` Dashboard shell; horizontal scroll for columns; each column scrolls vertically; document does not grow (overflow like Chats).
- shadcn: Card / Badge / ScrollArea / Skeleton / Button; Sonner toasts.

## Drag & drop → PATCH
- Lib: `@dnd-kit/core` (+ utilities); droppable columns + draggable cards.
- Drop onto another status → **optimistic** `leadStatus` update (`moveContactStatus`).
- Persist: `PATCH /contacts/:id` body **only** `{ leadStatus }` — never send `notes` / `tags` on move.
- PATCH failure → revert to previous contacts snapshot + `toast.error`.
- Ignore no-op (same column); track `movingId` to avoid duplicate moves / ghost cards.

## Out of scope
Lead model, opportunities, amounts, owner, status history, automations, advanced filters, metrics. No Prisma schema changes.

## Related
- Commercial fields API/UI: `08-contact-commercial.md`
- shadcn foundation: `09-shadcn-ui-foundation.md`
