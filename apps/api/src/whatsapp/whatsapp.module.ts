import { Module, forwardRef } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { ChatModule } from '../chat/chat.module';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [forwardRef(() => ChatModule), forwardRef(() => LlmModule)],
  providers: [WhatsappService],
  controllers: [WhatsappController],
  exports: [WhatsappService],
})
export class WhatsappModule {}
