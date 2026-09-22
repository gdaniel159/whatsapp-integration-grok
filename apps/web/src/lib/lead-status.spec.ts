import {
  LEAD_STATUS_OPTIONS,
  contactDisplayName,
  formatRelativeLastSeen,
  leadStatusLabel,
  moveContactStatus,
  type LeadStatus,
} from './lead-status';

describe('LEAD_STATUS_OPTIONS labels', () => {
  it('uses the phase-11 Spanish labels', () => {
    const map = Object.fromEntries(
      LEAD_STATUS_OPTIONS.map((o) => [o.value, o.label]),
    );
    expect(map).toEqual({
      NEW: 'Nuevo',
      IN_PROGRESS: 'En seguimiento',
      INTERESTED: 'Interesado',
      QUOTED: 'Cotizado',
      WON: 'Ganado',
      LOST: 'Perdido',
    });
  });

  it('leadStatusLabel resolves known and unknown', () => {
    expect(leadStatusLabel('QUOTED')).toBe('Cotizado');
    expect(leadStatusLabel('IN_PROGRESS')).toBe('En seguimiento');
    expect(leadStatusLabel(undefined)).toBe('Nuevo');
    expect(leadStatusLabel('CUSTOM')).toBe('CUSTOM');
  });
});

describe('moveContactStatus', () => {
  const base = [
    { id: 'a', leadStatus: 'NEW' as LeadStatus, tags: ['x'] },
    { id: 'b', leadStatus: 'INTERESTED' as LeadStatus, tags: ['y'] },
  ];

  it('updates only the target contact status', () => {
    const next = moveContactStatus(base, 'a', 'WON');
    expect(next.find((c) => c.id === 'a')!.leadStatus).toBe('WON');
    expect(next.find((c) => c.id === 'b')!.leadStatus).toBe('INTERESTED');
    expect(next.find((c) => c.id === 'a')!.tags).toEqual(['x']);
  });

  it('returns a new array (immutable)', () => {
    const next = moveContactStatus(base, 'b', 'LOST');
    expect(next).not.toBe(base);
    expect(base[1].leadStatus).toBe('INTERESTED');
    expect(next[1].leadStatus).toBe('LOST');
  });
});

describe('contactDisplayName', () => {
  it('prefers displayName then profileName then phone then jid user-part', () => {
    expect(
      contactDisplayName({
        displayName: 'Ana',
        profileName: 'P',
        phoneE164: '+1',
        waJid: '5199@s.whatsapp.net',
      }),
    ).toBe('Ana');
    expect(
      contactDisplayName({
        displayName: null,
        profileName: 'Perfil',
        phoneE164: '+5199',
        waJid: '5199@s.whatsapp.net',
      }),
    ).toBe('Perfil');
    expect(
      contactDisplayName({
        displayName: '  ',
        profileName: null,
        phoneE164: '+5199111',
        waJid: '5199111@s.whatsapp.net',
      }),
    ).toBe('+5199111');
    expect(
      contactDisplayName({
        displayName: null,
        profileName: null,
        phoneE164: null,
        waJid: '51991112233@s.whatsapp.net',
      }),
    ).toBe('51991112233');
    expect(
      contactDisplayName({
        displayName: null,
        profileName: null,
        phoneE164: null,
        waJid: null,
      }),
    ).toBe('Sin nombre');
  });

  it('never returns full JID as primary when user-part exists', () => {
    const name = contactDisplayName({
      waJid: 'abc@simulator.local',
    });
    expect(name).toBe('abc');
    expect(name).not.toContain('@');
  });
});

describe('formatRelativeLastSeen', () => {
  const now = new Date('2026-09-21T18:00:00.000Z');

  it('formats minutes, hours, days', () => {
    expect(
      formatRelativeLastSeen(new Date('2026-09-21T17:58:00.000Z'), now),
    ).toBe('hace 2 min');
    expect(
      formatRelativeLastSeen(new Date('2026-09-21T16:00:00.000Z'), now),
    ).toBe('hace 2 h');
    expect(
      formatRelativeLastSeen(new Date('2026-09-19T18:00:00.000Z'), now),
    ).toBe('hace 2 d');
  });

  it('handles missing / invalid', () => {
    expect(formatRelativeLastSeen(null, now)).toBe('—');
    expect(formatRelativeLastSeen('not-a-date', now)).toBe('—');
  });

  it('recent moments', () => {
    expect(
      formatRelativeLastSeen(new Date('2026-09-21T17:59:50.000Z'), now),
    ).toBe('hace un momento');
  });
});
