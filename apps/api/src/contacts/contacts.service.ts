import { Injectable, NotFoundException } from '@nestjs/common';
import { Contact, LeadStatus } from '@prisma/client';
import { UpdateCommercialDto } from './update-commercial.dto';
import { PrismaService } from '../prisma/prisma.service';
import {
  isPersonalWaJid,
  normalizeWaJid,
  phoneE164FromJid,
} from './jid.util';

export type UpsertFromWaJidOpts = {
  pushName?: string | null;
  seenAt?: Date;
};

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.contact.findMany({
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async getById(id: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { id },
      include: {
        conversations: {
          select: {
            id: true,
            remoteJid: true,
            lastMessageAt: true,
            name: true,
          },
          orderBy: { lastMessageAt: 'desc' },
        },
      },
    });
    if (!contact) throw new NotFoundException('Contacto no encontrado');
    const { conversations, ...rest } = contact;
    return {
      ...rest,
      conversationId: conversations[0]?.id ?? null,
      conversations,
    };
  }


  async updateCommercial(id: string, dto: UpdateCommercialDto) {
    const existing = await this.prisma.contact.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Contacto no encontrado');

    const data: {
      leadStatus?: LeadStatus;
      notes?: string;
      tags?: string[];
    } = {};
    if (dto.leadStatus !== undefined) data.leadStatus = dto.leadStatus;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.tags !== undefined) data.tags = dto.tags;

    await this.prisma.contact.update({ where: { id }, data });
    return this.getById(id);
  }

  /**
   * Idempotent upsert by normalized personal waJid.
   * Returns null for groups / broadcast / non-personal JIDs.
   */
  async upsertFromWaJid(
    jid: string,
    opts: UpsertFromWaJidOpts = {},
  ): Promise<Contact | null> {
    if (!isPersonalWaJid(jid)) return null;

    const waJid = normalizeWaJid(jid)!;
    const phoneE164 = phoneE164FromJid(waJid);
    const seenAt = opts.seenAt ?? new Date();
    const pushName =
      opts.pushName && opts.pushName.trim() ? opts.pushName.trim() : null;

    const existing = await this.prisma.contact.findUnique({
      where: { waJid },
    });

    if (!existing) {
      return this.prisma.contact.create({
        data: {
          waJid,
          phoneE164,
          displayName: pushName,
          profileName: pushName,
          firstSeenAt: seenAt,
          lastSeenAt: seenAt,
        },
      });
    }

    const nameUpdate: { displayName?: string; profileName?: string } = {};
    if (pushName) {
      const displayEmpty =
        !existing.displayName || existing.displayName.trim() === '';
      const displayMatchesProfile =
        existing.displayName === existing.profileName;
      if (displayEmpty || displayMatchesProfile) {
        nameUpdate.displayName = pushName;
        nameUpdate.profileName = pushName;
      } else {
        // Manual/custom displayName — only refresh profileName audit field
        nameUpdate.profileName = pushName;
      }
    }

    return this.prisma.contact.update({
      where: { id: existing.id },
      data: {
        lastSeenAt: seenAt,
        ...(phoneE164 && !existing.phoneE164 ? { phoneE164 } : {}),
        ...nameUpdate,
      },
    });
  }
}
