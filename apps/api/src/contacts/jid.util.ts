/**
 * WhatsApp JID helpers for 1:1 chats.
 * Accepts phone users (@s.whatsapp.net) and Linked ID users (@lid).
 * Strips device suffixes (:XX). Rejects groups/broadcast/status/newsletter.
 */

const PERSONAL_SERVERS = new Set(['s.whatsapp.net', 'lid']);

export function normalizeWaJid(jid: string): string | null {
  if (!jid || typeof jid !== 'string') return null;
  const trimmed = jid.trim();
  if (!trimmed) return null;

  const at = trimmed.lastIndexOf('@');
  if (at <= 0) return null;

  const userPart = trimmed.slice(0, at);
  const server = trimmed.slice(at + 1).toLowerCase();

  if (!PERSONAL_SERVERS.has(server)) return null;

  // Strip device suffix: user:12@server → user@server
  const bareUser = userPart.includes(':') ? userPart.split(':')[0] : userPart;
  if (!bareUser) return null;

  return `${bareUser}@${server}`;
}

export function isPersonalWaJid(jid: string): boolean {
  return normalizeWaJid(jid) !== null;
}

export function isLidJid(jid: string): boolean {
  const n = normalizeWaJid(jid);
  return !!n && n.endsWith('@lid');
}

/** Derive +E.164 from phone JID user part when digits-only. Null for @lid. */
export function phoneE164FromJid(jid: string): string | null {
  const normalized = normalizeWaJid(jid);
  if (!normalized || !normalized.endsWith('@s.whatsapp.net')) return null;
  const user = normalized.split('@')[0];
  if (!/^\d+$/.test(user)) return null;
  return `+${user}`;
}
