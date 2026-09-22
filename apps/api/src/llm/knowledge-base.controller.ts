import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { DEMO_KB_CONTENT } from './demo-nova-servicios';

class UpdateKnowledgeBaseDto {
  @IsString()
  content!: string;
}

@Controller('knowledge-base')
@UseGuards(JwtAuthGuard)
export class KnowledgeBaseController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get() {
    const row = await this.prisma.knowledgeBase.upsert({
      where: { id: 'default' },
      update: {},
      create: {
        id: 'default',
        content: DEMO_KB_CONTENT,
      },
    });
    return row;
  }

  @Put()
  async put(@Body() dto: UpdateKnowledgeBaseDto) {
    return this.prisma.knowledgeBase.upsert({
      where: { id: 'default' },
      update: { content: dto.content },
      create: { id: 'default', content: dto.content },
    });
  }
}
