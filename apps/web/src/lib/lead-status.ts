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

/** Spanish labels — same as Contactos commercial editor. */
export const LEAD_STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: 'NEW', label: 'Nuevo' },
  { value: 'IN_PROGRESS', label: 'En conversación' },
  { value: 'INTERESTED', label: 'Interesado' },
  { value: 'QUOTED', label: 'Cotización' },
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
