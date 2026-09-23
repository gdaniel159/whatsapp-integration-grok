import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from '../chat/chat.service';
import {
  LlmService,
  renderWelcomeMessage,
  sanitizeWhatsAppPlainText,
} from './llm.service';
import { sanitizeConversationalInternalTokens } from './conversational-grounding';
import {
  buildHandoffReplyGuidance,
  businessProfileFromSettings,
} from './business-hours';
import {
  DEMO_WELCOME_MESSAGE,
  DEMO_FIRST_ACTION_UNUSED,
} from './demo-nova-servicios';

const DEFAULT_WELCOME = DEMO_WELCOME_MESSAGE;

/** Deprecated in conversational flow — kept for DB/API compatibility only. */
const DEFAULT_FIRST_ACTION = DEMO_FIRST_ACTION_UNUSED;

export type AutoReplyResult = {
  status: 'OK' | 'SKIPPED' | 'FAILED';
  detail?: string;
  welcomeSent: boolean;
  aiReplySent: boolean;
};

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
  ): Promise<AutoReplyResult> {
    if (this.busy.has(conversationId)) {
      this.logger.debug(`skip auto-reply (busy) ${conversationId}`);
      return {
        status: 'SKIPPED',
        detail: 'busy',
        welcomeSent: false,
        aiReplySent: false,
      };
    }
    this.busy.add(conversationId);
    try {
      // Global kill switch — before welcome / AI. Inbound persist+emit already done.
      const settings = await this.ensureBotSettings();
      if (!settings.globalAutoReplyEnabled) {
        this.logger.debug(
          `skip auto-reply (global OFF) ${conversationId}`,
        );
        return {
          status: 'SKIPPED',
          detail: 'global_off',
          welcomeSent: false,
          aiReplySent: false,
        };
      }

      const conv = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
      });
      if (!conv) {
        return {
          status: 'SKIPPED',
          detail: 'missing_conversation',
          welcomeSent: false,
          aiReplySent: false,
        };
      }
      if (conv.aiMode !== 'AI') {
        this.logger.debug(`skip auto-reply (MANUAL) ${conversationId}`);
        return {
          status: 'SKIPPED',
          detail: 'manual_mode',
          welcomeSent: false,
          aiReplySent: false,
        };
      }

      const inboundCount = await this.prisma.message.count({
        where: { conversationId, direction: 'IN' },
      });

      const isFirstInbound = inboundCount === 1;
      let welcomeSent = false;
      /** First inbound with a configured welcome → welcome only (no conversational LLM). */
      let skipConversationalForWelcome = false;

      if (isFirstInbound && this.isWelcomeConfigured(settings)) {
        welcomeSent = await this.sendWelcome(conversationId, settings);
        skipConversationalForWelcome = true;
      }

      let aiReplySent = false;
      if (!skipConversationalForWelcome) {
        aiReplySent = await this.sendAiReply(
          conversationId,
          userBody,
          opts?.requiresHumanAttention === true,
          settings,
        );
      }

      return {
        status: 'OK',
        welcomeSent,
        aiReplySent,
        detail: skipConversationalForWelcome
          ? 'welcome_only_first_inbound'
          : undefined,
      };
    } finally {
      this.busy.delete(conversationId);
    }
  }

  /** True when BotSettings has a non-empty welcome template (may include `{businessName}`). */
  private isWelcomeConfigured(settings: { welcomeMessage: string }): boolean {
    return Boolean(settings.welcomeMessage?.trim());
  }

  /**
   * Single welcomeMessage with `{businessName}` template.
   * firstAction/CTA is intentionally NOT concatenated anymore.
   */
  private async sendWelcome(
    conversationId: string,
    settings: {
      welcomeMessage: string;
      businessName?: string;
    },
  ): Promise<boolean> {
    const text = renderWelcomeMessage(
      settings.welcomeMessage,
      settings.businessName ?? '',
    );
    // Never send empty or unresolved admin placeholders to customers.
    if (!text || text.includes('{businessName}')) return false;
    try {
      await this.chat.sendMessage(conversationId, text);
      return true;
    } catch (e) {
      this.logger.warn(
        `welcome send failed: ${e instanceof Error ? e.message : e}`,
      );
      return false;
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
  ): Promise<boolean> {
    const kb = await this.prisma.knowledgeBase.findUnique({
      where: { id: 'default' },
    });
    const profile = businessProfileFromSettings(settings);

    // Recent history for grounding (exclude current inbound — passed as userBody).
    const recentRows = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      take: 8,
      select: { direction: true, body: true },
    });
    recentRows.reverse();
    const prior =
      recentRows.length > 0 ? recentRows.slice(0, -1) : recentRows;
    const recentHistory = prior.map((m) => ({
      role:
        m.direction === 'IN'
          ? ('customer' as const)
          : ('business' as const),
      text: m.body,
    }));

    let system = this.llm.buildSystemPrompt(kb?.content || '', profile, {
      userMessage: userBody,
      recentHistory,
    });
    if (requiresHumanAttention) {
      system = `${system}

${buildHandoffReplyGuidance(new Date(), profile)}`;
    }
    const rawReply =
      (await this.llm.chatCompletion(system, userBody)) ||
      this.llm.fallbackReply();
    // Conversational outbound only: plain-text Markdown strip + exact internal tokens.
    const reply = sanitizeConversationalInternalTokens(
      sanitizeWhatsAppPlainText(rawReply),
    );

    try {
      await this.chat.sendMessage(conversationId, reply);
      return true;
    } catch (e) {
      this.logger.warn(
        `AI reply send failed: ${e instanceof Error ? e.message : e}`,
      );
      return false;
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
