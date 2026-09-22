import { Injectable, Logger } from '@nestjs/common';
import {
  CommercialAutomationMode,
  LeadStatus,
  MessageDirection,
  type BotSettings,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ContactsService } from '../contacts/contacts.service';
import { LlmService } from './llm.service';
import {
  buildCommercialAnalysisPrompt,
  CommercialDecision,
  parseCommercialDecision,
} from './commercial-decision.schema';
import {
  CommercialPolicyResult,
  evaluateCommercialPolicy,
} from './commercial-policy';
import {
  businessProfileFromSettings,
  describeBusinessHours,
  type BusinessHoursDescription,
} from './business-hours';

const RECENT_MESSAGE_LIMIT = 6;
const MAX_BODY_CHARS = 500;
const COMMERCIAL_TIMEOUT_MS = 10_000;

export type CommercialAnalysisOutcome =
  | 'DISABLED'
  | 'APPLIED'
  | 'OBSERVED'
  | 'REJECTED'
  | 'NO_CHANGES';

export type CommercialAnalysisResult = {
  mode: CommercialAutomationMode;
  ran: boolean;
  decision: CommercialDecision | null;
  preview: CommercialPolicyResult | null;
  appliedStatus: LeadStatus | null;
  appliedTags: string[];
  appliedHumanHandoff: boolean;
  outcome: CommercialAnalysisOutcome;
  reason: string;
  businessHours: BusinessHoursDescription;
};

@Injectable()
export class CommercialDecisionService {
  private readonly logger = new Logger(CommercialDecisionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly contacts: ContactsService,
  ) {}

  /** Fire-and-forget for Baileys; never rejects into the inbound caller. */
  handleInboundAsync(conversationId: string): void {
    void this.handleInbound(conversationId).catch((error) => {
      this.logger.warn(
        `commercial analysis failed: ${
          error instanceof Error ? error.message : error
        }`,
      );
    });
  }

  async handleInbound(
    conversationId: string,
  ): Promise<CommercialAnalysisResult> {
    const settings = await this.prisma.botSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: {
        id: 'default',
        welcomeMessage: '',
        firstAction: '',
        globalAutoReplyEnabled: false,
        commercialAutomationMode: CommercialAutomationMode.OFF,
      },
    });
    const profile = businessProfileFromSettings(settings);
    const businessHours = describeBusinessHours(new Date(), profile);

    try {
      return await this.analyzeAndMaybeApply(
        conversationId,
        settings,
        businessHours,
      );
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'Error de análisis comercial';
      this.logger.warn(`commercial analysis rejected: ${reason}`);
      return {
        mode: settings.commercialAutomationMode,
        ran: true,
        decision: null,
        preview: null,
        appliedStatus: null,
        appliedTags: [],
        appliedHumanHandoff: false,
        outcome: 'REJECTED',
        reason,
        businessHours,
      };
    }
  }

  private async analyzeAndMaybeApply(
    conversationId: string,
    settings: BotSettings,
    businessHours: BusinessHoursDescription,
  ): Promise<CommercialAnalysisResult> {
    const mode = settings.commercialAutomationMode;

    if (mode === CommercialAutomationMode.OFF) {
      return {
        mode,
        ran: false,
        decision: null,
        preview: null,
        appliedStatus: null,
        appliedTags: [],
        appliedHumanHandoff: false,
        outcome: 'DISABLED',
        reason: 'Análisis comercial desactivado',
        businessHours,
      };
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { contact: true },
    });
    if (!conversation?.contact) {
      throw new Error('Conversación sin contacto comercial');
    }

    const recent = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      take: RECENT_MESSAGE_LIMIT,
      select: { direction: true, body: true },
    });
    recent.reverse();

    const contextPayload = {
      currentContact: {
        leadStatus: conversation.contact.leadStatus,
        tags: conversation.contact.tags,
      },
      recentConversation: recent.map((message) => ({
        role:
          message.direction === MessageDirection.IN ? 'CUSTOMER' : 'BUSINESS',
        text: message.body.slice(0, MAX_BODY_CHARS),
      })),
    };

    const raw = await this.llm.chatCompletion(
      buildCommercialAnalysisPrompt(),
      JSON.stringify(contextPayload),
      {
        maxTokens: 320,
        temperature: 0,
        timeoutMs: COMMERCIAL_TIMEOUT_MS,
      },
    );
    if (!raw) throw new Error('DeepSeek no devolvió un análisis válido');

    const decision = parseCommercialDecision(raw);
    const preview = evaluateCommercialPolicy(conversation.contact, decision);

    if (mode === CommercialAutomationMode.OBSERVE) {
      return {
        mode,
        ran: true,
        decision,
        preview,
        appliedStatus: null,
        appliedTags: [],
        appliedHumanHandoff: false,
        outcome: 'OBSERVED',
        reason: decision.reason,
        businessHours,
      };
    }

    const applied = await this.contacts.applyCommercialAutomation(
      conversation.contact.id,
      {
        applyStatus: preview.applyStatus,
        addTags: preview.addTags,
        applyHumanHandoff: preview.applyHumanHandoff,
      },
      {
        intent: decision.intent,
        confidence: decision.confidence,
        reason: decision.reason,
      },
    );

    const changed =
      applied.appliedStatus != null ||
      applied.appliedTags.length > 0 ||
      applied.appliedHumanHandoff;

    return {
      mode,
      ran: true,
      decision,
      preview,
      appliedStatus: applied.appliedStatus,
      appliedTags: applied.appliedTags,
      appliedHumanHandoff: applied.appliedHumanHandoff,
      outcome: changed
        ? 'APPLIED'
        : preview.rejectedChanges.length > 0
          ? 'REJECTED'
          : 'NO_CHANGES',
      reason: decision.reason,
      businessHours,
    };
  }
}
