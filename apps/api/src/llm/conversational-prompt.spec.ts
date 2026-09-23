import { LlmService } from './llm.service';
import { DEMO_KB_CONTENT } from './demo-nova-servicios';
import { businessProfileFromSettings } from './business-hours';
import {
  buildGroundingInstructions,
  extractAlreadyProvidedFacts,
  sanitizeConversationalInternalTokens,
} from './conversational-grounding';

describe('conversational system prompt (Nova Servicios demo) — 13.D.2', () => {
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

  it('A: already-stated service/equipo → prompt must not instruct re-asking service', () => {
    const msg = 'Necesito mantenimiento para mi computadora';
    const facts = extractAlreadyProvidedFacts(msg);
    expect(facts).toEqual(
      expect.arrayContaining(['servicio=mantenimiento', 'equipo=computadora']),
    );
    const grounding = buildGroundingInstructions(msg);
    expect(grounding).toMatch(/NO los vuelvas a pedir/i);
    expect(grounding).toMatch(/servicio=mantenimiento/);
    expect(grounding).toMatch(/equipo=computadora/);
    expect(grounding).toMatch(/No preguntes de nuevo qué servicio/i);

    const prompt = llm.buildSystemPrompt(DEMO_KB_CONTENT, profile, {
      userMessage: msg,
    });
    expect(prompt).toMatch(/No re-preguntes información/i);
    expect(prompt).toMatch(/NO los vuelvas a pedir/i);
    expect(prompt).toMatch(/servicio=mantenimiento/);
    // Must instruct NOT to re-ask service when already known
    expect(prompt).toMatch(/No preguntes de nuevo qué servicio/i);
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

  it('B: price absent → recognizes no fixed price / honest handoff contract', () => {
    const msg = '¿Cuánto cuesta el mantenimiento?';
    const prompt = llm.buildSystemPrompt(DEMO_KB_CONTENT, profile, {
      userMessage: msg,
    });
    expect(DEMO_KB_CONTENT).toMatch(/No publicamos precios fijos|No publicamos tarifas/i);
    expect(prompt).toMatch(/NUNCA inventes precios/i);
    expect(prompt).toMatch(/no hay tarifa|no tienes ese dato fijo|no inventes cifras/i);
    expect(prompt).toMatch(/asesor humano|handoff|cotización/i);
    expect(prompt).toMatch(/El cliente pregunta por precio/i);
  });

  it('C: location without address in KB → explicitly no address available', () => {
    const msg = '¿Dónde están ubicados?';
    const prompt = llm.buildSystemPrompt(DEMO_KB_CONTENT, profile, {
      userMessage: msg,
    });
    expect(DEMO_KB_CONTENT).not.toMatch(/dirección|Av\.|Calle |Jr\./i);
    expect(prompt).toMatch(/dirección o ubicación|ubicación\/dirección/i);
    expect(prompt).toMatch(/no inventes una dirección|no tienes la dirección/i);
    expect(prompt).toMatch(/handoff/i);
    expect(prompt).toMatch(/El cliente pregunta por ubicación/i);
  });

  it('D: compound price+location both absent → covers BOTH parts', () => {
    const msg =
      '¿Cuánto cuesta el mantenimiento y dónde están ubicados?';
    const prompt = llm.buildSystemPrompt(DEMO_KB_CONTENT, profile, {
      userMessage: msg,
    });
    expect(prompt).toMatch(/Pregunta COMPUESTA/i);
    expect(prompt).toMatch(/precio Y a ubicación/i);
    expect(prompt).toMatch(/responde CADA parte/i);
    expect(prompt).toMatch(/NUNCA inventes precios/i);
    expect(prompt).toMatch(/no inventes una dirección|no tienes la dirección/i);
  });

  it('E: prompt forbids leaking OTHER / PRICE_INQUIRY / PRICING / INTERESTED', () => {
    const prompt = llm.buildSystemPrompt(DEMO_KB_CONTENT, profile);
    expect(prompt).toMatch(/NUNCA escribas ni menciones tokens internos/i);
    expect(prompt).toContain('OTHER');
    expect(prompt).toContain('PRICE_INQUIRY');
    expect(prompt).toContain('PRICING');
    expect(prompt).toContain('INTERESTED');
  });

  it('E: sanitizer strips exact internal tokens from outbound', () => {
    const dirty =
      'Tu caso es OTHER con intent PRICE_INQUIRY; pipeline PRICING; estado INTERESTED.';
    const clean = sanitizeConversationalInternalTokens(dirty);
    expect(clean).not.toMatch(/\bOTHER\b/);
    expect(clean).not.toMatch(/\bPRICE_INQUIRY\b/);
    expect(clean).not.toMatch(/\bPRICING\b/);
    expect(clean).not.toMatch(/\bINTERESTED\b/);
    expect(clean).toMatch(/Tu caso es/i);
  });

  it('quote guidance stays honest (no fabricated issued quote)', () => {
    const prompt = llm.buildSystemPrompt(DEMO_KB_CONTENT, profile);
    expect(prompt).toMatch(/no inventes cifras|tarifa autorizada/i);
  });

  it('natural brief Spanish; do not volunteer hours unasked', () => {
    const prompt = llm.buildSystemPrompt(DEMO_KB_CONTENT, profile);
    expect(prompt).toMatch(/breve, natural/i);
    expect(prompt).toMatch(/NO menciones el horario/i);
    expect(prompt).toMatch(/solo a lo preguntado/i);
    expect(prompt).toMatch(/Sin relleno especulativo/i);
    expect(prompt).toMatch(/Oraciones completas/i);
    expect(prompt).toMatch(/Sin Spanglish/i);
  });

  it('includes recent history when provided (no CommercialDecision)', () => {
    const prompt = llm.buildSystemPrompt(DEMO_KB_CONTENT, profile, {
      userMessage: '¿tienen soporte?',
      recentHistory: [
        { role: 'customer', text: 'hola' },
        { role: 'business', text: 'Bienvenido a Nova Servicios' },
      ],
    });
    expect(prompt).toMatch(/Historial reciente/i);
    expect(prompt).toContain('Cliente: hola');
    expect(prompt).toContain('Asistente: Bienvenido a Nova Servicios');
    expect(prompt).not.toMatch(/CommercialDecision/);
    expect(prompt).not.toMatch(/"intent"/);
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
