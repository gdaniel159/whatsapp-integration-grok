import {
  Body,
  Controller,
  ForbiddenException,
  Post,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatService } from '../chat/chat.service';
import { PrismaService } from '../prisma/prisma.service';

class SimulateInboundDto {
  @IsString()
  @MinLength(1)
  contactKey!: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsString()
  @MinLength(1)
  body!: string;
}

function sanitizeContactKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9-]/g, '');
}

@Controller('dev')
@UseGuards(JwtAuthGuard)
export class DevController {
  constructor(
    private readonly chat: ChatService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('simulate-inbound')
  async simulateInbound(@Body() dto: SimulateInboundDto) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Simulator disabled in production');
    }

    const contactKey = sanitizeContactKey(dto.contactKey);
    if (!contactKey) {
      throw new BadRequestException(
        'contactKey must contain alphanumeric characters or hyphens',
      );
    }

    const remoteJid = `${contactKey}@simulator.local`;
    const result = await this.chat.processIncomingMessage({
      remoteJid,
      displayName: dto.displayName ?? null,
      body: dto.body,
      awaitAutoReply: true,
    });

    if (!result) {
      throw new BadRequestException(
        `Could not process inbound for jid=${remoteJid}`,
      );
    }

    const conv = await this.prisma.conversation.findUnique({
      where: { id: result.conversationId },
      select: { contactId: true, remoteJid: true },
    });
    if (!conv?.contactId) {
      throw new NotFoundException('Conversation/contact missing after ingest');
    }

    return {
      contactId: conv.contactId,
      conversationId: result.conversationId,
      messageId: result.messageId,
      remoteJid: conv.remoteJid,
      commercialAnalysis: result.commercialAnalysis,
    };
  }
}
