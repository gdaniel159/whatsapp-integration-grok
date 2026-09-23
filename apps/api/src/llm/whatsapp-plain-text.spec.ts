import { sanitizeWhatsAppPlainText } from './llm.service';
import { sanitizeConversationalInternalTokens } from './conversational-grounding';

describe('sanitizeWhatsAppPlainText (13.D.1 F / 13.D.2)', () => {
  it('F: strips simple Markdown without semantic rewrite', () => {
    const input =
      '## Servicios\n\nOfrecemos **instalación** y *mantenimiento*.\n\n- Soporte técnico\n- Capacitación\n\nMás en [web](https://example.com).\n\n```\ncódigo\n```';
    const out = sanitizeWhatsAppPlainText(input);
    expect(out).not.toMatch(/\*\*/);
    expect(out).not.toMatch(/^#/m);
    expect(out).not.toContain('```');
    expect(out).toContain('instalación');
    expect(out).toContain('mantenimiento');
    expect(out).toContain('Soporte técnico');
    expect(out).toContain('web');
    expect(out).not.toContain('https://example.com');
    // no paraphrasing — core words preserved
    expect(out).toMatch(/Ofrecemos instalación y mantenimiento/i);
  });

  it('leaves plain Spanish unchanged', () => {
    const plain =
      'Ofrecemos instalación, mantenimiento y soporte técnico. ¿En qué te ayudo?';
    expect(sanitizeWhatsAppPlainText(plain)).toBe(plain);
  });

  it('strips ordered list markers', () => {
    const out = sanitizeWhatsAppPlainText('1. Uno\n2. Dos');
    expect(out).toBe('Uno\nDos');
  });

  it('E: composed outbound pipeline strips Markdown then internal tokens', () => {
    const raw =
      'Clasificado **OTHER** / PRICE_INQUIRY. Te paso a PRICING (INTERESTED).';
    const out = sanitizeConversationalInternalTokens(
      sanitizeWhatsAppPlainText(raw),
    );
    expect(out).not.toMatch(/\*\*/);
    expect(out).not.toMatch(/\bOTHER\b/);
    expect(out).not.toMatch(/\bPRICE_INQUIRY\b/);
    expect(out).not.toMatch(/\bPRICING\b/);
    expect(out).not.toMatch(/\bINTERESTED\b/);
  });

  it('E: strips Title-Case Other leak without aggressive rewrite', () => {
    const out = sanitizeConversationalInternalTokens(
      'Lo dejé en Other por ahora.',
    );
    expect(out).not.toMatch(/\bOther\b/);
    expect(out).toContain('Lo dejé en');
    expect(out).toContain('por ahora');
  });
});
