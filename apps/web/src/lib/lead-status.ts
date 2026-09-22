export type LeadStatus =
  | 'NEW'
  | 'IN_PROGRESS'
  | 'INTERESTED'
  | 'QUOTED'
  | 'WON'
  | 'LOST';

export const LEAD_STATUSES: LeadStatus[] = [
  'NEW',
  'IN_PROGRESS',
  'INTERESTED',
  'QUOTED',
  'WON',
  'LOST',
];

/** Spanish labels — shared by Contactos + Pipeline. */
export const LEAD_STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: 'NEW', label: 'Nuevo' },
  { value: 'IN_PROGRESS', label: 'En seguimiento' },
  { value: 'INTERESTED', label: 'Interesado' },
  { value: 'QUOTED', label: 'Cotizado' },
  { value: 'WON', label: 'Ganado' },
  { value: 'LOST', label: 'Perdido' },
];

export function leadStatusLabel(status: LeadStatus | string | undefined): string {
  if (!status) return LEAD_STATUS_OPTIONS[0].label;
  return (
    LEAD_STATUS_OPTIONS.find((o) => o.value === status)?.label || String(status)
  );
}

/**
 * Pure optimistic helper: set leadStatus on one contact by id.
 * Returns a new array; contact appears with exactly one status.
 */
export function moveContactStatus<T extends { id: string; leadStatus?: LeadStatus }>(
  contacts: T[],
  id: string,
  nextStatus: LeadStatus,
): T[] {
  return contacts.map((c) =>
    c.id === id ? { ...c, leadStatus: nextStatus } : c,
  );
}

/** Primary card/sheet name — never full JID. */
export function contactDisplayName(c: {
  displayName?: string | null;
  profileName?: string | null;
  phoneE164?: string | null;
  waJid?: string | null;
}): string {
  const jidUser =
    c.waJid && c.waJid.includes('@') ? c.waJid.split('@')[0] : c.waJid || '';
  return (
    (c.displayName && c.displayName.trim()) ||
    (c.profileName && c.profileName.trim()) ||
    (c.phoneE164 && c.phoneE164.trim()) ||
    jidUser ||
    'Sin nombre'
  );
}

/**
 * Relative Spanish last-seen label, e.g. "hace 2 h", "hace 5 min".
 * `now` injectable for tests.
 */
export function formatRelativeLastSeen(
  value: string | Date | null | undefined,
  now: Date = new Date(),
): string {
  if (!value) return '—';
  const then = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(then.getTime())) return '—';

  const diffMs = Math.max(0, now.getTime() - then.getTime());
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'hace un momento';
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days} d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} mes${months === 1 ? '' : 'es'}`;
  const years = Math.floor(days / 365);
  return `hace ${years} a`;
}
