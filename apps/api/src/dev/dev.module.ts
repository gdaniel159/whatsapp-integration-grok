import { Module } from '@nestjs/common';
import { DevController } from './dev.controller';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [ChatModule],
  controllers: [DevController],
})
export class DevModule {}
