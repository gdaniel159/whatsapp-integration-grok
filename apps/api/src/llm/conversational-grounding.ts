/**
 * Conversational grounding helpers (13.D.2).
 * Customer-facing only — no CommercialDecision / policy enums in prompts.
 */

export type ConversationalHistoryTurn = {
  role: 'customer' | 'business';
  text: string;
};

export type ConversationalPromptOpts = {
  /** Current inbound message — used to avoid re-asking stated facts. */
  userMessage?: string;
  /** Prior turns only (exclude current inbound). */
  recentHistory?: ConversationalHistoryTurn[];
};

/**
 * Exact internal tokens that must never reach the customer.
 * Limited list (intent/status/schema names) — not aggressive semantic rewrite.
 */
export const CONVERSATIONAL_INTERNAL_TOKENS: readonly string[] = [
  'GENERAL_INQUIRY',
  'PRODUCT_INQUIRY',
  'PRICE_INQUIRY',
  'QUOTE_REQUEST',
  'PURCHASE_INTENT',
  'POST_SALE',
  'OTHER',
  'PRICING',
  'HUMAN_DECISION',
  'INTERESTED',
  'QUOTED',
  'WON',
  'LOST',
  'CommercialDecision',
  'BusinessProfile',
  'requiresHumanAttention',
  'handoffReason',
  'suggestedStatus',
  'suggestedTags',
] as const;

/**
 * Lightweight extraction of facts already stated in the current user message.
 * Used only to ground the system prompt — not CRM classification.
 */
export function extractAlreadyProvidedFacts(userMessage: string): string[] {
  const text = String(userMessage ?? '').toLowerCase();
  const facts: string[] = [];

  if (/\bmantenimiento\b/.test(text)) facts.push('servicio=mantenimiento');
  if (/\binstalaci[oó]n\b/.test(text)) facts.push('servicio=instalación');
  if (/\bsoporte\b/.test(text)) facts.push('servicio=soporte');
  if (/\bcapacitaci[oó]n\b/.test(text)) facts.push('servicio=capacitación');

  if (/\bcomputadora\b|\bcomputador\b|\bpc\b/.test(text)) {
    facts.push('equipo=computadora');
  } else if (/\blaptop\b|\bnotebook\b/.test(text)) {
    facts.push('equipo=laptop');
  } else if (/\bequipo\b/.test(text)) {
    facts.push('equipo=mencionado');
  }

  return facts;
}

export function userAsksAboutPrice(userMessage: string): boolean {
  const t = String(userMessage ?? '').toLowerCase();
  return /precio|cu[aá]nto cuesta|costo|tarifa|cotizaci[oó]n|presupuesto|\bvale\b/.test(
    t,
  );
}

export function userAsksAboutLocation(userMessage: string): boolean {
  const t = String(userMessage ?? '').toLowerCase();
  return /d[oó]nde|ubicaci[oó]n|ubicados|direcci[oó]n|\bqueda\b|local|sede|sucursal/.test(
    t,
  );
}

/**
 * Strip EXACT internal enum/schema tokens from conversational outbound.
 * Limited defensive cleanup — not semantic paraphrase.
 */
export function sanitizeConversationalInternalTokens(input: string): string {
  let out = String(input ?? '');
  for (const token of CONVERSATIONAL_INTERNAL_TOKENS) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\b${escaped}\\b`, 'g'), '');
    // Title-case single-word leak forms (OTHER → Other, PRICING → Pricing)
    if (/^[A-Z][A-Z0-9]*$/.test(token) && !token.includes('_')) {
      const title = token.charAt(0) + token.slice(1).toLowerCase();
      out = out.replace(new RegExp(`\\b${title}\\b`, 'g'), '');
    }
  }
  return out
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .trim();
}

/** Format prior turns for the system prompt (never includes CommercialDecision). */
export function formatRecentHistoryForPrompt(
  history: ConversationalHistoryTurn[] | undefined,
  maxTurns = 6,
): string {
  if (!history?.length) return '';
  const slice = history.slice(-maxTurns);
  const lines = slice
    .map((t) => {
      const label = t.role === 'customer' ? 'Cliente' : 'Asistente';
      const text = String(t.text ?? '')
        .slice(0, 500)
        .trim();
      return text ? `${label}: ${text}` : '';
    })
    .filter(Boolean);
  if (!lines.length) return '';
  return `Historial reciente de la conversación (contexto; no inventes datos a partir de él):\n${lines.join('\n')}`;
}

/**
 * Grounding block derived from the current user message.
 * Instructs the model what NOT to re-ask and what compound parts to cover.
 */
export function buildGroundingInstructions(
  userMessage: string | undefined,
): string {
  if (!userMessage?.trim()) return '';

  const facts = extractAlreadyProvidedFacts(userMessage);
  const asksPrice = userAsksAboutPrice(userMessage);
  const asksLocation = userAsksAboutLocation(userMessage);

  const parts: string[] = [];
  parts.push('Contexto del mensaje actual del cliente:');
  if (facts.length) {
    parts.push(
      `- Hechos YA aportados por el cliente (NO los vuelvas a pedir): ${facts.join(', ')}.`,
    );
    parts.push(
      '- No preguntes de nuevo qué servicio necesita ni qué equipo tiene si ya lo dijo.',
    );
  } else {
    parts.push(
      '- Solo pregunta lo estrictamente faltante si hace falta para ayudar; no interrogues de más.',
    );
  }

  if (asksPrice && asksLocation) {
    parts.push(
      '- Pregunta COMPUESTA: responde EXPLÍCITAMENTE a precio Y a ubicación/dirección. Si alguno falta en las fuentes autorizadas, dilo con claridad para esa parte (no omitas ninguna).',
    );
  } else if (asksPrice) {
    parts.push(
      '- El cliente pregunta por precio/costo: si no hay tarifa en las fuentes autorizadas, dilo con honestidad y ofrece que un asesor humano continúe. No inventes cifras.',
    );
  } else if (asksLocation) {
    parts.push(
      '- El cliente pregunta por ubicación/dirección: si no hay dirección en la información de referencia, dilo con honestidad (no inventes una dirección) y ofrece handoff a un asesor humano cuando corresponda.',
    );
  }

  return parts.join('\n');
}
