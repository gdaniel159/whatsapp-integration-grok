import { Injectable, NotFoundException } from '@nestjs/common';
import { Contact } from '@prisma/client';
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
          select: { id: true },
          take: 1,
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!contact) throw new NotFoundException('Contacto no encontrado');
    const { conversations, ...rest } = contact;
    return {
      ...rest,
      conversationId: conversations[0]?.id ?? null,
    };
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
