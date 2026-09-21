import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { ChatModule } from './chat/chat.module';
import { EventsModule } from './events/events.module';
import { LlmModule } from './llm/llm.module';
import { ContactsModule } from './contacts/contacts.module';
import { DevModule } from './dev/dev.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    EventsModule,
    AuthModule,
    ContactsModule,
    WhatsappModule,
    ChatModule,
    LlmModule,
    DevModule,
  ],
})
export class AppModule {}
