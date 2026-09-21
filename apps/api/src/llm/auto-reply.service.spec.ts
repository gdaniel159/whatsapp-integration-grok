import { AutoReplyService } from './auto-reply.service';

const DEFAULT_SETTINGS = {
  id: 'default',
  welcomeMessage: 'Hola welcome',
  firstAction: 'CTA',
  hfModel: null,
  globalAutoReplyEnabled: false,
  updatedAt: new Date(),
};

function makeService(opts: {
  globalAutoReplyEnabled: boolean;
  aiMode: 'AI' | 'MANUAL';
  inboundCount?: number;
}) {
  const sendMessage = jest.fn(async () => ({ id: 'out1' }));
  const chatCompletion = jest.fn(async () => 'AI reply text');
  const fallbackReply = jest.fn(() => 'fallback');
  const buildSystemPrompt = jest.fn((kb: string) => `sys:${kb}`);

  const settings = {
    ...DEFAULT_SETTINGS,
    globalAutoReplyEnabled: opts.globalAutoReplyEnabled,
  };

  const prisma = {
    botSettings: {
      upsert: jest.fn(async ({ create }: { create: Record<string, unknown> }) => {
        // Simulate create path returning defaults when testing ensureBotSettings
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
    // Force upsert to return OFF
    prisma.botSettings.upsert.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      globalAutoReplyEnabled: false,
    });

    await svc.handleInbound('conv1', 'hola');

    expect(sendMessage).not.toHaveBeenCalled();
    expect(llm.chatCompletion).not.toHaveBeenCalled();
    expect(prisma.conversation.findUnique).not.toHaveBeenCalled();
  });

  it('Global ON + aiMode AI → auto path proceeds (welcome + AI)', async () => {
    const { svc, sendMessage, llm, prisma } = makeService({
      globalAutoReplyEnabled: true,
      aiMode: 'AI',
      inboundCount: 1,
    });
    prisma.botSettings.upsert.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      globalAutoReplyEnabled: true,
      welcomeMessage: 'Bienvenido',
      firstAction: 'Elige 1',
    });

    await svc.handleInbound('conv1', 'hola');

    expect(llm.chatCompletion).toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalled();
    // welcome + AI reply
    const bodies = sendMessage.mock.calls.map(
      (c: unknown[]) => c[1] as string,
    );
    expect(bodies.length).toBeGreaterThanOrEqual(2);
    expect(bodies[0]).toContain('Bienvenido');
    expect(bodies).toContain('AI reply text');
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
