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
  CommercialDecisionDiagnostics,
  safeParseCommercialDecision,
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
const COMMERCIAL_TIMEOUT_MS = 15_000;
/** R1 distill spends tokens on thinking — leave headroom for JSON. */
const COMMERCIAL_MAX_TOKENS = 768;

export type CommercialContextTurn = {
  role: 'CUSTOMER' | 'BUSINESS';
  text: string;
};

export type CommercialAnalysisContextPayload = {
  currentContact: { leadStatus: LeadStatus; tags: string[] };
  /** Sole evidentiary source for suggestedTags — CUSTOMER utterances only. */
  customerEvidence: Array<{ text: string }>;
  /**
   * Full recent window with roles. BUSINESS/assistant turns are conversational
   * context only — never evidence for suggestedTags.
   */
  recentConversation: CommercialContextTurn[];
  tagEvidenceRule: string;
};

/**
 * Build CommercialDecision user-context JSON.
 * Isolates client evidence from assistant/KB contamination for suggestedTags.
 */
export function buildCommercialAnalysisContext(input: {
  leadStatus: LeadStatus;
  tags: string[];
  recent: Array<{ direction: MessageDirection | string; body: string }>;
}): CommercialAnalysisContextPayload {
  const recentConversation: CommercialContextTurn[] = input.recent.map(
    (message) => ({
      role:
        message.direction === MessageDirection.IN ||
        message.direction === 'IN'
          ? 'CUSTOMER'
          : 'BUSINESS',
      text: message.body.slice(0, MAX_BODY_CHARS),
    }),
  );
  const customerEvidence = recentConversation
    .filter((t) => t.role === 'CUSTOMER')
    .map((t) => ({ text: t.text }));
  return {
    currentContact: {
      leadStatus: input.leadStatus,
      tags: input.tags,
    },
    customerEvidence,
    recentConversation,
    tagEvidenceRule:
      'suggestedTags MUST come only from customerEvidence / CUSTOMER role. ' +
      'Never tag from BUSINESS/assistant text, KB, BusinessProfile, system, or few-shots.',
  };
}

export type CommercialAnalysisOutcome =
  | 'DISABLED'
  | 'APPLIED'
  | 'OBSERVED'
  | 'REJECTED'
  | 'NO_CHANGES';

export type CommercialValidationStatus = 'VALID' | 'INVALID' | null;

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
  /** VALID/INVALID when analysis ran; null when DISABLED */
  validationStatus: CommercialValidationStatus;
  /** DEV-safe parse diagnostics when INVALID; omitted/null in production */
  diagnostics: CommercialDecisionDiagnostics | null;
};

function isDevEnv(): boolean {
  return process.env.NODE_ENV !== 'production';
}

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
      const diagnostics: CommercialDecisionDiagnostics = {
        code: 'LLM_UNAVAILABLE',
        message: reason,
        fieldErrors: [],
      };
      return {
        mode: settings.commercialAutomationMode,
        ran: true,
        decision: null,
        preview: null,
        appliedStatus: null,
        appliedTags: [],
        appliedHumanHandoff: false,
        outcome: 'REJECTED',
        reason: isDevEnv() ? reason : 'Análisis comercial no disponible',
        businessHours,
        validationStatus: 'INVALID',
        diagnostics: isDevEnv() ? diagnostics : null,
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
        validationStatus: null,
        diagnostics: null,
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

    const contextPayload = buildCommercialAnalysisContext({
      leadStatus: conversation.contact.leadStatus,
      tags: conversation.contact.tags,
      recent,
    });

    const raw = await this.llm.chatCompletion(
      buildCommercialAnalysisPrompt(),
      JSON.stringify(contextPayload),
      {
        maxTokens: COMMERCIAL_MAX_TOKENS,
        temperature: 0,
        timeoutMs: COMMERCIAL_TIMEOUT_MS,
        jsonMode: true,
      },
    );

    const parsed = safeParseCommercialDecision(raw);
    if (!parsed.ok) {
      const diagnostics: CommercialDecisionDiagnostics = {
        ...parsed.diagnostics,
      };
      if (diagnostics.code === 'EMPTY_RESPONSE') {
        if (!this.llm.getToken()) {
          diagnostics.code = 'LLM_UNAVAILABLE';
          diagnostics.message =
            'HF_TOKEN ausente — análisis comercial no disponible';
        } else {
          diagnostics.message =
            'DeepSeek no devolvió un análisis válido (vacío tras thinking/timeout)';
        }
      }
      this.logger.warn(
        `commercial decision rejected: ${diagnostics.code} ${diagnostics.message}` +
          (diagnostics.fieldErrors.length
            ? ` fields=${diagnostics.fieldErrors.map((f) => f.path).join(',')}`
            : ''),
      );
      return {
        mode,
        ran: true,
        decision: null,
        preview: null,
        appliedStatus: null,
        appliedTags: [],
        appliedHumanHandoff: false,
        outcome: 'REJECTED',
        reason: isDevEnv()
          ? diagnostics.message
          : 'Análisis comercial no disponible',
        businessHours,
        validationStatus: 'INVALID',
        diagnostics: isDevEnv() ? diagnostics : null,
      };
    }

    const decision = parsed.decision;
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
        validationStatus: 'VALID',
        diagnostics: null,
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
      validationStatus: 'VALID',
      diagnostics: null,
    };
  }
}
