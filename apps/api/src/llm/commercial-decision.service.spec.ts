import { CommercialAutomationMode, LeadStatus } from '@prisma/client';
import {
  buildCommercialAnalysisContext,
  CommercialDecisionService,
} from './commercial-decision.service';

function makeService(opts: {
  mode: CommercialAutomationMode;
  llmRaw?: string | null;
  contact?: { id: string; leadStatus: LeadStatus; tags: string[] };
  applyResult?: {
    appliedStatus: LeadStatus | null;
    appliedTags: string[];
    appliedHumanHandoff?: boolean;
  };
}) {
  const contact = opts.contact ?? {
    id: 'c1',
    leadStatus: LeadStatus.NEW,
    tags: [] as string[],
  };
  const chatCompletion = jest.fn(async () => opts.llmRaw ?? null);
  const applyCommercialAutomation = jest.fn(
    async () =>
      opts.applyResult ?? {
        appliedStatus: null,
        appliedTags: [] as string[],
        appliedHumanHandoff: false,
      },
  );
  const prisma = {
    botSettings: {
      upsert: jest.fn(async () => ({
        id: 'default',
        commercialAutomationMode: opts.mode,
        globalAutoReplyEnabled: false,
        businessName: 'DMX 4x4',
        timezone: 'America/Lima',
        businessHoursStart: '08:00',
        businessHoursEnd: '18:00',
      })),
    },
    conversation: {
      findUnique: jest.fn(async () => ({
        id: 'conv1',
        contact,
      })),
    },
    message: {
      findMany: jest.fn(async () => [
        { direction: 'IN', body: 'hola busco parachoque Toyota Hilux' },
      ]),
    },
  };
  const svc = new CommercialDecisionService(
    prisma as never,
    { chatCompletion, getToken: () => 'hf_test' } as never,
    { applyCommercialAutomation } as never,
  );
  return { svc, chatCompletion, applyCommercialAutomation, prisma };
}

const productJson = JSON.stringify({
  intent: 'PRODUCT_INQUIRY',
  suggestedStatus: 'INTERESTED',
  suggestedTags: ['Toyota', 'Hilux'],
  confidence: 0.93,
  reason: 'Consulta de producto Hilux',
  requiresHumanAttention: false,
  handoffReason: null,
});

const priceJson = JSON.stringify({
  intent: 'PRICE_INQUIRY',
  suggestedStatus: 'INTERESTED',
  suggestedTags: ['Hilux'],
  confidence: 0.94,
  reason: 'Pregunta de precio',
  requiresHumanAttention: true,
  handoffReason: 'PRICING',
});

describe('CommercialDecisionService modes + resilience', () => {
  it('OFF → no LLM call', async () => {
    const { svc, chatCompletion, applyCommercialAutomation } = makeService({
      mode: CommercialAutomationMode.OFF,
      llmRaw: productJson,
    });
    const result = await svc.handleInbound('conv1');
    expect(result.outcome).toBe('DISABLED');
    expect(chatCompletion).not.toHaveBeenCalled();
    expect(applyCommercialAutomation).not.toHaveBeenCalled();
  });

  it('OBSERVE → analyzes but no writes', async () => {
    const { svc, chatCompletion, applyCommercialAutomation } = makeService({
      mode: CommercialAutomationMode.OBSERVE,
      llmRaw: productJson,
    });
    const result = await svc.handleInbound('conv1');
    expect(chatCompletion).toHaveBeenCalled();
    expect(applyCommercialAutomation).not.toHaveBeenCalled();
    expect(result.outcome).toBe('OBSERVED');
    expect(result.decision?.intent).toBe('PRODUCT_INQUIRY');
    expect(result.appliedStatus).toBeNull();
  });

  it('APPLY → writes via contacts.applyCommercialAutomation', async () => {
    const { svc, applyCommercialAutomation } = makeService({
      mode: CommercialAutomationMode.APPLY,
      llmRaw: productJson,
      applyResult: {
        appliedStatus: LeadStatus.INTERESTED,
        appliedTags: ['Toyota', 'Hilux'],
      },
    });
    const result = await svc.handleInbound('conv1');
    expect(applyCommercialAutomation).toHaveBeenCalled();
    expect(result.outcome).toBe('APPLIED');
    expect(result.appliedStatus).toBe(LeadStatus.INTERESTED);
  });

  it('invalid JSON / timeout-like null does not throw', async () => {
    const { svc, applyCommercialAutomation } = makeService({
      mode: CommercialAutomationMode.APPLY,
      llmRaw: null,
    });
    const result = await svc.handleInbound('conv1');
    expect(result.outcome).toBe('REJECTED');
    expect(applyCommercialAutomation).not.toHaveBeenCalled();
  });

  it('works even conceptually with globalAutoReplyEnabled=false (mode only)', async () => {
    const { svc, chatCompletion } = makeService({
      mode: CommercialAutomationMode.OBSERVE,
      llmRaw: productJson,
    });
    await svc.handleInbound('conv1');
    expect(chatCompletion).toHaveBeenCalled();
  });
  it('OBSERVE price inquiry → preview handoff, no writes', async () => {
    const { svc, applyCommercialAutomation } = makeService({
      mode: CommercialAutomationMode.OBSERVE,
      llmRaw: priceJson,
    });
    const result = await svc.handleInbound('conv1');
    expect(applyCommercialAutomation).not.toHaveBeenCalled();
    expect(result.outcome).toBe('OBSERVED');
    expect(result.preview?.applyHumanHandoff?.reason).toBe('PRICING');
    expect(result.appliedHumanHandoff).toBe(false);
    expect(result.businessHours.timezone).toBe('America/Lima');
  });

  it('APPLY price inquiry → persists handoff via contacts', async () => {
    const { svc, applyCommercialAutomation } = makeService({
      mode: CommercialAutomationMode.APPLY,
      llmRaw: priceJson,
      applyResult: {
        appliedStatus: LeadStatus.INTERESTED,
        appliedTags: ['Hilux'],
        appliedHumanHandoff: true,
      },
    });
    const result = await svc.handleInbound('conv1');
    expect(applyCommercialAutomation).toHaveBeenCalled();
    const call = applyCommercialAutomation.mock.calls[0] as unknown as [
      string,
      { applyHumanHandoff?: { reason?: string } },
    ];
    expect(call[1].applyHumanHandoff?.reason).toBe('PRICING');
    expect(result.appliedHumanHandoff).toBe(true);
    expect(result.outcome).toBe('APPLIED');
  });

  it('invalid JSON → REJECTED with INVALID diagnostics (no CRM writes)', async () => {
    const { svc, applyCommercialAutomation } = makeService({
      mode: CommercialAutomationMode.APPLY,
      llmRaw: 'not-json-at-all',
    });
    const result = await svc.handleInbound('conv1');
    expect(result.outcome).toBe('REJECTED');
    expect(result.validationStatus).toBe('INVALID');
    expect(result.diagnostics?.code).toBeTruthy();
    expect(applyCommercialAutomation).not.toHaveBeenCalled();
  });

  it('B/D: unknown text + bad enum → REJECTED, no CRM writes (OBSERVE/APPLY still invoke LLM)', async () => {
    const bad = JSON.stringify({
      intent: 'GENERAL_INQUIRY',
      suggestedStatus: 'Interesado',
      suggestedTags: [],
      confidence: 0.9,
      reason: 'consulta',
      requiresHumanAttention: false,
      handoffReason: null,
      text: 'Hola',
    });
    for (const mode of [
      CommercialAutomationMode.OBSERVE,
      CommercialAutomationMode.APPLY,
    ]) {
      const { svc, chatCompletion, applyCommercialAutomation } = makeService({
        mode,
        llmRaw: bad,
      });
      const result = await svc.handleInbound('conv1');
      expect(chatCompletion).toHaveBeenCalled();
      expect(applyCommercialAutomation).not.toHaveBeenCalled();
      expect(result.outcome).toBe('REJECTED');
      expect(result.validationStatus).toBe('INVALID');
      expect(result.diagnostics?.code).toBe('INVALID_ENUM_VALUE');
      expect(result.decision).toBeNull();
    }
  });
});

describe('13.D.3 commercial context tag isolation wiring', () => {
  it('A: customerEvidence excludes BUSINESS assistant service lists', () => {
    const payload = buildCommercialAnalysisContext({
      leadStatus: LeadStatus.NEW,
      tags: [],
      recent: [
        {
          direction: 'OUT',
          body: 'Ofrecemos instalación, mantenimiento y soporte técnico.',
        },
        {
          direction: 'IN',
          body: 'Necesito mantenimiento para mi computadora.',
        },
      ],
    });
    expect(payload.customerEvidence).toEqual([
      { text: 'Necesito mantenimiento para mi computadora.' },
    ]);
    expect(payload.recentConversation).toEqual([
      {
        role: 'BUSINESS',
        text: 'Ofrecemos instalación, mantenimiento y soporte técnico.',
      },
      {
        role: 'CUSTOMER',
        text: 'Necesito mantenimiento para mi computadora.',
      },
    ]);
    expect(payload.tagEvidenceRule).toMatch(/customerEvidence/i);
    expect(payload.tagEvidenceRule).toMatch(/Never tag from BUSINESS/i);
    // Assistant list must not appear inside customerEvidence
    const joined = payload.customerEvidence.map((c) => c.text).join(' ');
    expect(joined).not.toMatch(/instalaci[oó]n/i);
    expect(joined).not.toMatch(/soporte/i);
    expect(joined).toMatch(/mantenimiento/i);
  });

  it('passes isolated context JSON to LLM user payload', async () => {
    const { svc, chatCompletion, prisma } = makeService({
      mode: CommercialAutomationMode.OBSERVE,
      llmRaw: productJson,
    });
    prisma.message.findMany = jest.fn(async () => [
      {
        direction: 'OUT',
        body: 'Tenemos instalación, mantenimiento y soporte.',
      },
      { direction: 'IN', body: 'Necesito mantenimiento para mi computadora.' },
    ]);
    await svc.handleInbound('conv1');
    expect(chatCompletion).toHaveBeenCalled();
    const callArgs = chatCompletion.mock.calls[0] as unknown as [
      string,
      string,
      ...unknown[],
    ];
    const userPayload = callArgs[1];
    const parsed = JSON.parse(userPayload);
    expect(parsed.customerEvidence).toEqual([
      { text: 'Necesito mantenimiento para mi computadora.' },
    ]);
    expect(parsed.tagEvidenceRule).toMatch(/CUSTOMER/i);
    expect(
      parsed.customerEvidence.some((c: { text: string }) =>
        /instalaci/i.test(c.text),
      ),
    ).toBe(false);
  });
});
