import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { CommercialAutomationMode } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_WELCOME =
  '¡Hola! 👋 Bienvenido/a. Soy el asistente virtual de nuestro negocio. Estoy aquí para ayudarte con información sobre productos, servicios y horarios.';

const DEFAULT_FIRST_ACTION =
  'Escribe 1 para precios, 2 para horarios, o cuéntame en qué puedo ayudarte.';

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

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

  @IsOptional()
  @IsEnum(CommercialAutomationMode)
  commercialAutomationMode?: CommercialAutomationMode;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  businessName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @IsString()
  @Matches(HH_MM, { message: 'businessHoursStart must be HH:mm' })
  businessHoursStart?: string;

  @IsOptional()
  @IsString()
  @Matches(HH_MM, { message: 'businessHoursEnd must be HH:mm' })
  businessHoursEnd?: string;
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
        commercialAutomationMode: CommercialAutomationMode.OFF,
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
      commercialAutomationMode?: CommercialAutomationMode;
      businessName?: string;
      timezone?: string;
      businessHoursStart?: string;
      businessHoursEnd?: string;
    } = {};
    if (dto.welcomeMessage !== undefined) data.welcomeMessage = dto.welcomeMessage;
    if (dto.firstAction !== undefined) data.firstAction = dto.firstAction;
    if (dto.hfModel !== undefined) {
      data.hfModel = dto.hfModel?.trim() ? dto.hfModel.trim() : null;
    }
    if (dto.globalAutoReplyEnabled !== undefined) {
      data.globalAutoReplyEnabled = dto.globalAutoReplyEnabled;
    }
    if (dto.commercialAutomationMode !== undefined) {
      data.commercialAutomationMode = dto.commercialAutomationMode;
    }
    if (dto.businessName !== undefined) {
      data.businessName = dto.businessName.trim();
    }
    if (dto.timezone !== undefined) {
      data.timezone = dto.timezone.trim() || 'UTC';
    }
    if (dto.businessHoursStart !== undefined) {
      data.businessHoursStart = dto.businessHoursStart;
    }
    if (dto.businessHoursEnd !== undefined) {
      data.businessHoursEnd = dto.businessHoursEnd;
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
        commercialAutomationMode:
          data.commercialAutomationMode ?? CommercialAutomationMode.OFF,
        businessName: data.businessName ?? '',
        timezone: data.timezone ?? 'UTC',
        businessHoursStart: data.businessHoursStart ?? '09:00',
        businessHoursEnd: data.businessHoursEnd ?? '17:00',
      },
    });
  }
}
