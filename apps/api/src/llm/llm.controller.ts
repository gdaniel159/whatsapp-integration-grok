import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LlmService } from './llm.service';
import { ConfigService } from '@nestjs/config';

@Controller('llm')
@UseGuards(JwtAuthGuard)
export class LlmController {
  constructor(
    private readonly llm: LlmService,
    private readonly config: ConfigService,
  ) {}

  @Get('health')
  async health() {
    const hasToken = Boolean(this.llm.getToken());
    const model = await this.llm.resolveModel();
    return {
      status: hasToken ? 'ready' : 'no_token',
      hfTokenConfigured: hasToken,
      model,
      router: 'https://router.huggingface.co/v1/chat/completions',
      message: hasToken
        ? 'HF Inference Router disponible'
        : 'HF_TOKEN no configurado — auto-reply usará fallback',
    };
  }
}
