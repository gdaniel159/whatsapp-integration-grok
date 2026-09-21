import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

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
    opts?: { model?: string; maxTokens?: number },
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

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          max_tokens: opts?.maxTokens ?? 512,
          temperature: 0.4,
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
      // Strip DeepSeek-R1 style <think>...</think> blocks if present
      content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      return content || null;
    } catch (e) {
      this.logger.warn(
        `HF request error: ${e instanceof Error ? e.message : e}`,
      );
      return null;
    }
  }

  fallbackReply(): string {
    return FALLBACK_REPLY;
  }

  buildSystemPrompt(kbContent: string): string {
    return `Eres un asistente de atención al cliente por WhatsApp para un negocio.
Responde SIEMPRE en español, de forma breve y amable (estilo WhatsApp: párrafos cortos, sin markdown pesado).
Usa SOLO la base de conocimiento siguiente. Si no sabes la respuesta, dilo con honestidad y ofrece que un asesor humano continúe.
No inventes precios, horarios ni datos que no estén en la KB.
No uses emojis en exceso (máximo 1–2).

# Base de conocimiento
${kbContent || '(vacía — indica que un asesor te atenderá pronto)'}
`;
  }
}
