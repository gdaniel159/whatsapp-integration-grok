import { LlmService } from './llm.service';
import { DEMO_KB_CONTENT } from './demo-nova-servicios';
import { businessProfileFromSettings } from './business-hours';

describe('conversational system prompt (Nova Servicios demo)', () => {
  const llm = new LlmService({ get: () => undefined } as never, {} as never);

  const profile = businessProfileFromSettings({
    businessName: 'Nova Servicios',
    timezone: 'America/Lima',
    businessHoursStart: '09:00',
    businessHoursEnd: '18:00',
  });

  it('includes services from KB', () => {
    const prompt = llm.buildSystemPrompt(DEMO_KB_CONTENT, profile);
    expect(prompt).toMatch(/Instalación/i);
    expect(prompt).toMatch(/Mantenimiento/i);
    expect(prompt).toMatch(/Soporte/i);
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
});
