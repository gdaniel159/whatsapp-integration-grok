import {
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { AiMode, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { ContactsService } from '../contacts/contacts.service';
import { normalizeWaJid } from '../contacts/jid.util';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    @Inject(forwardRef(() => WhatsappService))
    private readonly wa: WhatsappService,
    private readonly contacts: ContactsService,
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

    const result = await this.wa.sendText(conv.remoteJid, body);
    const waMessageId = result?.key?.id || undefined;
    const timestamp = new Date();

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

  async persistIncoming(input: {
    remoteJid: string;
    name: string | null;
    body: string;
    waMessageId?: string;
    timestamp: Date;
    rawMeta?: object;
  }) {
    const contact = await this.contacts.upsertFromWaJid(input.remoteJid, {
      pushName: input.name,
      seenAt: input.timestamp,
    });

    // Groups / non-personal: do not create Contact or Conversation
    if (!contact) {
      return null;
    }

    const remoteJid = normalizeWaJid(input.remoteJid) ?? input.remoteJid;

    const conv = await this.prisma.conversation.upsert({
      where: { remoteJid },
      update: {
        lastMessageAt: input.timestamp,
        contactId: contact.id,
        ...(input.name ? { name: input.name } : {}),
      },
      create: {
        remoteJid,
        name: input.name,
        lastMessageAt: input.timestamp,
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
        timestamp: input.timestamp,
        waMessageId: input.waMessageId,
        rawMeta: input.rawMeta as Prisma.InputJsonValue | undefined,
      },
    });

    this.events.emitMessage(message);
    this.events.emitConversation(conv);
    return message;
  }
}
