import { AutoReplyService } from './auto-reply.service';
import { renderWelcomeMessage } from './llm.service';

const DEFAULT_SETTINGS = {
  id: 'default',
  welcomeMessage: 'Hola welcome',
  firstAction: 'CTA',
  hfModel: null,
  globalAutoReplyEnabled: false,
  businessName: 'Nova Servicios',
  timezone: 'America/Lima',
  businessHoursStart: '09:00',
  businessHoursEnd: '18:00',
  updatedAt: new Date(),
};

function makeService(opts: {
  globalAutoReplyEnabled: boolean;
  aiMode: 'AI' | 'MANUAL';
  inboundCount?: number;
  welcomeMessage?: string;
  businessName?: string;
}) {
  const sendMessage = jest.fn(async () => ({ id: 'out1' }));
  const chatCompletion = jest.fn(async () => 'AI reply text');
  const fallbackReply = jest.fn(() => 'fallback');
  const buildSystemPrompt = jest.fn((kb: string, _profile?: unknown) => `sys:${kb}`);

  const settings = {
    ...DEFAULT_SETTINGS,
    globalAutoReplyEnabled: opts.globalAutoReplyEnabled,
    welcomeMessage: opts.welcomeMessage ?? DEFAULT_SETTINGS.welcomeMessage,
    businessName: opts.businessName ?? DEFAULT_SETTINGS.businessName,
  };

  const prisma = {
    botSettings: {
      upsert: jest.fn(async ({ create }: { create: Record<string, unknown> }) => {
        return {
          ...DEFAULT_SETTINGS,
          ...create,
          globalAutoReplyEnabled:
            (create.globalAutoReplyEnabled as boolean | undefined) ??
            settings.globalAutoReplyEnabled,
        };
      }),
    },
    conversation: {
      findUnique: jest.fn(async () => ({
        id: 'conv1',
        aiMode: opts.aiMode,
        remoteJid: '51991112233@s.whatsapp.net',
      })),
    },
    message: {
      count: jest.fn(async () => opts.inboundCount ?? 2),
    },
    knowledgeBase: {
      findUnique: jest.fn(async () => ({ id: 'default', content: 'KB' })),
    },
  };

  const llm = {
    buildSystemPrompt,
    chatCompletion,
    fallbackReply,
  };

  const chat = { sendMessage };

  const svc = new AutoReplyService(
    prisma as never,
    llm as never,
    chat as never,
  );

  return { svc, prisma, llm, chat, sendMessage, settings };
}

describe('AutoReplyService.handleInbound — global kill switch', () => {
  it('Global OFF → does not send welcome or AI', async () => {
    const { svc, sendMessage, llm, prisma } = makeService({
      globalAutoReplyEnabled: false,
      aiMode: 'AI',
      inboundCount: 1,
    });
    prisma.botSettings.upsert.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      globalAutoReplyEnabled: false,
    });

    await svc.handleInbound('conv1', 'hola');

    expect(sendMessage).not.toHaveBeenCalled();
    expect(llm.chatCompletion).not.toHaveBeenCalled();
    expect(prisma.conversation.findUnique).not.toHaveBeenCalled();
  });

  it('A: First inbound + welcome configured → exactly one outbound (welcome only)', async () => {
    const { svc, sendMessage, llm, prisma } = makeService({
      globalAutoReplyEnabled: true,
      aiMode: 'AI',
      inboundCount: 1,
    });
    prisma.botSettings.upsert.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      globalAutoReplyEnabled: true,
      welcomeMessage: 'Bienvenido a {businessName}',
      firstAction: 'Elige 1',
      businessName: 'Nova Servicios',
    });

    const result = await svc.handleInbound('conv1', 'hola');

    expect(llm.chatCompletion).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const bodies = sendMessage.mock.calls.map(
      (c: unknown[]) => c[1] as string,
    );
    expect(bodies[0]).toBe('Bienvenido a Nova Servicios');
    expect(bodies[0]).not.toContain('Elige 1');
    expect(bodies[0]).not.toContain('{businessName}');
    expect(result.welcomeSent).toBe(true);
    expect(result.aiReplySent).toBe(false);
    expect(result.detail).toBe('welcome_only_first_inbound');
  });

  it('C: Second inbound → conversational LLM runs (no welcome)', async () => {
    const { svc, sendMessage, llm, prisma } = makeService({
      globalAutoReplyEnabled: true,
      aiMode: 'AI',
      inboundCount: 2,
    });
    prisma.botSettings.upsert.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      globalAutoReplyEnabled: true,
      welcomeMessage: 'Bienvenido a {businessName}',
      businessName: 'Nova Servicios',
    });

    const result = await svc.handleInbound('conv1', '¿qué servicios ofrecen?');

    expect(llm.chatCompletion).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const bodies = sendMessage.mock.calls.map(
      (c: unknown[]) => c[1] as string,
    );
    expect(bodies[0]).toBe('AI reply text');
    expect(result.welcomeSent).toBe(false);
    expect(result.aiReplySent).toBe(true);
  });

  it('J: welcome resolves {businessName} from BusinessProfile', async () => {
    const { svc, sendMessage, prisma } = makeService({
      globalAutoReplyEnabled: true,
      aiMode: 'AI',
      inboundCount: 1,
    });
    prisma.botSettings.upsert.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      globalAutoReplyEnabled: true,
      welcomeMessage: 'Hola, soy el asistente de {businessName}.',
      businessName: 'Nova Servicios',
    });

    await svc.handleInbound('conv1', 'hola');

    const bodies = sendMessage.mock.calls.map(
      (c: unknown[]) => c[1] as string,
    );
    expect(bodies[0]).toBe(
      'Hola, soy el asistente de Nova Servicios.',
    );
    expect(bodies[0]).not.toContain('{businessName}');
  });

  it('renderWelcomeMessage falls back when businessName empty', () => {
    expect(renderWelcomeMessage('Hola de {businessName}', '')).toBe(
      'Hola de nuestro negocio',
    );
    expect(
      renderWelcomeMessage('Hola de {businessName}', 'Acme Consulting'),
    ).toBe('Hola de Acme Consulting');
  });

  it('Global ON + aiMode MANUAL → no auto send', async () => {
    const { svc, sendMessage, llm, prisma } = makeService({
      globalAutoReplyEnabled: true,
      aiMode: 'MANUAL',
    });
    prisma.botSettings.upsert.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      globalAutoReplyEnabled: true,
    });

    await svc.handleInbound('conv1', 'hola');

    expect(sendMessage).not.toHaveBeenCalled();
    expect(llm.chatCompletion).not.toHaveBeenCalled();
  });

  it('ensureBotSettings create defaults globalAutoReplyEnabled to false', async () => {
    const upsert = jest.fn(async ({ create }: { create: Record<string, unknown> }) => ({
      id: 'default',
      ...create,
      updatedAt: new Date(),
    }));
    const prisma = {
      botSettings: { upsert },
      conversation: { findUnique: jest.fn() },
      message: { count: jest.fn() },
      knowledgeBase: { findUnique: jest.fn() },
    };
    const svc = new AutoReplyService(
      prisma as never,
      { buildSystemPrompt: jest.fn(), chatCompletion: jest.fn(), fallbackReply: jest.fn() } as never,
      { sendMessage: jest.fn() } as never,
    );

    const row = await svc.ensureBotSettings();

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          globalAutoReplyEnabled: false,
        }),
      }),
    );
    expect(row.globalAutoReplyEnabled).toBe(false);
  });
});
