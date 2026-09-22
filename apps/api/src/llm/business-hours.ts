/** Business-hours helpers driven by BusinessProfile (BotSettings), not hardcoded locales. */

export type BusinessHoursWindow = {
  start: string; // HH:mm inclusive
  end: string; // HH:mm exclusive (half-open)
};

/** Business configuration loaded from BotSettings singleton. */
export type BusinessProfile = {
  businessName: string;
  timezone: string;
  businessHoursStart: string;
  businessHoursEnd: string;
};

/** Neutral platform defaults — NOT DMX / Lima / 08–18. */
export const PLATFORM_DEFAULT_BUSINESS_PROFILE: BusinessProfile = {
  businessName: '',
  timezone: 'UTC',
  businessHoursStart: '09:00',
  businessHoursEnd: '17:00',
};

export function businessProfileFromSettings(
  settings: Partial<BusinessProfile> | null | undefined,
): BusinessProfile {
  return {
    businessName: (settings?.businessName ?? '').trim(),
    timezone: settings?.timezone?.trim() || PLATFORM_DEFAULT_BUSINESS_PROFILE.timezone,
    businessHoursStart:
      settings?.businessHoursStart?.trim() ||
      PLATFORM_DEFAULT_BUSINESS_PROFILE.businessHoursStart,
    businessHoursEnd:
      settings?.businessHoursEnd?.trim() ||
      PLATFORM_DEFAULT_BUSINESS_PROFILE.businessHoursEnd,
  };
}

function parseHhMm(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return 0;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return 0;
  }
  return hour * 60 + minute;
}

function minutesSinceMidnightInZone(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

export function formatLocalTimeHhMm(date: Date, timezone: string): string {
  const minutes = minutesSinceMidnightInZone(date, timezone);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Half-open window [start, end) in the given IANA timezone. No weekday/holiday rules yet. */
export function isWithinBusinessHours(
  now: Date,
  timezone: string,
  window: BusinessHoursWindow,
): boolean {
  const minutes = minutesSinceMidnightInZone(now, timezone);
  const start = parseHhMm(window.start);
  const end = parseHhMm(window.end);
  return minutes >= start && minutes < end;
}

export type BusinessHoursDescription = {
  businessName: string;
  timezone: string;
  start: string;
  end: string;
  openNow: boolean;
  localTime: string;
};

export function describeBusinessHours(
  now: Date = new Date(),
  profile: BusinessProfile = PLATFORM_DEFAULT_BUSINESS_PROFILE,
): BusinessHoursDescription {
  const window = {
    start: profile.businessHoursStart,
    end: profile.businessHoursEnd,
  };
  return {
    businessName: profile.businessName,
    timezone: profile.timezone,
    start: profile.businessHoursStart,
    end: profile.businessHoursEnd,
    openNow: isWithinBusinessHours(now, profile.timezone, window),
    localTime: formatLocalTimeHhMm(now, profile.timezone),
  };
}

function teamPhrase(profile: BusinessProfile): string {
  const name = profile.businessName.trim();
  return name ? `el equipo de ${name}` : 'nuestro equipo';
}

/** Short Spanish note for conversational auto-reply when human handoff is required. */
export function buildHandoffReplyGuidance(
  now: Date = new Date(),
  profile: BusinessProfile = PLATFORM_DEFAULT_BUSINESS_PROFILE,
): string {
  const team = teamPhrase(profile);
  const open = isWithinBusinessHours(now, profile.timezone, {
    start: profile.businessHoursStart,
    end: profile.businessHoursEnd,
  });
  if (open) {
    return (
      'POLÍTICA DE HANDOFF (horario comercial abierto): indica con naturalidad que ' +
      `${team} revisará la solicitud. No prometas respuesta inmediata. ` +
      'NUNCA inventes, estimes ni confirmes precios, descuentos, disponibilidad u otras condiciones comerciales.'
    );
  }
  return (
    'POLÍTICA DE HANDOFF (fuera de horario): indica con naturalidad que ' +
    `${team} atiende de ${profile.businessHoursStart} a ${profile.businessHoursEnd} ` +
    `(zona ${profile.timezone}). No prometas una hora exacta de devolución de llamada. ` +
    'NUNCA inventes, estimes ni confirmes precios, descuentos, disponibilidad u otras condiciones comerciales.'
  );
}
