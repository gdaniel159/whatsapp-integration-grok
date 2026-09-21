import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_WELCOME =
  '¡Hola! 👋 Bienvenido/a. Soy el asistente virtual de nuestro negocio. Estoy aquí para ayudarte con información sobre productos, servicios y horarios.';

const DEFAULT_FIRST_ACTION =
  'Escribe 1 para precios, 2 para horarios, o cuéntame en qué puedo ayudarte.';

class PatchBotSettingsDto {
  @IsOptional()
  @IsString()
  welcomeMessage?: string;

  @IsOptional()
  @IsString()
  firstAction?: string;

  @IsOptional()
  @IsString()
  hfModel?: string | null;

  @IsOptional()
  @IsBoolean()
  globalAutoReplyEnabled?: boolean;
}

@Controller('bot-settings')
@UseGuards(JwtAuthGuard)
export class BotSettingsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get() {
    return this.prisma.botSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: {
        id: 'default',
        welcomeMessage: DEFAULT_WELCOME,
        firstAction: DEFAULT_FIRST_ACTION,
        globalAutoReplyEnabled: false,
      },
    });
  }

  @Patch()
  async patch(@Body() dto: PatchBotSettingsDto) {
    const data: {
      welcomeMessage?: string;
      firstAction?: string;
      hfModel?: string | null;
      globalAutoReplyEnabled?: boolean;
    } = {};
    if (dto.welcomeMessage !== undefined) data.welcomeMessage = dto.welcomeMessage;
    if (dto.firstAction !== undefined) data.firstAction = dto.firstAction;
    if (dto.hfModel !== undefined) {
      data.hfModel = dto.hfModel?.trim() ? dto.hfModel.trim() : null;
    }
    if (dto.globalAutoReplyEnabled !== undefined) {
      data.globalAutoReplyEnabled = dto.globalAutoReplyEnabled;
    }

    return this.prisma.botSettings.upsert({
      where: { id: 'default' },
      update: data,
      create: {
        id: 'default',
        welcomeMessage: dto.welcomeMessage ?? DEFAULT_WELCOME,
        firstAction: dto.firstAction ?? DEFAULT_FIRST_ACTION,
        hfModel: data.hfModel ?? null,
        globalAutoReplyEnabled: data.globalAutoReplyEnabled ?? false,
      },
    });
  }
}
