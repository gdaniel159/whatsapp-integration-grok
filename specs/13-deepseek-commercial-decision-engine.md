# 13 — DeepSeek commercial decision engine

## Goal
Opt-in commercial analysis of inbound WhatsApp messages using a **second** internal DeepSeek/HF LLM call. Conversational auto-reply text stays plain language; commercial output is strict JSON validated by Zod and gated by a pure backend policy. DeepSeek never accesses Prisma; the Nest backend is authoritative.

## Platform vs Business vs Dev examples

| Layer | What it is | Examples |
|-------|------------|----------|
| **Platform rules** | Product behavior shared by every business install | Intent schema, Zod validation, confidence threshold, sticky statuses, never invent business facts, forced handoff on PRICE/QUOTE, no auto WON/LOST/QUOTED |
| **Business configuration** | Singleton `BotSettings` BusinessProfile | `businessName`, `timezone`, `businessHoursStart`, `businessHoursEnd` — editable in Dashboard **Configuración → Negocio** |
| **Development examples** | Fixtures / seed data only | DMX 4x4 + America/Lima 08:00–18:00 in `seed-dev`; Toyota/Hilux mock contacts and some unit tag fixtures |

Platform defaults for BusinessProfile are **neutral**: empty name, `UTC`, `09:00`–`17:00`. DMX / Lima / 08–18 must never be universal product defaults.

## Why two LLM calls
Inspection of `LlmService` + `AutoReplyService` shows the conversational path returns free-form Spanish WhatsApp text for customers. Turning that reply into JSON would risk leaking structured CRM decisions to end users and regress chat UX. A separate internal analysis call keeps concerns isolated, allows independent failure handling, and can run even when `globalAutoReplyEnabled=false`.

## Schema / intents
Closed intents: `GENERAL_INQUIRY | PRODUCT_INQUIRY | PRICE_INQUIRY | QUOTE_REQUEST | PURCHASE_INTENT | POST_SALE | OTHER`

Validated decision (Zod `.strict()`):
```json
{
  "intent": "...",
  "suggestedStatus": "NEW|IN_PROGRESS|INTERESTED|QUOTED|WON|LOST|null",
  "suggestedTags": ["..."],
  "confidence": 0.0,
  "reason": "short audit note",
  "requiresHumanAttention": false,
  "handoffReason": null
}
```
Unknown keys/intent/status or non-finite confidence outside `[0,1]` are rejected. JSON may be extracted from fenced or plain model output, but invalid data is never accepted.

## Prompt / context
- System prompt treats conversation content as untrusted data (no system override, no tools/Prisma/secrets).
- **Never invent business facts** (prices, discounts, availability, commercial conditions, delivery times, policies) unless present in authorized sources; otherwise human handoff.
- Context: current contact `{leadStatus,tags}` + last ~6 messages (truncated bodies). KB is not mutated; not required for analysis.
- Temperature 0, short `maxTokens`, request timeout.
- No industry-specific if-branches; wording is business-agnostic (no DMX / Secretaría / Gerencia hardcoding).

## Policy transition matrix (deterministic)
| Current | Intent (confidence ≥ 0.72) | Auto status |
|---------|----------------------------|-------------|
| NEW / IN_PROGRESS | PRODUCT / PRICE / QUOTE / PURCHASE | INTERESTED |
| NEW | GENERAL / OTHER / POST_SALE | no change |
| INTERESTED | promoting intents | no change (already at cap) |
| QUOTED / WON / LOST | any | sticky — no auto change |
| any | suggested WON/LOST | always rejected |
| any | QUOTE_REQUEST suggesting QUOTED | **cap INTERESTED** — no quote entity exists |

Tags: trim, drop empties, max length, cap count, case-insensitive dedupe against current tags, evidence-only. Manual tags preserved.

## Modes (`BotSettings.commercialAutomationMode`, default OFF)
- **OFF**: no commercial LLM call.
- **OBSERVE**: analyze + validate + policy preview; no Contact mutation; no activities.
- **APPLY**: analyze + policy + atomic allowed Contact update + `CommercialActivity` rows with source `DEEPSEEK`.

Independent of `globalAutoReplyEnabled`.

## Pipeline integration
After inbound Contact/Conversation/Message exist (`ChatService.processIncomingMessage`):
1. Auto-reply path (gated by global switch + aiMode) — unchanged.
2. Commercial path (gated only by commercialAutomationMode) — parallel, errors caught/logged.
Simulator (`awaitAutoReply=true`) awaits both and returns `commercialAnalysis` for DEV UI. Real Baileys path remains fire-and-forget for messaging guarantees.
Idempotency: if `waMessageId` already exists for that conversation IN message, skip reprocessing.

## Activities
Reuse `diffCommercialActivities(..., { source, statusMetadata, tagsMetadata })`.
- Manual PATCH → source `USER` (unchanged).
- Automation → source `DEEPSEEK`.
- STATUS_CHANGED metadata: `from,to,intent,confidence,reason`.
- TAGS_UPDATED metadata: `added,removed,intent,confidence`.
- No activity when no real change; repeats do not duplicate.

## Errors
Commercial analysis failure never fails inbound persistence or conversational reply. Invalid JSON / timeout / missing token → logged, outcome `REJECTED`, no writes.

## Security
- No Prisma/tools in model context.
- Strict schema + deterministic policy = model cannot force WON/LOST/QUOTED or arbitrary regressions.
- User content cannot override system instructions.

## API / UI
- `BotSettings` on GET/PATCH `/bot-settings` includes commercial mode **and** BusinessProfile fields.
- KB settings: **Configuración → Negocio** (nombre, zona horaria, hora inicio/fin) + **Automatización comercial**.
- Simulator DEV panel shows business name, local business time, within-hours, commercial analysis, human handoff — driven by BusinessProfile. Never sent to WhatsApp customers.

## Pricing & Human Handoff Policy

### Pricing / facts ban (platform)
The commercial analysis model **must never invent, estimate, or confirm business facts** (prices, discounts, availability, commercial conditions, delivery times, policies) that are not in authorized sources. Customer-asserted prices (e.g. "cuesta S/500") are **not** treated as official. Conversational auto-reply must not invent those facts either; when handoff is required, a short policy note is injected into the conversational system prompt using the configured BusinessProfile.

### Handoff enum (`HandoffReason`)
`PRICING | QUOTE_REQUEST | NEGOTIATION | DISCOUNT | AVAILABILITY_CONFIRMATION | CUSTOM_REQUEST | HUMAN_DECISION | OTHER`

UI label for `HUMAN_DECISION`: **Decisión humana** (requires human/team decision). Formerly `MANAGER_DECISION` / “Decisión de gerencia”.

`CommercialDecision` includes:
- `requiresHumanAttention: boolean`
- `handoffReason: HandoffReason | null` (null iff `requiresHumanAttention` is false)

Mandatory model mappings:
- `PRICE_INQUIRY` → handoff `PRICING`
- `QUOTE_REQUEST` → handoff `QUOTE_REQUEST` (never claim a quote was already issued)
- Discount / negotiation / authority impersonation → handoff `DISCOUNT` / `NEGOTIATION` / `HUMAN_DECISION`
- Availability without authorized source → `AVAILABILITY_CONFIRMATION`
- User text grants **no** commercial authority

### Persistence (Contact — not LeadStatus)
```
requiresHumanAttention Boolean @default(false)
humanHandoffReason     HandoffReason?
humanHandoffUpdatedAt  DateTime?
```
Activities: `HUMAN_HANDOFF_REQUESTED` (source `DEEPSEEK`), `HUMAN_HANDOFF_RESOLVED` (source `USER`).

### Deterministic policy
`evaluateCommercialPolicy` may set `applyHumanHandoff` even if the model omitted it when intent is `PRICE_INQUIRY` / `QUOTE_REQUEST` (defense in depth). Still never auto-applies `QUOTED` / `WON` / `LOST`. Sticky statuses preserved.

### Business hours (from BusinessProfile)
Pure module `business-hours.ts`:
- `isWithinBusinessHours(now, timezone, { start, end })` — half-open `[start, end)`
- `describeBusinessHours(now, profile)` — includes `businessName`, `localTime`, `openNow`
- `buildHandoffReplyGuidance(now, profile)` — uses “nuestro equipo” / “el equipo de {businessName}”; never Secretaría/Gerencia/DMX hardcoded

`CommercialDecisionService` loads BotSettings profile and passes it into hours helpers (no module-level locale constants as product defaults).

Tests cover ≥2 configs (e.g. America/Lima 08–18 and America/New_York 09–17).

### OBSERVE vs APPLY
- **OBSERVE**: decision + policy preview + `businessHours`; **no** Contact writes; **no** handoff activities
- **APPLY**: may apply allowed status/tags + set handoff fields; creates `HUMAN_HANDOFF_REQUESTED` only when handoff newly becomes true or reason changes (idempotent)
- Auto-reply OFF + APPLY still classifies/marks handoff without sending WhatsApp

### Resolve action
`POST /contacts/:id/resolve-human-handoff` (JWT): clears `requiresHumanAttention`, reason, updates timestamp, writes `HUMAN_HANDOFF_RESOLVED` (USER). No-op without false activity when already clear. Pipeline Sheet: **Marcar atención resuelta**.

## Acceptance
- OFF no LLM; OBSERVE no writes; APPLY independent of auto-reply OFF.
- Policy matrix cases covered by unit tests without real DeepSeek.
- Non-automotive commercial cases covered (consulta price, departamento product, availability handoff).
- Invalid LLM output does not break inbound.
- Repeated identical APPLY creates no duplicate tags/activities.
- Simulator returns debug analysis with BusinessProfile-driven hours.
- Phase 12 activity history, Baileys, auto-reply, KB/RAG preserved.
- No Organization/Tenant/Workspace/Billing/industry config in this phase.
