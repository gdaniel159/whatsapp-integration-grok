import { LeadStatus } from '@prisma/client';
import {
  parseCommercialDecision,
  extractCommercialDecisionJson,
  safeParseCommercialDecision,
  buildCommercialAnalysisPrompt,
} from './commercial-decision.schema';

describe('commercial-decision.schema fixtures A–G + 13.D', () => {
  const valid = {
    intent: 'PRODUCT_INQUIRY',
    suggestedStatus: 'INTERESTED',
    suggestedTags: ['Toyota', 'Hilux'],
    confidence: 0.91,
    reason: 'Cliente pregunta por parachoque Hilux',
    requiresHumanAttention: false,
    handoffReason: null,
  };

  it('A: pure JSON object → valid', () => {
    const d = parseCommercialDecision(JSON.stringify(valid));
    expect(d.intent).toBe('PRODUCT_INQUIRY');
    expect(d.suggestedStatus).toBe(LeadStatus.INTERESTED);
    expect(d.confidence).toBe(0.91);
    expect(d.requiresHumanAttention).toBe(false);
    expect(d.handoffReason).toBeNull();
  });

  it('B: markdown json fence → valid', () => {
    const raw = '```json\n' + JSON.stringify(valid) + '\n```';
    expect(extractCommercialDecisionJson(raw)).toEqual(valid);
    const d = parseCommercialDecision(raw);
    expect(d.intent).toBe('PRODUCT_INQUIRY');
  });

  it('C: invalid JSON → reject', () => {
    const r = safeParseCommercialDecision('{intent: broken');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.diagnostics.code).toBe('INVALID_JSON');
  });

  it('D: unknown key text → invalid (strict, no strip)', () => {
    const r = safeParseCommercialDecision(
      JSON.stringify({ ...valid, text: 'Hola, ¿en qué puedo ayudarte?' }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.diagnostics.code).toBe('VALIDATION_ERROR');
      expect(r.diagnostics.unknownKeys).toContain('text');
      expect(
        r.diagnostics.fieldErrors.some(
          (f) =>
            f.code === 'unrecognized_keys' ||
            /Unrecognized key/i.test(f.message),
        ),
      ).toBe(true);
    }
  });

  it('E: bad suggestedStatus → INVALID_ENUM with Field/Received/Expected', () => {
    const r = safeParseCommercialDecision(
      JSON.stringify({ ...valid, suggestedStatus: 'Interesado' }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.diagnostics.code).toBe('INVALID_ENUM_VALUE');
      const err = r.diagnostics.fieldErrors.find((f) =>
        f.path.includes('suggestedStatus'),
      );
      expect(err).toBeTruthy();
      expect(err!.received).toMatch(/Interesado/);
      expect(err!.expected).toEqual(
        expect.arrayContaining([
          'NEW',
          'IN_PROGRESS',
          'INTERESTED',
          'QUOTED',
          'WON',
          'LOST',
        ]),
      );
      expect(err!.message).toMatch(/Field suggestedStatus/i);
      expect(err!.message).toMatch(/received/i);
      expect(err!.message).toMatch(/expected/i);
    }
  });

  it('F: suggestedStatus null → valid', () => {
    const d = parseCommercialDecision(
      JSON.stringify({ ...valid, suggestedStatus: null }),
    );
    expect(d.suggestedStatus).toBeNull();
  });

  it('G: GENERAL_INQUIRY no transition → suggestedStatus null valid', () => {
    const d = parseCommercialDecision(
      JSON.stringify({
        intent: 'GENERAL_INQUIRY',
        suggestedStatus: null,
        suggestedTags: [],
        confidence: 0.88,
        reason: 'Cliente pide detalles generales del negocio',
        requiresHumanAttention: false,
        handoffReason: null,
      }),
    );
    expect(d.intent).toBe('GENERAL_INQUIRY');
    expect(d.suggestedStatus).toBeNull();
    expect(d.suggestedTags).toEqual([]);
    expect(d.requiresHumanAttention).toBe(false);
  });

  it('H: PRICE_INQUIRY → structured + handoff suggestion', () => {
    const d = parseCommercialDecision(
      JSON.stringify({
        intent: 'PRICE_INQUIRY',
        suggestedStatus: 'INTERESTED',
        suggestedTags: ['Hilux'],
        confidence: 0.92,
        reason: 'Cliente pregunta precio',
        requiresHumanAttention: true,
        handoffReason: 'PRICING',
      }),
    );
    expect(d.intent).toBe('PRICE_INQUIRY');
    expect(d.requiresHumanAttention).toBe(true);
    expect(d.handoffReason).toBe('PRICING');
    expect(d.suggestedStatus).toBe(LeadStatus.INTERESTED);
  });

  it('missing required field → reject', () => {
    const { reason: _omit, ...rest } = valid;
    void _omit;
    const r = safeParseCommercialDecision(JSON.stringify(rest));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(['VALIDATION_ERROR', 'INVALID_ENUM_VALUE']).toContain(
        r.diagnostics.code,
      );
      expect(
        r.diagnostics.fieldErrors.some((f) => f.path.includes('reason')),
      ).toBe(true);
    }
  });

  it('unknown enum intent → reject', () => {
    const r = safeParseCommercialDecision(
      JSON.stringify({ ...valid, intent: 'HACK_INTENT' }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.diagnostics.code).toBe('INVALID_ENUM_VALUE');
  });

  it('requiresHumanAttention true without handoffReason → reject', () => {
    const r = safeParseCommercialDecision(
      JSON.stringify({
        ...valid,
        requiresHumanAttention: true,
        handoffReason: null,
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.diagnostics.fieldErrors.some((f) => f.path.includes('handoffReason')),
      ).toBe(true);
    }
  });

  it('rejects unknown keys (strict)', () => {
    expect(() =>
      parseCommercialDecision(JSON.stringify({ ...valid, hack: true })),
    ).toThrow();
  });

  it('rejects handoffReason when requiresHumanAttention is false', () => {
    expect(() =>
      parseCommercialDecision(
        JSON.stringify({
          ...valid,
          requiresHumanAttention: false,
          handoffReason: 'PRICING',
        }),
      ),
    ).toThrow();
  });

  it('accepts PRICE_INQUIRY handoff payload', () => {
    const d = parseCommercialDecision(
      JSON.stringify({
        ...valid,
        intent: 'PRICE_INQUIRY',
        requiresHumanAttention: true,
        handoffReason: 'PRICING',
      }),
    );
    expect(d.requiresHumanAttention).toBe(true);
    expect(d.handoffReason).toBe('PRICING');
  });

  it('omitted nullable fields coerce to null/[]', () => {
    const d = parseCommercialDecision(
      JSON.stringify({
        intent: 'GENERAL_INQUIRY',
        confidence: 0.7,
        reason: 'consulta general',
        requiresHumanAttention: false,
      }),
    );
    expect(d.suggestedStatus).toBeNull();
    expect(d.suggestedTags).toEqual([]);
    expect(d.handoffReason).toBeNull();
  });

  it('prompt contract: classification only + enum literals + examples', () => {
    const prompt = buildCommercialAnalysisPrompt();
    expect(prompt).toMatch(/clasificador comercial INTERNO/i);
    expect(prompt).toMatch(/NUNCA incluyas texto para el cliente/i);
    expect(prompt).toMatch(/prohibido: text/i);
    expect(prompt).toContain('GENERAL_INQUIRY');
    expect(prompt).toContain('PRICE_INQUIRY');
    expect(prompt).toContain('INTERESTED');
    expect(prompt).toMatch(/suggestedStatus = null/i);
    expect(prompt).toMatch(/Ejemplo GENERAL_INQUIRY/i);
    expect(prompt).toMatch(/Ejemplo PRICE_INQUIRY/i);
    expect(prompt).not.toMatch(/"suggestedStatus":"NEW\|IN_PROGRESS.*"\|null/);
  });
});
