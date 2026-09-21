import {
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { WhatsappService } from '../whatsapp/whatsapp.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    @Inject(forwardRef(() => WhatsappService))
    private readonly wa: WhatsappService,
  ) {}

  listConversations() {
    return this.prisma.conversation.findMany({
      orderBy: { lastMessageAt: 'desc' },
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
    });

    this.events.emitMessage(message);
    this.events.emitConversation(updated);
    return message;
  }

  async persistIncoming(input: {
    remoteJid: string;
    name: string | null;
    body: string;
    waMessageId?: string;
    timestamp: Date;
    rawMeta?: object;
  }) {
    const conv = await this.prisma.conversation.upsert({
      where: { remoteJid: input.remoteJid },
      update: {
        lastMessageAt: input.timestamp,
        ...(input.name ? { name: input.name } : {}),
      },
      create: {
        remoteJid: input.remoteJid,
        name: input.name,
        lastMessageAt: input.timestamp,
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
