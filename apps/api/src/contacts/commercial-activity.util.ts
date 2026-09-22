import {
  CommercialActivitySource,
  CommercialActivityType,
  LeadStatus,
  Prisma,
} from '@prisma/client';
import { UpdateCommercialDto } from './update-commercial.dto';

/** Spanish labels — keep in sync with apps/web/src/lib/lead-status.ts */
export const LEAD_STATUS_LABELS_ES: Record<LeadStatus, string> = {
  NEW: 'Nuevo',
  IN_PROGRESS: 'En seguimiento',
  INTERESTED: 'Interesado',
  QUOTED: 'Cotizado',
  WON: 'Ganado',
  LOST: 'Perdido',
};

export function leadStatusLabelEs(status: LeadStatus | string): string {
  return (
    LEAD_STATUS_LABELS_ES[status as LeadStatus] ?? String(status)
  );
}

/** Treat null / undefined / '' as the same empty value. */
export function normalizeNotes(
  notes: string | null | undefined,
): string {
  if (notes == null) return '';
  return notes;
}

export function notesEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return normalizeNotes(a) === normalizeNotes(b);
}

/** SET equality — order ignored. */
export function tagsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((t, i) => t === sb[i]);
}

export function tagsDiff(
  from: string[],
  to: string[],
): { added: string[]; removed: string[] } {
  const fromSet = new Set(from);
  const toSet = new Set(to);
  const added = [...toSet].filter((t) => !fromSet.has(t)).sort();
  const removed = [...fromSet].filter((t) => !toSet.has(t)).sort();
  return { added, removed };
}

export type ActivityDraft = {
  type: CommercialActivityType;
  source: CommercialActivitySource;
  title: string;
  description?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export function contactCreatedActivity(
  source: CommercialActivitySource = CommercialActivitySource.SYSTEM,
): ActivityDraft {
  return {
    type: CommercialActivityType.CONTACT_CREATED,
    source,
    title: 'Contacto creado',
  };
}

export type CommercialSnapshot = {
  leadStatus: LeadStatus;
  notes: string | null;
  tags: string[];
};

export type DiffCommercialActivityOptions = {
  source?: CommercialActivitySource;
  statusMetadata?: Prisma.InputJsonObject;
  tagsMetadata?: Prisma.InputJsonObject;
};

/**
 * Pure diff: build activity drafts for fields present in dto that actually changed.
 * Default source is USER (manual PATCH). Automation passes DEEPSEEK + audit metadata.
 * Omitted dto fields are ignored. Same-value fields produce no activity.
 */
export function diffCommercialActivities(
  existing: CommercialSnapshot,
  dto: UpdateCommercialDto,
  options: DiffCommercialActivityOptions = {},
): ActivityDraft[] {
  const out: ActivityDraft[] = [];
  const source = options.source ?? CommercialActivitySource.USER;

  if (dto.leadStatus !== undefined && dto.leadStatus !== existing.leadStatus) {
    out.push({
      type: CommercialActivityType.STATUS_CHANGED,
      source,
      title: `Estado cambiado a ${leadStatusLabelEs(dto.leadStatus)}`,
      metadata: {
        from: existing.leadStatus,
        to: dto.leadStatus,
        ...(options.statusMetadata ?? {}),
      },
    });
  }

  if (dto.notes !== undefined && !notesEqual(existing.notes, dto.notes)) {
    out.push({
      type: CommercialActivityType.NOTES_UPDATED,
      source,
      title: 'Notas actualizadas',
      // Do NOT store full old/new notes in description
    });
  }

  if (dto.tags !== undefined && !tagsEqual(existing.tags, dto.tags)) {
    const { added, removed } = tagsDiff(existing.tags, dto.tags);
    out.push({
      type: CommercialActivityType.TAGS_UPDATED,
      source,
      title: 'Etiquetas actualizadas',
      metadata: {
        added,
        removed,
        ...(options.tagsMetadata ?? {}),
      },
    });
  }

  return out;
}

/** Build prisma update data from dto (only provided fields). */
export function commercialUpdateData(dto: UpdateCommercialDto): {
  leadStatus?: LeadStatus;
  notes?: string;
  tags?: string[];
} {
  const data: {
    leadStatus?: LeadStatus;
    notes?: string;
    tags?: string[];
  } = {};
  if (dto.leadStatus !== undefined) data.leadStatus = dto.leadStatus;
  if (dto.notes !== undefined) data.notes = dto.notes;
  if (dto.tags !== undefined) data.tags = dto.tags;
  return data;
}
