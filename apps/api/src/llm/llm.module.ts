import { Module, forwardRef } from '@nestjs/common';
import { LlmController } from './llm.controller';
import { LlmService } from './llm.service';
import { AutoReplyService } from './auto-reply.service';
import { CommercialDecisionService } from './commercial-decision.service';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { BotSettingsController } from './bot-settings.controller';
import { ChatModule } from '../chat/chat.module';
import { ContactsModule } from '../contacts/contacts.module';

@Module({
  imports: [forwardRef(() => ChatModule), ContactsModule],
  controllers: [
    LlmController,
    KnowledgeBaseController,
    BotSettingsController,
  ],
  providers: [LlmService, AutoReplyService, CommercialDecisionService],
  exports: [LlmService, AutoReplyService, CommercialDecisionService],
})
export class LlmModule {}
