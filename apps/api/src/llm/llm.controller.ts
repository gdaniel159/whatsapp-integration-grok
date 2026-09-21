import { Controller, Get } from '@nestjs/common';

/**
 * STUB — Knowledge Base / Hugging Face LLM.
 * Ver specs/04-llm-knowledge-base-future.md
 * No hay llamadas reales a HF en el MVP.
 */
@Controller('llm')
export class LlmController {
  @Get('health')
  health() {
    return {
      status: 'stub',
      message:
        'LLM/KB no implementado. Ver specs/04-llm-knowledge-base-future.md',
    };
  }
}
