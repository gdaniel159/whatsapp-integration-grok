import { LeadStatus } from '@prisma/client';
import {
  parseCommercialDecision,
  extractCommercialDecisionJson,
  safeParseCommercialDecision,
} from './commercial-decision.schema';

describe('commercial-decision.schema fixtures A–G', () => {
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

  it('D: missing required field → reject', () => {
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

  it('E: unknown enum → reject', () => {
    const r = safeParseCommercialDecision(
      JSON.stringify({ ...valid, intent: 'HACK_INTENT' }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.diagnostics.code).toBe('INVALID_ENUM_VALUE');
  });

  it('F: requiresHumanAttention true without handoffReason → reject', () => {
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

  it('G: GENERAL_INQUIRY without applicable status → valid', () => {
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
});
