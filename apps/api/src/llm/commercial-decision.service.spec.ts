import { CommercialAutomationMode, LeadStatus } from '@prisma/client';
import { CommercialDecisionService } from './commercial-decision.service';

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
});
