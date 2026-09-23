import { LlmService } from './llm.service';
import { DEMO_KB_CONTENT } from './demo-nova-servicios';
import { businessProfileFromSettings } from './business-hours';

describe('conversational system prompt (Nova Servicios demo) — 13.D.1', () => {
  const llm = new LlmService({ get: () => undefined } as never, {} as never);

  const profile = businessProfileFromSettings({
    businessName: 'Nova Servicios',
    timezone: 'America/Lima',
    businessHoursStart: '09:00',
    businessHoursEnd: '18:00',
  });

  it('A: Services → grounded from KB + no Markdown in style rules', () => {
    const prompt = llm.buildSystemPrompt(DEMO_KB_CONTENT, profile);
    expect(prompt).toMatch(/Instalación/i);
    expect(prompt).toMatch(/Mantenimiento/i);
    expect(prompt).toMatch(/Soporte/i);
    expect(prompt).toMatch(/PROHIBIDO Markdown/i);
    expect(prompt).toMatch(/texto plano/i);
    expect(prompt).toMatch(/Fuentes autorizadas ÚNICAS/i);
  });

  it('includes business details from KB', () => {
    const prompt = llm.buildSystemPrompt(DEMO_KB_CONTENT, profile);
    expect(prompt).toMatch(/Nova Servicios/);
  });

  it('includes hours from BusinessProfile (SoT)', () => {
    const prompt = llm.buildSystemPrompt(DEMO_KB_CONTENT, profile);
    expect(prompt).toContain('09:00');
    expect(prompt).toContain('18:00');
    expect(prompt).toContain('America/Lima');
    expect(prompt).toMatch(/BusinessProfile/i);
  });

  it('instructs not to invent prices and to hand off when needed', () => {
    const prompt = llm.buildSystemPrompt(DEMO_KB_CONTENT, profile);
    expect(prompt).toMatch(/NUNCA inventes precios/i);
    expect(prompt).toMatch(/asesor humano|handoff|cotización/i);
  });

  it('quote guidance stays honest (no fabricated issued quote)', () => {
    const prompt = llm.buildSystemPrompt(DEMO_KB_CONTENT, profile);
    expect(prompt).toMatch(/no inventes cifras|tarifa autorizada/i);
  });

  it('E: location without address in KB → acknowledge missing + handoff', () => {
    const prompt = llm.buildSystemPrompt(DEMO_KB_CONTENT, profile);
    expect(DEMO_KB_CONTENT).not.toMatch(/dirección|Av\.|Calle |Jr\./i);
    expect(prompt).toMatch(/dirección o ubicación/i);
    expect(prompt).toMatch(/no inventes una dirección/i);
    expect(prompt).toMatch(/handoff/i);
  });

  it('natural brief Spanish; do not volunteer hours unasked', () => {
    const prompt = llm.buildSystemPrompt(DEMO_KB_CONTENT, profile);
    expect(prompt).toMatch(/breve, natural/i);
    expect(prompt).toMatch(/NO menciones el horario/i);
    expect(prompt).toMatch(/solo a lo preguntado/i);
    expect(prompt).toMatch(/Sin relleno especulativo/i);
  });

  it('I: conversational prompt discourages Markdown **bold**/fences', () => {
    const prompt = llm.buildSystemPrompt(DEMO_KB_CONTENT, profile);
    expect(prompt).toMatch(/PROHIBIDO Markdown/i);
    expect(prompt).toContain('**negrita**');
    expect(prompt).toMatch(/texto plano/i);
    expect(prompt).toMatch(/fences/i);
    expect(prompt).toMatch(/No menciones .*KB|base de conocimiento/i);
  });
});
