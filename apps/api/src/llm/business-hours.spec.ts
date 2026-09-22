import {
  buildHandoffReplyGuidance,
  describeBusinessHours,
  isWithinBusinessHours,
  type BusinessProfile,
} from './business-hours';

/**
 * Build a UTC Instant that corresponds to the given wall-clock time in a
 * fixed-offset zone (no DST). offsetHours is hours east of UTC (e.g. Lima = -5 → pass -5).
 */
function wallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  offsetHours: number,
): Date {
  return new Date(
    Date.UTC(year, month - 1, day, hour - offsetHours, minute, 0, 0),
  );
}

const LIMA_PROFILE: BusinessProfile = {
  businessName: 'DMX 4x4',
  timezone: 'America/Lima',
  businessHoursStart: '08:00',
  businessHoursEnd: '18:00',
};

const NYC_PROFILE: BusinessProfile = {
  businessName: 'Acme Consulting',
  timezone: 'America/New_York',
  businessHoursStart: '09:00',
  businessHoursEnd: '17:00',
};

describe('business-hours A: America/Lima 08:00–18:00', () => {
  // America/Lima is UTC-5 year-round (no DST).
  const cases: Array<{ label: string; hour: number; minute: number; expected: boolean }> = [
    { label: '07:59 OUT', hour: 7, minute: 59, expected: false },
    { label: '08:00 IN', hour: 8, minute: 0, expected: true },
    { label: '12:00 IN', hour: 12, minute: 0, expected: true },
    { label: '17:59 IN', hour: 17, minute: 59, expected: true },
    { label: '18:00 OUT', hour: 18, minute: 0, expected: false },
    { label: '18:01 OUT', hour: 18, minute: 1, expected: false },
  ];

  for (const c of cases) {
    it(c.label, () => {
      const instant = wallClockToUtc(2026, 9, 22, c.hour, c.minute, -5);
      expect(
        isWithinBusinessHours(instant, LIMA_PROFILE.timezone, {
          start: LIMA_PROFILE.businessHoursStart,
          end: LIMA_PROFILE.businessHoursEnd,
        }),
      ).toBe(c.expected);
    });
  }

  it('describeBusinessHours reports profile window', () => {
    const open = describeBusinessHours(
      wallClockToUtc(2026, 9, 22, 10, 0, -5),
      LIMA_PROFILE,
    );
    expect(open).toMatchObject({
      businessName: 'DMX 4x4',
      timezone: 'America/Lima',
      start: '08:00',
      end: '18:00',
      openNow: true,
      localTime: '10:00',
    });
    const closed = describeBusinessHours(
      wallClockToUtc(2026, 9, 22, 19, 0, -5),
      LIMA_PROFILE,
    );
    expect(closed.openNow).toBe(false);
  });

  it('buildHandoffReplyGuidance uses businessName and hours (no Secretaría/Gerencia)', () => {
    const outside = buildHandoffReplyGuidance(
      wallClockToUtc(2026, 9, 22, 20, 0, -5),
      LIMA_PROFILE,
    );
    expect(outside).toContain('el equipo de DMX 4x4');
    expect(outside).toContain('08:00');
    expect(outside).toContain('18:00');
    expect(outside).toContain('America/Lima');
    expect(outside.toLowerCase()).not.toContain('secretaría');
    expect(outside.toLowerCase()).not.toContain('gerencia');
    expect(outside).not.toContain('hora de Lima');
  });
});

describe('business-hours B: America/New_York 09:00–17:00 (EDT UTC-4 on 2026-09-22)', () => {
  // 2026-09-22 is during Eastern Daylight Time (UTC-4).
  const cases: Array<{ label: string; hour: number; minute: number; expected: boolean }> = [
    { label: '08:00 OUT under 09–17 profile', hour: 8, minute: 0, expected: false },
    { label: '08:59 OUT', hour: 8, minute: 59, expected: false },
    { label: '09:00 IN', hour: 9, minute: 0, expected: true },
    { label: '12:00 IN', hour: 12, minute: 0, expected: true },
    { label: '16:59 IN', hour: 16, minute: 59, expected: true },
    { label: '17:00 OUT', hour: 17, minute: 0, expected: false },
  ];

  for (const c of cases) {
    it(c.label, () => {
      const instant = wallClockToUtc(2026, 9, 22, c.hour, c.minute, -4);
      expect(
        isWithinBusinessHours(instant, NYC_PROFILE.timezone, {
          start: NYC_PROFILE.businessHoursStart,
          end: NYC_PROFILE.businessHoursEnd,
        }),
      ).toBe(c.expected);
    });
  }

  it('describeBusinessHours proves 08:00 OUT and 09:00 IN', () => {
    const at8 = describeBusinessHours(
      wallClockToUtc(2026, 9, 22, 8, 0, -4),
      NYC_PROFILE,
    );
    expect(at8.openNow).toBe(false);
    expect(at8.localTime).toBe('08:00');
    const at9 = describeBusinessHours(
      wallClockToUtc(2026, 9, 22, 9, 0, -4),
      NYC_PROFILE,
    );
    expect(at9.openNow).toBe(true);
    expect(at9.localTime).toBe('09:00');
    expect(at9.businessName).toBe('Acme Consulting');
  });

  it('empty businessName → "nuestro equipo"', () => {
    const guidance = buildHandoffReplyGuidance(
      wallClockToUtc(2026, 9, 22, 10, 0, -4),
      { ...NYC_PROFILE, businessName: '' },
    );
    expect(guidance).toContain('nuestro equipo');
    expect(guidance).not.toContain('el equipo de');
  });
});
