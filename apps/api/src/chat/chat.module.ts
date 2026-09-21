import { Module, forwardRef } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { ContactsModule } from '../contacts/contacts.module';

@Module({
  imports: [forwardRef(() => WhatsappModule), ContactsModule],
  providers: [ChatService],
  controllers: [ChatController],
  exports: [ChatService],
})
export class ChatModule {}
