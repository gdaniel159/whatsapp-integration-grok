import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from '../chat/chat.service';
import { LlmService } from './llm.service';
import {
  buildHandoffReplyGuidance,
  businessProfileFromSettings,
} from './business-hours';

const DEFAULT_WELCOME =
  '¡Hola! 👋 Bienvenido/a. Soy el asistente virtual de nuestro negocio. Estoy aquí para ayudarte con información sobre productos, servicios y horarios.';

const DEFAULT_FIRST_ACTION =
  'Escribe 1 para precios, 2 para horarios, o cuéntame en qué puedo ayudarte.';

@Injectable()
export class AutoReplyService {
  private readonly logger = new Logger(AutoReplyService.name);
  /** Prevent overlapping auto-replies for the same conversation */
  private readonly busy = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    @Inject(forwardRef(() => ChatService))
    private readonly chat: ChatService,
  ) {}

  /**
   * Fire-and-forget safe entry: never throws to caller.
   * Call after inbound message is persisted.
   */
  handleInboundAsync(
    conversationId: string,
    userBody: string,
    opts?: { requiresHumanAttention?: boolean },
  ) {
    void this.handleInbound(conversationId, userBody, opts).catch((e) =>
      this.logger.warn(
        `auto-reply failed: ${e instanceof Error ? e.message : e}`,
      ),
    );
  }

  async handleInbound(
    conversationId: string,
    userBody: string,
    opts?: { requiresHumanAttention?: boolean },
  ) {
    if (this.busy.has(conversationId)) {
      this.logger.debug(`skip auto-reply (busy) ${conversationId}`);
      return;
    }
    this.busy.add(conversationId);
    try {
      // Global kill switch — before welcome / AI. Inbound persist+emit already done.
      const settings = await this.ensureBotSettings();
      if (!settings.globalAutoReplyEnabled) {
        this.logger.debug(
          `skip auto-reply (global OFF) ${conversationId}`,
        );
        return;
      }

      const conv = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
      });
      if (!conv) return;
      if (conv.aiMode !== 'AI') {
        this.logger.debug(`skip auto-reply (MANUAL) ${conversationId}`);
        return;
      }

      const inboundCount = await this.prisma.message.count({
        where: { conversationId, direction: 'IN' },
      });

      if (inboundCount === 1) {
        await this.sendWelcome(conversationId, settings);
      }

      await this.sendAiReply(
        conversationId,
        userBody,
        opts?.requiresHumanAttention === true,
        settings,
      );
    } finally {
      this.busy.delete(conversationId);
    }
  }

  private async sendWelcome(
    conversationId: string,
    settings: {
      welcomeMessage: string;
      firstAction: string;
    },
  ) {
    const text = [settings.welcomeMessage.trim(), settings.firstAction.trim()]
      .filter(Boolean)
      .join('\n\n');
    if (!text) return;
    try {
      await this.chat.sendMessage(conversationId, text);
    } catch (e) {
      this.logger.warn(
        `welcome send failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  private async sendAiReply(
    conversationId: string,
    userBody: string,
    requiresHumanAttention = false,
    settings?: {
      businessName?: string;
      timezone?: string;
      businessHoursStart?: string;
      businessHoursEnd?: string;
    },
  ) {
    const kb = await this.prisma.knowledgeBase.findUnique({
      where: { id: 'default' },
    });
    let system = this.llm.buildSystemPrompt(kb?.content || '');
    if (requiresHumanAttention) {
      const profile = businessProfileFromSettings(settings);
      system = `${system}

${buildHandoffReplyGuidance(new Date(), profile)}`;
    }
    const reply =
      (await this.llm.chatCompletion(system, userBody)) ||
      this.llm.fallbackReply();

    try {
      await this.chat.sendMessage(conversationId, reply);
    } catch (e) {
      this.logger.warn(
        `AI reply send failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  /** Ensure singleton exists; new installs get globalAutoReplyEnabled: false. */
  async ensureBotSettings() {
    return this.prisma.botSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: {
        id: 'default',
        welcomeMessage: DEFAULT_WELCOME,
        firstAction: DEFAULT_FIRST_ACTION,
        globalAutoReplyEnabled: false,
        commercialAutomationMode: 'OFF',
      },
    });
  }
}
