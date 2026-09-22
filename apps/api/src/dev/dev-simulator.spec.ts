import { ForbiddenException } from '@nestjs/common';
import { ChatService } from '../chat/chat.service';
import { DevController } from './dev.controller';
import { ContactsService } from '../contacts/contacts.service';

type ContactRow = {
  id: string;
  waJid: string;
  phoneE164: string | null;
  displayName: string | null;
  profileName: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date | null;
};

type ConvRow = {
  id: string;
  remoteJid: string;
  name: string | null;
  lastMessageAt: Date | null;
  contactId: string;
  aiMode: 'AI' | 'MANUAL';
  contact?: {
    id: string;
    displayName: string | null;
    phoneE164: string | null;
    waJid: string;
  };
};

type MsgRow = {
  id: string;
  conversationId: string;
  direction: 'IN' | 'OUT';
  body: string;
  timestamp: Date;
  waMessageId?: string;
};

function makePipeline() {
  const contactsStore = new Map<string, ContactRow>();
  const convsByJid = new Map<string, ConvRow>();
  const messages: MsgRow[] = [];
  let cSeq = 0;
  let vSeq = 0;
  let mSeq = 0;

  let globalAutoReplyEnabled = false;
  let aiMode: 'AI' | 'MANUAL' = 'AI';

  const contactApi = {
    findUnique: jest.fn(async ({ where }: { where: { waJid: string } }) => {
      return contactsStore.get(where.waJid) ?? null;
    }),
    create: jest.fn(async ({ data }: { data: Partial<ContactRow> }) => {
      const row: ContactRow = {
        id: `c${++cSeq}`,
        waJid: data.waJid!,
        phoneE164: data.phoneE164 ?? null,
        displayName: data.displayName ?? null,
        profileName: data.profileName ?? null,
        firstSeenAt: data.firstSeenAt ?? new Date(),
        lastSeenAt: data.lastSeenAt ?? null,
      };
      contactsStore.set(row.waJid, row);
      return row;
    }),
    update: jest.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<ContactRow>;
      }) => {
        const existing = [...contactsStore.values()].find(
          (c) => c.id === where.id,
        )!;
        Object.assign(existing, data);
        return existing;
      },
    ),
  };

  const commercialActivityApi = {
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => data),
    createMany: jest.fn(async ({ data }: { data: unknown[] }) => ({
      count: data.length,
    })),
  };

  const contactsPrisma = {
    contact: contactApi,
    commercialActivity: commercialActivityApi,
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        contact: contactApi,
        commercialActivity: commercialActivityApi,
      }),
    ),
  };

  const contacts = new ContactsService(contactsPrisma as never);

  const wa = {
    sendText: jest.fn(async () => {
      throw new Error('wa.sendText should not be called for simulator');
    }),
  };

  const events = {
    emitMessage: jest.fn(),
    emitConversation: jest.fn(),
  };

  const chatCompletion = jest.fn(async () => 'AI sim reply');

  // AutoReply will call chat.sendMessage — wire a real ChatService after
  let chat: ChatService;

  const prisma = {
    conversation: {
      upsert: jest.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { remoteJid: string };
          create: Omit<ConvRow, 'id' | 'aiMode'> & { aiMode?: 'AI' | 'MANUAL' };
          update: Partial<ConvRow>;
        }) => {
          let row = convsByJid.get(where.remoteJid);
          if (!row) {
            row = {
              id: `v${++vSeq}`,
              remoteJid: create.remoteJid,
              name: create.name ?? null,
              lastMessageAt: create.lastMessageAt ?? null,
              contactId: create.contactId,
              aiMode: aiMode,
            };
            convsByJid.set(where.remoteJid, row);
          } else {
            Object.assign(row, update);
          }
          const contact = [...contactsStore.values()].find(
            (c) => c.id === row!.contactId,
          );
          return {
            ...row,
            contact: contact
              ? {
                  id: contact.id,
                  displayName: contact.displayName,
                  phoneE164: contact.phoneE164,
                  waJid: contact.waJid,
                }
              : null,
          };
        },
      ),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        const row = [...convsByJid.values()].find((c) => c.id === where.id);
        if (!row) return null;
        return { ...row, aiMode };
      }),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<ConvRow>;
        }) => {
          const row = [...convsByJid.values()].find((c) => c.id === where.id)!;
          Object.assign(row, data);
          const contact = [...contactsStore.values()].find(
            (c) => c.id === row.contactId,
          );
          return {
            ...row,
            contact: contact
              ? {
                  id: contact.id,
                  displayName: contact.displayName,
                  phoneE164: contact.phoneE164,
                  waJid: contact.waJid,
                }
              : null,
          };
        },
      ),
    },
    message: {
      create: jest.fn(async ({ data }: { data: Omit<MsgRow, 'id'> }) => {
        const row: MsgRow = { id: `m${++mSeq}`, ...data };
        messages.push(row);
        return row;
      }),
      count: jest.fn(async ({ where }: { where: { conversationId: string; direction: string } }) => {
        return messages.filter(
          (m) =>
            m.conversationId === where.conversationId &&
            m.direction === where.direction,
        ).length;
      }),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        return messages.find((m) => m.id === where.id) ?? null;
      }),
    },
    botSettings: {
      upsert: jest.fn(async () => ({
        id: 'default',
        welcomeMessage: 'Bienvenido sim',
        firstAction: 'CTA',
        hfModel: null,
        globalAutoReplyEnabled,
        updatedAt: new Date(),
      })),
    },
    knowledgeBase: {
      findUnique: jest.fn(async () => ({ id: 'default', content: 'KB' })),
    },
  };

  // Lazy AutoReplyService-like object that uses chat.sendMessage
  const autoReply = {
    handleInboundAsync: jest.fn((conversationId: string, userBody: string) => {
      void autoReply.handleInbound(conversationId, userBody);
    }),
    handleInbound: jest.fn(async (conversationId: string, userBody: string) => {
      const settings = await prisma.botSettings.upsert();
      if (!settings.globalAutoReplyEnabled) return;
      const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
      });
      if (!conv || conv.aiMode !== 'AI') return;
      const inboundCount = await prisma.message.count({
        where: { conversationId, direction: 'IN' },
      });
      if (inboundCount === 1) {
        await chat.sendMessage(
          conversationId,
          `${settings.welcomeMessage}\n\n${settings.firstAction}`,
        );
      }
      const reply = await chatCompletion();
      await chat.sendMessage(conversationId, reply);
    }),
  };

  chat = new ChatService(
    prisma as never,
    events as never,
    wa as never,
    contacts,
    autoReply as never,
    {
      handleInboundAsync: jest.fn(),
      handleInbound: jest.fn(async () => ({
        mode: 'OFF',
        ran: false,
        decision: null,
        preview: null,
        appliedStatus: null,
        appliedTags: [],
        outcome: 'DISABLED',
        reason: 'Análisis comercial desactivado',
      })),
    } as never,
  );

  const controller = new DevController(chat, prisma as never);

  return {
    chat,
    controller,
    prisma,
    wa,
    contactsStore,
    convsByJid,
    messages,
    chatCompletion,
    setGlobal(v: boolean) {
      globalAutoReplyEnabled = v;
    },
    setAiMode(v: 'AI' | 'MANUAL') {
      aiMode = v;
    },
  };
}

describe('DEV inbound simulator', () => {
  const prevEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = prevEnv;
  });

  it('A) first message test-001 → Contact+Conversation+Message IN', async () => {
    process.env.NODE_ENV = 'development';
    const p = makePipeline();
    p.setGlobal(false);

    const res = await p.controller.simulateInbound({
      contactKey: 'test-001',
      displayName: 'Cliente prueba',
      body: 'Hola',
    });

    expect(res.remoteJid).toBe('test-001@simulator.local');
    expect(p.contactsStore.size).toBe(1);
    const contact = [...p.contactsStore.values()][0];
    expect(contact.waJid).toBe('test-001@simulator.local');
    expect(contact.phoneE164).toBeNull();
    expect(contact.displayName).toBe('Cliente prueba');
    expect(p.convsByJid.size).toBe(1);
    expect(p.messages.filter((m) => m.direction === 'IN')).toHaveLength(1);
    expect(res.contactId).toBe(contact.id);
    expect(res.conversationId).toBeTruthy();
    expect(res.messageId).toBeTruthy();
  });

  it('B) second message same key → same contact/conversation', async () => {
    process.env.NODE_ENV = 'development';
    const p = makePipeline();
    p.setGlobal(false);

    const a = await p.controller.simulateInbound({
      contactKey: 'test-001',
      displayName: 'Cliente prueba',
      body: 'Hola',
    });
    const b = await p.controller.simulateInbound({
      contactKey: 'test-001',
      body: 'Segundo',
    });

    expect(a.contactId).toBe(b.contactId);
    expect(a.conversationId).toBe(b.conversationId);
    expect(p.contactsStore.size).toBe(1);
    expect(p.convsByJid.size).toBe(1);
    expect(p.messages.filter((m) => m.direction === 'IN')).toHaveLength(2);
  });

  it('C) test-002 → new contact/conversation', async () => {
    process.env.NODE_ENV = 'development';
    const p = makePipeline();
    p.setGlobal(false);

    const a = await p.controller.simulateInbound({
      contactKey: 'test-001',
      body: 'A',
    });
    const b = await p.controller.simulateInbound({
      contactKey: 'test-002',
      body: 'B',
    });

    expect(a.contactId).not.toBe(b.contactId);
    expect(a.conversationId).not.toBe(b.conversationId);
    expect(p.contactsStore.size).toBe(2);
    expect(p.convsByJid.size).toBe(2);
  });

  it('D) globalAutoReply OFF → IN yes, no OUT', async () => {
    process.env.NODE_ENV = 'development';
    const p = makePipeline();
    p.setGlobal(false);

    await p.controller.simulateInbound({
      contactKey: 'test-001',
      body: 'Hola',
    });

    expect(p.messages.filter((m) => m.direction === 'IN')).toHaveLength(1);
    expect(p.messages.filter((m) => m.direction === 'OUT')).toHaveLength(0);
    expect(p.wa.sendText).not.toHaveBeenCalled();
    expect(p.chatCompletion).not.toHaveBeenCalled();
  });

  it('E) global ON + aiMode AI → IN + OUT persisted, wa.sendText NOT called', async () => {
    process.env.NODE_ENV = 'development';
    const p = makePipeline();
    p.setGlobal(true);
    p.setAiMode('AI');

    await p.controller.simulateInbound({
      contactKey: 'test-001',
      displayName: 'Sim',
      body: 'Hola',
    });

    expect(p.messages.filter((m) => m.direction === 'IN').length).toBe(1);
    expect(p.messages.filter((m) => m.direction === 'OUT').length).toBeGreaterThanOrEqual(1);
    expect(p.wa.sendText).not.toHaveBeenCalled();
    expect(p.chatCompletion).toHaveBeenCalled();
  });

  it('F) NODE_ENV=production → endpoint 403', async () => {
    process.env.NODE_ENV = 'production';
    const p = makePipeline();

    await expect(
      p.controller.simulateInbound({
        contactKey: 'test-001',
        body: 'Hola',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(p.contactsStore.size).toBe(0);
    expect(p.messages).toHaveLength(0);
  });
});
