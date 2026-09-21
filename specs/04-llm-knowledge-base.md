# 04 — LLM / Knowledge Base (DeepSeek via Hugging Face)

## Estado
**Implementado.** Auto-respuestas con Hugging Face Inference Router (OpenAI-compatible) + base de conocimiento editable + bienvenida/primera acción + toggle IA/Manual por conversación.

El archivo `04-llm-knowledge-base-future.md` queda como puntero histórico.

## Objetivo
1. Responder automáticamente mensajes entrantes usando la KB del negocio + intención del usuario.
2. En el **primer** mensaje inbound de una conversación: enviar bienvenida + primera acción (CTA), luego la respuesta IA.
3. Permitir pasar la conversación a **Manual** (sin autofire).

## Modelo / API
- Env: `HF_TOKEN` (requerido para LLM real), `HF_MODEL` (default `deepseek-ai/DeepSeek-R1-Distill-Qwen-7B`).
- Router: `https://router.huggingface.co/v1/chat/completions` (base `https://router.huggingface.co/v1`).
- Override opcional por fila `BotSettings.hfModel`.
- Sin `HF_TOKEN`: log warning + fallback `"Un asesor te atenderá pronto."`

## Persistencia
| Modelo | Rol |
|--------|-----|
| `KnowledgeBase` | Singleton `id=default`, `content` Text (markdown), `updatedAt` |
| `BotSettings` | Singleton: `welcomeMessage`, `firstAction`, `hfModel?` |
| `Conversation.aiMode` | enum `AI` \| `MANUAL` @default(`AI`) |

## API REST (JWT)
| Método | Ruta | Body |
|--------|------|------|
| GET/PUT | `/knowledge-base` | `{ content }` (PUT) |
| GET/PATCH | `/bot-settings` | `{ welcomeMessage?, firstAction?, hfModel? }` |
| PATCH | `/conversations/:id/ai-mode` | `{ aiMode: 'AI'\|'MANUAL' }` |
| GET | `/llm/health` | estado token/modelo |

## Flujo inbound
1. Baileys `messages.upsert` → `ChatService.persistIncoming`.
2. Si `aiMode === AI` → `AutoReplyService` (async, no bloquea):
   - Si count(IN) == 1 → enviar `welcomeMessage` + `firstAction`.
   - Llamar HF con system prompt (KB + reglas ES + estilo WhatsApp corto) + mensaje usuario.
   - Enviar reply vía `ChatService.sendMessage` (WA + DB + Socket.IO).
3. Si `MANUAL` → no autofire.

## UI (web)
- Tab **Base de conocimiento**: editor KB + bienvenida/primera acción + modelo HF opcional.
- Header del chat: switch **IA / Manual**.

## Seed
Bienvenida genérica en español, CTA `"Escribe 1 para precios, 2 para horarios…"`, KB placeholder markdown.
