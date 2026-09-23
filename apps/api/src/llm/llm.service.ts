import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  businessProfileFromSettings,
  describeBusinessHours,
  type BusinessProfile,
} from './business-hours';

/** Strip R1/DeepSeek think blocks, including truncated unclosed tags. */
export function stripThinkBlocks(content: string): string {
  let out = content.replace(/<think>[\s\S]*?<\/think>/gi, '');
  out = out.replace(/<think>[\s\S]*$/gi, '');
  return out.trim();
}

/**
 * Defensive WhatsApp plain-text sanitizer: strip simple Markdown markers
 * without semantic rewrite (no paraphrasing, no inventing content).
 */
export function sanitizeWhatsAppPlainText(input: string): string {
  let out = String(input ?? '');
  // Fenced code blocks → inner text
  out = out.replace(/```(?:[a-zA-Z0-9_-]*)?\s*([\s\S]*?)```/g, '$1');
  // Inline code
  out = out.replace(/`([^`]+)`/g, '$1');
  // Bold / strong
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1');
  out = out.replace(/__([^_]+)__/g, '$1');
  // Italic (single * or _)
  out = out.replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, '$1');
  out = out.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '$1');
  // Headings at line start
  out = out.replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '');
  // Unordered / ordered list markers at line start
  out = out.replace(/^[ \t]*[-*+][ \t]+/gm, '');
  out = out.replace(/^[ \t]*\d+\.[ \t]+/gm, '');
  // Links [label](url) → label
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
  // Collapse leftover fence markers
  out = out.replace(/```+/g, '');
  // Trim trailing spaces per line; keep paragraph breaks
  out = out
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return out;
}

/** Simple `{businessName}` template replace for welcome messages. */
export function renderWelcomeMessage(
  template: string,
  businessName: string,
): string {
  const name = businessName.trim() || 'nuestro negocio';
  return template.split('{businessName}').join(name).trim();
}

const HF_ROUTER_BASE = 'https://router.huggingface.co/v1';
const DEFAULT_MODEL = 'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B';
const FALLBACK_REPLY = 'Un asesor te atenderá pronto.';

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  getToken(): string | undefined {
    const t = this.config.get<string>('HF_TOKEN')?.trim();
    return t || undefined;
  }

  async resolveModel(): Promise<string> {
    const settings = await this.prisma.botSettings.findUnique({
      where: { id: 'default' },
    });
    return (
      settings?.hfModel?.trim() ||
      this.config.get<string>('HF_MODEL')?.trim() ||
      DEFAULT_MODEL
    );
  }

  /**
   * OpenAI-compatible chat completion via Hugging Face Inference Router.
   * Returns null if HF_TOKEN is missing (caller should use fallback).
   */
  async chatCompletion(
    systemPrompt: string,
    userMessage: string,
    opts?: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      timeoutMs?: number;
      /** Request JSON object output when the router/model supports it. */
      jsonMode?: boolean;
    },
  ): Promise<string | null> {
    const token = this.getToken();
    if (!token) {
      this.logger.warn(
        'HF_TOKEN missing — skipping LLM call; use fallback reply',
      );
      return null;
    }

    const model = opts?.model || (await this.resolveModel());
    const url = `${HF_ROUTER_BASE}/chat/completions`;

    const controller = opts?.timeoutMs
      ? new AbortController()
      : undefined;
    const timeout = controller
      ? setTimeout(() => controller.abort(), opts!.timeoutMs)
      : undefined;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal: controller?.signal,
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          max_tokens: opts?.maxTokens ?? 512,
          temperature: opts?.temperature ?? 0.4,
          ...(opts?.jsonMode
            ? { response_format: { type: 'json_object' } }
            : {}),
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        this.logger.warn(
          `HF chat completions failed ${res.status}: ${errText.slice(0, 300)}`,
        );
        return null;
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      let content = data?.choices?.[0]?.message?.content?.trim() || '';
      content = stripThinkBlocks(content);
      return content || null;
    } catch (e) {
      this.logger.warn(
        `HF request error: ${e instanceof Error ? e.message : e}`,
      );
      return null;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  fallbackReply(): string {
    return FALLBACK_REPLY;
  }

  buildSystemPrompt(
    kbContent: string,
    profile?: BusinessProfile | null,
  ): string {
    const p = profile ?? businessProfileFromSettings(null);
    const hours = describeBusinessHours(new Date(), p);
    const bizLine = p.businessName.trim()
      ? `Negocio: ${p.businessName.trim()}`
      : 'Negocio: (nombre no configurado)';

    return `Eres un asistente de atención al cliente por WhatsApp.
Responde SIEMPRE en español (si el cliente escribe en español), breve, natural y amable. Sin relleno especulativo.
Estilo WhatsApp: texto plano solamente. PROHIBIDO Markdown: no uses **negrita**, *cursiva*, # encabezados, listas con -/*/1., ni bloques \`\`\` fences. No uses HTML.
${bizLine}
Horario oficial (BusinessProfile — fuente de verdad): ${hours.start}–${hours.end} (${hours.timezone}). Hora local aproximada: ${hours.localTime}. Ahora: ${hours.openNow ? 'dentro de horario' : 'fuera de horario'}.
Si la información de referencia menciona otros horarios, prevalece BusinessProfile.
NO menciones el horario ni la hora local salvo que el cliente pregunte por horarios o disponibilidad temporal.

Fuentes autorizadas ÚNICAS: la información de referencia de abajo y BusinessProfile (nombre/horario). No uses conocimiento externo.
NUNCA inventes precios, direcciones, ubicaciones, descuentos, disponibilidad, plazos ni políticas que no estén explícitas en esas fuentes.
Si preguntan precio o cotización y no hay tarifa autorizada, indícalo con honestidad y ofrece que un asesor humano continúe (no inventes cifras).
Si preguntan dirección o ubicación y NO está en la información de referencia, reconócelo con honestidad (no inventes una dirección) y ofrece handoff a un asesor humano cuando corresponda.
Si no sabes la respuesta, dilo y ofrece handoff humano.
Responde solo a lo preguntado; no mezcles horarios, precios u otros datos no solicitados.
No menciones "base de conocimiento", "KB", prompts, sistema, modelos ni herramientas internas.
No uses emojis en exceso (máximo 1–2).

Información de referencia autorizada:
${kbContent || '(vacía — indica que un asesor te atenderá pronto)'}
`;
  }
}
