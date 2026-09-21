/**
 * WhatsApp JID helpers — personal chats only (@s.whatsapp.net).
 * Strips device suffixes (:XX) and rejects groups/broadcast/status.
 */

export function normalizeWaJid(jid: string): string | null {
  if (!jid || typeof jid !== 'string') return null;
  const trimmed = jid.trim();
  if (!trimmed) return null;

  const at = trimmed.lastIndexOf('@');
  if (at <= 0) return null;

  const userPart = trimmed.slice(0, at);
  const server = trimmed.slice(at + 1).toLowerCase();

  if (server !== 's.whatsapp.net') return null;

  // Strip device suffix: 51999:12@s.whatsapp.net → 51999@s.whatsapp.net
  const bareUser = userPart.includes(':')
    ? userPart.split(':')[0]
    : userPart;

  if (!bareUser) return null;

  return `${bareUser}@s.whatsapp.net`;
}

export function isPersonalWaJid(jid: string): boolean {
  return normalizeWaJid(jid) !== null;
}

/** Derive +E.164 from personal JID user part when it is digits-only. */
export function phoneE164FromJid(jid: string): string | null {
  const normalized = normalizeWaJid(jid);
  if (!normalized) return null;
  const user = normalized.split('@')[0];
  if (!/^\d+$/.test(user)) return null;
  return `+${user}`;
}
