import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CommercialActivitySource,
  CommercialActivityType,
  Contact,
  HandoffReason,
  LeadStatus,
} from '@prisma/client';
import { UpdateCommercialDto } from './update-commercial.dto';
import { PrismaService } from '../prisma/prisma.service';
import {
  isPersonalWaJid,
  normalizeWaJid,
  phoneE164FromJid,
} from './jid.util';
import {
  commercialUpdateData,
  contactCreatedActivity,
  diffCommercialActivities,
} from './commercial-activity.util';

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

  async listActivities(contactId: string, limit = 50) {
    const existing = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Contacto no encontrado');

    const take = Math.min(Math.max(1, limit || 50), 200);
    return this.prisma.commercialActivity.findMany({
      where: { contactId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async updateCommercial(id: string, dto: UpdateCommercialDto) {
    const existing = await this.prisma.contact.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Contacto no encontrado');

    const data = commercialUpdateData(dto);
    const activities = diffCommercialActivities(
      {
        leadStatus: existing.leadStatus,
        notes: existing.notes,
        tags: existing.tags,
      },
      dto,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.contact.update({ where: { id }, data });
      if (activities.length > 0) {
        await tx.commercialActivity.createMany({
          data: activities.map((a) => ({
            contactId: id,
            type: a.type,
            source: a.source,
            title: a.title,
            description: a.description ?? null,
            metadata: a.metadata ?? undefined,
          })),
        });
      }
    });

    return this.getById(id);
  }

  /** Apply policy-authorized status/tags/handoff and DEEPSEEK activities atomically. */
  async applyCommercialAutomation(
    id: string,
    action: {
      applyStatus?: LeadStatus;
      addTags: string[];
      applyHumanHandoff?: { requiresHumanAttention: true; reason: HandoffReason };
    },
    audit: { intent: string; confidence: number; reason: string },
  ): Promise<{
    appliedStatus: LeadStatus | null;
    appliedTags: string[];
    appliedHumanHandoff: boolean;
  }> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.contact.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Contacto no encontrado');

      // Re-check safety at the write boundary in case the contact changed after preview.
      const statusAllowed =
        action.applyStatus === LeadStatus.INTERESTED &&
        (existing.leadStatus === LeadStatus.NEW ||
          existing.leadStatus === LeadStatus.IN_PROGRESS);
      const appliedStatus = statusAllowed ? LeadStatus.INTERESTED : null;

      const seen = new Set(
        existing.tags.map((tag) => tag.trim().toLocaleLowerCase()),
      );
      const appliedTags: string[] = [];
      for (const tag of action.addTags) {
        const key = tag.trim().toLocaleLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        appliedTags.push(tag);
      }

      const dto: UpdateCommercialDto = {};
      if (appliedStatus) dto.leadStatus = appliedStatus;
      if (appliedTags.length > 0) dto.tags = [...existing.tags, ...appliedTags];

      const data = commercialUpdateData(dto);
      const activities = diffCommercialActivities(
        {
          leadStatus: existing.leadStatus,
          notes: existing.notes,
          tags: existing.tags,
        },
        dto,
        {
          source: CommercialActivitySource.DEEPSEEK,
          statusMetadata: {
            intent: audit.intent,
            confidence: audit.confidence,
            reason: audit.reason,
          },
          tagsMetadata: {
            intent: audit.intent,
            confidence: audit.confidence,
          },
        },
      );

      const handoff = action.applyHumanHandoff;
      const handoffNewlyRequired =
        !!handoff &&
        (!existing.requiresHumanAttention ||
          existing.humanHandoffReason !== handoff.reason);

      if (handoffNewlyRequired && handoff) {
        activities.push({
          type: CommercialActivityType.HUMAN_HANDOFF_REQUESTED,
          source: CommercialActivitySource.DEEPSEEK,
          title: 'Atención humana solicitada',
          description: `Motivo: ${handoff.reason}`,
          metadata: {
            reason: handoff.reason,
            intent: audit.intent,
            confidence: audit.confidence,
          },
        });
      }

      if (activities.length === 0 && !handoffNewlyRequired) {
        return {
          appliedStatus: null,
          appliedTags: [],
          appliedHumanHandoff: false,
        };
      }

      await tx.contact.update({
        where: { id },
        data: {
          ...data,
          ...(handoffNewlyRequired && handoff
            ? {
                requiresHumanAttention: true,
                humanHandoffReason: handoff.reason,
                humanHandoffUpdatedAt: new Date(),
              }
            : {}),
        },
      });
      if (activities.length > 0) {
        await tx.commercialActivity.createMany({
          data: activities.map((activity) => ({
            contactId: id,
            type: activity.type,
            source: activity.source,
            title: activity.title,
            description: activity.description ?? null,
            metadata: activity.metadata ?? undefined,
          })),
        });
      }

      return {
        appliedStatus,
        appliedTags,
        appliedHumanHandoff: handoffNewlyRequired,
      };
    });
  }

  /**
   * Human operator clears commercial attention flag.
   * No-op (no false activity) when attention was not required.
   */
  async resolveHumanHandoff(id: string) {
    const existing = await this.prisma.contact.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Contacto no encontrado');

    if (!existing.requiresHumanAttention) {
      return this.getById(id);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.contact.update({
        where: { id },
        data: {
          requiresHumanAttention: false,
          humanHandoffReason: null,
          humanHandoffUpdatedAt: new Date(),
        },
      });
      await tx.commercialActivity.create({
        data: {
          contactId: id,
          type: CommercialActivityType.HUMAN_HANDOFF_RESOLVED,
          source: CommercialActivitySource.USER,
          title: 'Atención humana resuelta',
          metadata: {
            previousReason: existing.humanHandoffReason,
          },
        },
      });
    });

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
      const createdActivity = contactCreatedActivity();
      return this.prisma.$transaction(async (tx) => {
        const contact = await tx.contact.create({
          data: {
            waJid,
            phoneE164,
            displayName: pushName,
            profileName: pushName,
            firstSeenAt: seenAt,
            lastSeenAt: seenAt,
          },
        });
        await tx.commercialActivity.create({
          data: {
            contactId: contact.id,
            type: createdActivity.type,
            source: createdActivity.source,
            title: createdActivity.title,
          },
        });
        return contact;
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
