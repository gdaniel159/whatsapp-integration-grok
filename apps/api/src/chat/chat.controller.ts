import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsEnum, IsString, MinLength } from 'class-validator';
import { AiMode } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatService } from './chat.service';

class SendMessageDto {
  @IsString()
  @MinLength(1)
  body!: string;
}

class PatchAiModeDto {
  @IsEnum(AiMode)
  aiMode!: AiMode;
}

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  list() {
    return this.chat.listConversations();
  }

  @Get(':id/messages')
  messages(@Param('id') id: string) {
    return this.chat.listMessages(id);
  }

  @Post(':id/messages')
  send(@Param('id') id: string, @Body() dto: SendMessageDto) {
    return this.chat.sendMessage(id, dto.body);
  }

  @Patch(':id/ai-mode')
  patchAiMode(@Param('id') id: string, @Body() dto: PatchAiModeDto) {
    return this.chat.setAiMode(id, dto.aiMode);
  }
}
