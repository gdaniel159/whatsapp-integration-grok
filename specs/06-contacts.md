# 06 — Contacts / Contactos (persistentes)

## Estado
**Implementado** (modelo Contact + upsert + API lectura + backfill + UI preliminar Contactos). Sin CRM/leads/pipeline.

## Objetivo
Cuando una persona interactúe con el WhatsApp conectado, el sistema debe mantener una **entidad persistente Contact** que la represente de forma estable en el tiempo, independiente del hilo de mensajes, para poder enriquecerla más adelante (CRM) sin rehacer el modelo de chat.

## Contexto — qué almacenamos hoy
Hoy **no existe** el modelo `Contact`. La identidad del interlocutor vive embebida en `Conversation` (`specs/05-data-model.md`, Prisma actual):

| Dato | Dónde está hoy | Notas |
|------|----------------|-------|
| Identidad WA | `Conversation.remoteJid` (@unique) | Ej. `51999999999@s.whatsapp.net` |
| Nombre visible | `Conversation.name` (opcional) | Push name / notify de Baileys si llega |
| Actividad | `Conversation.lastMessageAt` | Último mensaje del hilo |
| Modo bot | `Conversation.aiMode` | AI \| MANUAL — pertenece al hilo, no a la persona |
| Mensajes | `Message` → `conversationId` | Sin vínculo directo a persona |

Conclusión: reutilizamos `Conversation`/`Message` como están; **evolucionamos** el modelo añadiendo `Contact` y relacionándolo. No sustituimos Conversation por Contact.

## Alcance (esta iteración)
- Definir e (en implementación futura) persistir `Contact` al recibir/enviar el primer mensaje con un JID personal.
- Upsert idempotente por identidad WhatsApp (sin duplicados).
- Vincular cada `Conversation` 1:1 (MVP) a un `Contact`.
- Exponer lectura mínima vía API (listar/obtener contacto) alineada al chat existente.
- Actualizar `name` del contacto cuando Baileys aporte un nombre más reciente (si no hay override manual futuro).

## Fuera de alcance (explícito)
- CRM completo, leads, pipeline, cotizaciones, seguimientos
- Automatizaciones adicionales, dashboard analítico
- Asignación de asesores / equipos
- Etiquetas, notas comerciales, campos custom, import/export
- Grupos WhatsApp (`@g.us`) como Contact de negocio (se ignoran o no crean Contact en esta iteración)
- UI rica de ficha de contacto (opcional mínima solo si hace falta para verificar; no es objetivo de producto CRM)
- Fusión manual de contactos / multi-número por persona
- LID / cambios de JID avanzados de Meta más allá de normalización básica documentada abajo

## Análisis de reutilización vs evolución

| Opción | Pros | Contras | Decisión |
|--------|------|---------|----------|
| A) Seguir solo con `Conversation` | Cero migración | Mezcla “hilo” con “persona”; CRM futuro rompe el modelo | Rechazada |
| B) Nuevo `Contact` + FK desde `Conversation` | Separación clara; AI/mode queda en el hilo; Contact estable | Migración + backfill | **Elegida** |
| C) Renombrar Conversation → Contact | Parece simple | Pierde semántica de hilo; `aiMode` y mensajes no son “la persona” | Rechazada |

## Modelo de datos propuesto

### Contact (nuevo)
Campos **mínimos** pensados para CRM posterior sin sobre-diseñar:

| Campo | Tipo | Restricción | Propósito |
|-------|------|-------------|-----------|
| `id` | String (cuid) | @id | PK interna |
| `waJid` | String | @unique | JID canónico personal (ver reglas de normalización) |
| `phoneE164` | String? | @unique donde no null | Teléfono normalizado `+5199…` si se puede derivar del JID; null si no aplica |
| `displayName` | String? | — | Nombre mostrado (Baileys / manual futuro) |
| `profileName` | String? | — | Último pushName observado (auditoría ligera) |
| `firstSeenAt` | DateTime | @default(now()) | Primera interacción conocida |
| `lastSeenAt` | DateTime? | — | Última interacción (mensaje in/out) |
| `createdAt` | DateTime | @default(now()) | Alta del registro |
| `updatedAt` | DateTime | @updatedAt | — |

Relaciones:
- `conversations Conversation[]` — en MVP esperamos **1 conversación personal** por contacto; el modelo permite 1:N por si más adelante hay varios hilos (p. ej. dispositivos), sin obligar a modelar CRM ahora.

**No incluir en esta iteración:** email, empresa, stage, ownerUserId, tags, source, score, notes.

### Conversation (evolución mínima)
Añadir:
- `contactId String?` → `Contact?` `@relation(..., onDelete: Restrict)` — **nullable** en DB por compatibilidad histórica (grupos / filas no linkeadas tras migración segura)
- Índice `@@index([contactId])`

Mantener:
- `remoteJid` @unique (routing WA / compatibilidad con código actual)
- `name`, `lastMessageAt`, `aiMode`, `messages`

Regla de consistencia: para chats 1:1, `Conversation.remoteJid` debe coincidir con `Contact.waJid` tras normalización.
**App layer:** toda Conversation personal **nueva** debe obtener Contact vía `ContactsService.upsertFromWaJid` y setear `contactId` (requerido en lógica de negocio, no como NOT NULL en schema). Grupos nunca crean Contact.

### Message
Sin cambio de esquema. Sigue colgando solo de `Conversation`. El contacto se obtiene `Message → Conversation → Contact`.

## Normalización e identidad (anti-duplicados)

1. **Clave primaria de negocio:** `Contact.waJid` único.
2. **Normalización de JID (personal):**
   - Usar el JID bare de chat 1:1 de Baileys (`…@s.whatsapp.net` **o** `…@lid`). Baileys puede entregar Linked ID (`@lid`) en lugar del JID telefónico; ambos son chats personales válidos.
   - Strip de sufijos de dispositivo si aparecen (`:XX` en el user part) antes de persistir.
   - Ignorar / no crear Contact para `@g.us`, `@broadcast`, status, etc.
3. **`phoneE164`:** solo para `@s.whatsapp.net` con user part numérico (`+…`). Para `@lid` dejar `null` (no inventar teléfono).
4. **Upsert:** en cada inbound/outbound relevante:
   - `upsert Contact` por `waJid`
   - `upsert Conversation` por `remoteJid` asegurando `contactId`
5. **Nombre:** si llega `pushName` y `displayName` está vacío, o si `displayName` == último `profileName`, actualizar ambos; no pisar un `displayName` que en el futuro se marque como editado a mano (flag `displayNameLocked` **no** se añade aún — documentado como extensión CRM).

## Reglas de negocio
1. Todo mensaje IN/OUT en chat 1:1 debe resolver un `Contact` existente o crearlo antes/junto al upsert de `Conversation`.
2. No crear dos Contacts con el mismo `waJid`.
3. Borrar un Contact con conversaciones asociadas: **no** en esta iteración (sin endpoint delete, o delete bloqueado).
4. `aiMode` permanece en `Conversation` (comportamiento del bot en ese hilo), no en Contact.
5. Backfill (al migrar): por cada `Conversation` existente, crear `Contact` con `waJid = remoteJid`, `displayName = name`, timestamps desde `createdAt` / `lastMessageAt`.

## Comportamiento esperado
1. Usuario nuevo escribe por WA → se crea Contact + Conversation + Message IN → (si AI) bienvenida/auto-reply según spec 04.
2. Mismo usuario escribe de nuevo → mismo Contact y misma Conversation; se actualiza `lastSeenAt` / `lastMessageAt`.
3. Operador envía OUT desde UI → también asegura Contact (por si el hilo se abrió outbound).
4. API de listado de conversaciones puede incluir datos del Contact (`displayName`, `phoneE164`) sin romper el contrato actual (campos adicionales opcionales).

## API propuesta (implementación futura; contrato aquí)
| Método | Ruta | Auth | Notas |
|--------|------|------|-------|
| GET | `/contacts` | Sí | Lista paginada simple; orden `lastSeenAt` desc |
| GET | `/contacts/:id` | Sí | Detalle + `conversationId` + `conversations[]` (`id`, `remoteJid`, `lastMessageAt`, `name`) |
| GET | `/conversations` | Sí | Incluir `contact: { id, displayName, phoneE164, waJid }` embebido (extensión no breaking) |

Sin PATCH rico de ficha CRM en esta iteración (opcional: PATCH solo `displayName` si se necesita para prueba).

## UI (esta iteración) — preliminar Contactos
- **No** CRM (sin edit/delete/tags/stages/owner/notes/leads).
- Nav **Contactos** junto a Chats / Base de conocimiento (tab en Dashboard).
- Lista `GET /contacts`: displayName (fallback waJid), phoneE164, waJid, firstSeenAt, lastSeenAt; loading/empty/error; búsqueda local por nombre o teléfono; responsive.
- Detalle `GET /contacts/:id`: name, phone, waJid, timestamps + conversaciones read-only (`id`, `remoteJid`, `lastMessageAt`, `name`) si el endpoint las devuelve.
- Chat existente: preferir `contact.displayName` sobre `conversation.name` cuando `contact` esté presente (manejar `contactId`/`contact` null).

## Criterios de aceptación
1. Spec aprobada; modelo Contact documentado y alineado con Prisma.
2. Al llegar un IN 1:1 se persiste exactamente un Contact por `waJid`.
3. Reincidir el mismo JID no crea fila duplicada.
4. Toda Conversation 1:1 **nueva** tiene `contactId` no nulo (app layer); schema permite null por compatibilidad histórica.
5. Messages siguen accesibles solo vía Conversation; detalle de contacto puede listar conversaciones vinculadas.
6. Migración/backfill **no destructiva**: sin `DELETE` de Conversation/Message; backfill solo personal `@s.whatsapp.net`; `contactId` permanece nullable (no `SET NOT NULL`).
7. Grupos no generan Contact.
8. Ninguna feature CRM/leads de “Fuera de alcance” en el PR.
9. UI Contactos: listado + detalle + búsqueda local; estados loading/empty/error; sin mutaciones de ficha.
10. TypeScript/API manejan `contact`/`contactId` null de forma segura (incluir contact solo cuando presente).

## Archivos / componentes probablemente afectados (impl. futura)
| Área | Ruta probable |
|------|----------------|
| Specs | `specs/06-contacts.md` (este), `specs/05-data-model.md` (añadir Contact), `specs/03-chat.md` (upsert Contact) |
| Prisma | `apps/api/prisma/schema.prisma`, migración + seed/backfill |
| Chat / WA | `apps/api/src/chat/*`, `apps/api/src/whatsapp/*` (persistIncoming / send) |
| Nuevo módulo | `apps/api/src/contacts/*` (controller + service) |
| Shared types | `packages/shared` si aplica |
| Web | `apps/web` — lista/hilo: mostrar nombre desde contact |
| README | mención breve de Contact |

## Decisiones principales (resumen)
1. **Contact nuevo**, no reutilizar Conversation como persona.
2. Relación **Contact 1 — N Conversation** (MVP operativo 1:1).
3. **Deduplicación** por `waJid` normalizado (`@s.whatsapp.net` o `@lid`); `phoneE164` auxiliar único nullable.
4. Campos CRM (stage, owner, tags…) **aplazados**.
5. `aiMode` permanece en Conversation.

## Migración
- Original `*_contacts`: CREATE Contact, ADD `contactId` nullable, BACKFILL personal JIDs (normalize `:device`), UPDATE matchable, FK Restrict + index. **Sin DELETE** Conversation/Message. **Sin** `SET NOT NULL`.
- Follow-up `*_contacts_nullable_safe` (si un entorno ya aplicó la versión destructiva): `ALTER … DROP NOT NULL`; documenta filas históricas con `contactId` NULL. Sin deletes.

## Dudas / riesgos
1. **LID / JID alternativos** de WhatsApp (cuentas que cambian de identificador): la unicidad solo por JID puede generar duplicados a largo plazo; mitigación futura: tabla de alias o merge manual — fuera de alcance.
2. **Nombres de campos en código vs specs:** el código puede usar `remoteJid`/`aiMode`; la implementación debe respetar el schema real y actualizar `05` si hay drift.
3. **Conversaciones ya existentes en prod/local:** requieren migración backfill; riesgo de JID de grupo colados en DB — filtrar en backfill.
4. **Privacy:** `phoneE164` es PII; mismo nivel de protección que el chat actual (JWT admin only).
5. **Contact sin Conversation:** no se crea en esta iteración (solo vía interacción WA).

## Dependencias
- Specs 03 (chat) y 05 (data model) como fuente de verdad actual.
- Spec 04 (LLM) no cambia: sigue actuando a nivel Conversation/`aiMode`.
