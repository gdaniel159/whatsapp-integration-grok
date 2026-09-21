import {
  Injectable,
  Logger,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { AiMode, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { ContactsService } from '../contacts/contacts.service';
import { AutoReplyService } from '../llm/auto-reply.service';
import { isSimulatorJid, normalizeWaJid } from '../contacts/jid.util';

export type ProcessIncomingMessageInput = {
  remoteJid: string;
  displayName?: string | null;
  body: string;
  messageId?: string;
  timestamp?: Date;
  rawMeta?: object;
  /** When true (DEV simulator), await auto-reply so callers can assert OUT synchronously. */
  awaitAutoReply?: boolean;
};

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    @Inject(forwardRef(() => WhatsappService))
    private readonly wa: WhatsappService,
    private readonly contacts: ContactsService,
    @Inject(forwardRef(() => AutoReplyService))
    private readonly autoReply: AutoReplyService,
  ) {}

  listConversations() {
    return this.prisma.conversation.findMany({
      orderBy: { lastMessageAt: 'desc' },
      include: {
        contact: {
          select: {
            id: true,
            displayName: true,
            phoneE164: true,
            waJid: true,
          },
        },
      },
    });
  }

  async listMessages(conversationId: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv) throw new NotFoundException('Conversación no encontrada');
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { timestamp: 'asc' },
    });
  }

  async sendMessage(conversationId: string, body: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv) throw new NotFoundException('Conversación no encontrada');

    const timestamp = new Date();
    let waMessageId: string | undefined;

    // Simulator conversations never touch Baileys — persist + emit only.
    if (!isSimulatorJid(conv.remoteJid)) {
      const result = await this.wa.sendText(conv.remoteJid, body);
      waMessageId = result?.key?.id || undefined;
    }

    // Ensure Contact stays in sync on outbound (lastSeenAt / name)
    await this.contacts.upsertFromWaJid(conv.remoteJid, {
      seenAt: timestamp,
    });

    const message = await this.prisma.message.create({
      data: {
        conversationId: conv.id,
        direction: 'OUT',
        body,
        timestamp,
        waMessageId,
      },
    });

    const updated = await this.prisma.conversation.update({
      where: { id: conv.id },
      data: { lastMessageAt: timestamp },
      include: {
        contact: {
          select: {
            id: true,
            displayName: true,
            phoneE164: true,
            waJid: true,
          },
        },
      },
    });

    this.events.emitMessage(message);
    this.events.emitConversation(updated);
    return message;
  }

  async setAiMode(conversationId: string, aiMode: AiMode) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv) throw new NotFoundException('Conversación no encontrada');
    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { aiMode },
      include: {
        contact: {
          select: {
            id: true,
            displayName: true,
            phoneE164: true,
            waJid: true,
          },
        },
      },
    });
    this.events.emitConversation(updated);
    return updated;
  }

  /**
   * Shared inbound pipeline used by Baileys and the DEV simulator.
   * Upserts Contact + Conversation, creates Message IN, emits sockets,
   * then triggers AutoReplyService (async by default; awaitable for DEV).
   */
  async processIncomingMessage(
    input: ProcessIncomingMessageInput,
  ): Promise<{ conversationId: string; messageId: string } | null> {
    const timestamp = input.timestamp ?? new Date();
    const displayName = input.displayName ?? null;

    const contact = await this.contacts.upsertFromWaJid(input.remoteJid, {
      pushName: displayName,
      seenAt: timestamp,
    });

    // Groups / non-personal: do not create Contact or Conversation
    if (!contact) {
      this.logger.warn(
        `processIncomingMessage skipped: no Contact for jid=${input.remoteJid}`,
      );
      return null;
    }

    const remoteJid = normalizeWaJid(input.remoteJid) ?? input.remoteJid;

    const conv = await this.prisma.conversation.upsert({
      where: { remoteJid },
      update: {
        lastMessageAt: timestamp,
        contactId: contact.id,
        ...(displayName ? { name: displayName } : {}),
      },
      create: {
        remoteJid,
        name: displayName,
        lastMessageAt: timestamp,
        contactId: contact.id,
      },
      include: {
        contact: {
          select: {
            id: true,
            displayName: true,
            phoneE164: true,
            waJid: true,
          },
        },
      },
    });

    const message = await this.prisma.message.create({
      data: {
        conversationId: conv.id,
        direction: 'IN',
        body: input.body,
        timestamp,
        waMessageId: input.messageId,
        rawMeta: input.rawMeta as Prisma.InputJsonValue | undefined,
      },
    });

    this.events.emitMessage(message);
    this.events.emitConversation(conv);

    if (input.awaitAutoReply) {
      await this.autoReply.handleInbound(conv.id, input.body);
    } else {
      this.autoReply.handleInboundAsync(conv.id, input.body);
    }

    return { conversationId: conv.id, messageId: message.id };
  }

  /** @deprecated Prefer processIncomingMessage — kept as thin internal alias. */
  async persistIncoming(input: {
    remoteJid: string;
    name: string | null;
    body: string;
    waMessageId?: string;
    timestamp: Date;
    rawMeta?: object;
  }) {
    const result = await this.processIncomingMessage({
      remoteJid: input.remoteJid,
      displayName: input.name,
      body: input.body,
      messageId: input.waMessageId,
      timestamp: input.timestamp,
      rawMeta: input.rawMeta,
      awaitAutoReply: false,
    });
    if (!result) return null;
    return this.prisma.message.findUnique({ where: { id: result.messageId } });
  }
}
