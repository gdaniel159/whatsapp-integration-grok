import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatService } from './chat.service';

class SendMessageDto {
  @IsString()
  @MinLength(1)
  body!: string;
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
}
