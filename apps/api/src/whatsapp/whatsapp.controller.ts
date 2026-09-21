import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
@UseGuards(JwtAuthGuard)
export class WhatsappController {
  constructor(private readonly wa: WhatsappService) {}

  @Get('status')
  status() {
    return this.wa.getStatus();
  }

  @Post('start')
  async start() {
    await this.wa.start();
    return this.wa.getStatus();
  }

  @Post('logout')
  async logout() {
    await this.wa.logout();
    return this.wa.getStatus();
  }
}
