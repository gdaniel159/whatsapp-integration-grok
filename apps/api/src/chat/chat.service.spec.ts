import { ChatService } from './chat.service';
import { NotFoundException } from '@nestjs/common';

/**
 * Manual panel send path must not consult BotSettings.globalAutoReplyEnabled.
 */
describe('ChatService.sendMessage — unaffected by global kill switch', () => {
  it('sends via WA + persists without reading BotSettings', async () => {
    const conv = {
      id: 'conv1',
      remoteJid: '51991112233@s.whatsapp.net',
      aiMode: 'AI',
    };
    const createdMsg = {
      id: 'm1',
      conversationId: 'conv1',
      direction: 'OUT',
      body: 'manual hello',
      timestamp: new Date(),
    };
    const updatedConv = { ...conv, lastMessageAt: new Date(), contact: null };

    const prisma = {
      conversation: {
        findUnique: jest.fn(async () => conv),
        update: jest.fn(async () => updatedConv),
      },
      message: {
        create: jest.fn(async () => createdMsg),
      },
      botSettings: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };
    const events = {
      emitMessage: jest.fn(),
      emitConversation: jest.fn(),
    };
    const wa = {
      sendText: jest.fn(async () => ({ key: { id: 'wa1' } })),
    };
    const contacts = {
      upsertFromWaJid: jest.fn(async () => ({ id: 'c1' })),
    };

    const svc = new ChatService(
      prisma as never,
      events as never,
      wa as never,
      contacts as never,
    );

    const result = await svc.sendMessage('conv1', 'manual hello');

    expect(wa.sendText).toHaveBeenCalledWith(
      '51991112233@s.whatsapp.net',
      'manual hello',
    );
    expect(prisma.message.create).toHaveBeenCalled();
    expect(prisma.botSettings.findUnique).not.toHaveBeenCalled();
    expect(prisma.botSettings.upsert).not.toHaveBeenCalled();
    expect(result).toEqual(createdMsg);
  });

  it('throws when conversation missing', async () => {
    const prisma = {
      conversation: { findUnique: jest.fn(async () => null) },
      botSettings: { findUnique: jest.fn(), upsert: jest.fn() },
    };
    const svc = new ChatService(
      prisma as never,
      { emitMessage: jest.fn(), emitConversation: jest.fn() } as never,
      { sendText: jest.fn() } as never,
      { upsertFromWaJid: jest.fn() } as never,
    );
    await expect(svc.sendMessage('missing', 'x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.botSettings.findUnique).not.toHaveBeenCalled();
  });
});
