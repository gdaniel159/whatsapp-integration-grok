import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ContactsService } from './contacts.service';
import { UpdateCommercialDto } from './update-commercial.dto';

@Controller('contacts')
@UseGuards(JwtAuthGuard)
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  list() {
    return this.contacts.list();
  }

  /** Registered before GET :id so Nest matches /contacts/:id/activities. */
  @Get(':id/activities')
  listActivities(
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    const parsed =
      limit !== undefined && limit !== '' ? Number.parseInt(limit, 10) : 50;
    const take = Number.isFinite(parsed) ? parsed : 50;
    return this.contacts.listActivities(id, take);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.contacts.getById(id);
  }

  @Post(':id/resolve-human-handoff')
  resolveHumanHandoff(@Param('id') id: string) {
    return this.contacts.resolveHumanHandoff(id);
  }

  @Patch(':id')
  patch(@Param('id') id: string, @Body() dto: UpdateCommercialDto) {
    return this.contacts.updateCommercial(id, dto);
  }
}
