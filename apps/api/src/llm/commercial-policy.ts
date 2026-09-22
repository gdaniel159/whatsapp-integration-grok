import { Contact, HandoffReason, LeadStatus } from '@prisma/client';
import {
  CommercialDecision,
  CommercialIntent,
} from './commercial-decision.schema';

export const COMMERCIAL_CONFIDENCE_THRESHOLD = 0.72;
export const MAX_COMMERCIAL_TAGS_PER_ANALYSIS = 5;
export const MAX_COMMERCIAL_TAG_LENGTH = 40;

export type CommercialPolicyContact = Pick<Contact, 'leadStatus' | 'tags'>;

export type CommercialPolicyHandoff = {
  requiresHumanAttention: true;
  reason: HandoffReason;
};

export type CommercialPolicyResult = {
  applyStatus?: LeadStatus;
  addTags: string[];
  rejectedChanges: string[];
  applyHumanHandoff?: CommercialPolicyHandoff;
};

const PROMOTING_INTENTS: CommercialIntent[] = [
  'PRODUCT_INQUIRY',
  'PRICE_INQUIRY',
  'QUOTE_REQUEST',
  'PURCHASE_INTENT',
];

const STICKY_STATUSES = new Set<LeadStatus>([
  LeadStatus.QUOTED,
  LeadStatus.WON,
  LeadStatus.LOST,
]);

const FORCE_HANDOFF_BY_INTENT: Partial<
  Record<CommercialIntent, HandoffReason>
> = {
  PRICE_INQUIRY: HandoffReason.PRICING,
  QUOTE_REQUEST: HandoffReason.QUOTE_REQUEST,
};

/**
 * Pure, deterministic authority over all model suggestions.
 *
 * Transition matrix (automation only):
 * - NEW + GENERAL_INQUIRY / OTHER / POST_SALE → no status change
 * - NEW|IN_PROGRESS + PRODUCT|PRICE|QUOTE|PURCHASE (+ confidence) → INTERESTED
 * - QUOTE_REQUEST never auto-applies QUOTED — cap INTERESTED + human handoff
 * - PRICE_INQUIRY → INTERESTED (if allowed) + human handoff PRICING
 * - DISCOUNT/NEGOTIATION/HUMAN_DECISION handoff reasons → human handoff, no invented discounts
 * - QUOTED|WON|LOST sticky — no auto regression or reactivation
 * - suggested WON/LOST/QUOTED always rejected for auto-apply
 */
export function evaluateCommercialPolicy(
  contact: CommercialPolicyContact,
  decision: CommercialDecision,
): CommercialPolicyResult {
  const rejectedChanges: string[] = [];
  let applyStatus: LeadStatus | undefined;

  if (
    decision.suggestedStatus === LeadStatus.WON ||
    decision.suggestedStatus === LeadStatus.LOST
  ) {
    rejectedChanges.push(
      `Estado ${decision.suggestedStatus} rechazado: requiere acción manual`,
    );
  }

  if (decision.suggestedStatus === LeadStatus.QUOTED) {
    rejectedChanges.push(
      'QUOTED rechazado: solicitar cotización no acredita una cotización emitida',
    );
  }

  if (decision.confidence < COMMERCIAL_CONFIDENCE_THRESHOLD) {
    rejectedChanges.push('Confianza insuficiente para automatizar cambios');
  } else if (STICKY_STATUSES.has(contact.leadStatus)) {
    if (
      decision.suggestedStatus &&
      decision.suggestedStatus !== contact.leadStatus
    ) {
      rejectedChanges.push(
        `Estado ${contact.leadStatus} protegido: sin reactivación ni regresión automática`,
      );
    }
  } else if (PROMOTING_INTENTS.includes(decision.intent)) {
    // A request for a quote is not an issued quote. Cap at INTERESTED.
    if (
      contact.leadStatus === LeadStatus.NEW ||
      contact.leadStatus === LeadStatus.IN_PROGRESS
    ) {
      applyStatus = LeadStatus.INTERESTED;
    }
  } else if (
    decision.suggestedStatus &&
    decision.suggestedStatus !== contact.leadStatus
  ) {
    rejectedChanges.push(
      `Cambio de estado rechazado para intención ${decision.intent}`,
    );
  }

  const addTags: string[] = [];
  if (
    decision.confidence >= COMMERCIAL_CONFIDENCE_THRESHOLD &&
    PROMOTING_INTENTS.includes(decision.intent)
  ) {
    const seen = new Set(
      contact.tags.map((tag) => tag.trim().toLocaleLowerCase()),
    );
    for (const raw of decision.suggestedTags) {
      if (addTags.length >= MAX_COMMERCIAL_TAGS_PER_ANALYSIS) break;
      const tag = raw
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, MAX_COMMERCIAL_TAG_LENGTH);
      const key = tag.toLocaleLowerCase();
      if (!tag || seen.has(key)) continue;
      if (['won', 'lost', 'ganado', 'perdido'].includes(key)) {
        rejectedChanges.push(`Etiqueta de estado rechazada: ${tag}`);
        continue;
      }
      seen.add(key);
      addTags.push(tag);
    }
  } else if (decision.suggestedTags.length > 0) {
    rejectedChanges.push(
      'Etiquetas rechazadas: intención o confianza insuficiente',
    );
  }

  const applyHumanHandoff = resolveHumanHandoff(decision, rejectedChanges);

  return { applyStatus, addTags, rejectedChanges, applyHumanHandoff };
}

function resolveHumanHandoff(
  decision: CommercialDecision,
  rejectedChanges: string[],
): CommercialPolicyHandoff | undefined {
  const forced = FORCE_HANDOFF_BY_INTENT[decision.intent];
  if (forced) {
    return { requiresHumanAttention: true, reason: forced };
  }

  if (
    decision.handoffReason === HandoffReason.DISCOUNT ||
    decision.handoffReason === HandoffReason.NEGOTIATION ||
    decision.handoffReason === HandoffReason.HUMAN_DECISION ||
    decision.handoffReason === HandoffReason.AVAILABILITY_CONFIRMATION ||
    decision.handoffReason === HandoffReason.CUSTOM_REQUEST ||
    decision.handoffReason === HandoffReason.PRICING ||
    decision.handoffReason === HandoffReason.QUOTE_REQUEST
  ) {
    return {
      requiresHumanAttention: true,
      reason: decision.handoffReason,
    };
  }

  if (decision.requiresHumanAttention) {
    return {
      requiresHumanAttention: true,
      reason: decision.handoffReason ?? HandoffReason.OTHER,
    };
  }

  // Defense: never auto-apply commercial authority claimed in user text.
  if (
    decision.suggestedStatus === LeadStatus.WON ||
    decision.suggestedStatus === LeadStatus.QUOTED
  ) {
    rejectedChanges.push(
      'Autoridad comercial insuficiente: se requiere handoff humano',
    );
  }

  return undefined;
}
