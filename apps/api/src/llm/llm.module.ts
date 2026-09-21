import { Module, forwardRef } from '@nestjs/common';
import { LlmController } from './llm.controller';
import { LlmService } from './llm.service';
import { AutoReplyService } from './auto-reply.service';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { BotSettingsController } from './bot-settings.controller';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [forwardRef(() => ChatModule)],
  controllers: [
    LlmController,
    KnowledgeBaseController,
    BotSettingsController,
  ],
  providers: [LlmService, AutoReplyService],
  exports: [LlmService, AutoReplyService],
})
export class LlmModule {}
