import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
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

  @Get(':id')
  get(@Param('id') id: string) {
    return this.contacts.getById(id);
  }

  @Patch(':id')
  patch(@Param('id') id: string, @Body() dto: UpdateCommercialDto) {
    return this.contacts.updateCommercial(id, dto);
  }
}
