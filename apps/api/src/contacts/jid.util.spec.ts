import {
  isPersonalWaJid,
  normalizeWaJid,
  phoneE164FromJid,
} from './jid.util';

describe('jid.util', () => {
  describe('normalizeWaJid', () => {
    it('keeps personal bare JID', () => {
      expect(normalizeWaJid('51999999999@s.whatsapp.net')).toBe(
        '51999999999@s.whatsapp.net',
      );
    });

    it('strips device suffix :XX to same identity', () => {
      expect(normalizeWaJid('51999999999:12@s.whatsapp.net')).toBe(
        '51999999999@s.whatsapp.net',
      );
      expect(normalizeWaJid('51999999999:99@s.whatsapp.net')).toBe(
        normalizeWaJid('51999999999@s.whatsapp.net'),
      );
    });

    it('rejects groups, broadcast, status', () => {
      expect(normalizeWaJid('120363@g.us')).toBeNull();
      expect(normalizeWaJid('status@broadcast')).toBeNull();
      expect(normalizeWaJid('xyz@broadcast')).toBeNull();
      expect(normalizeWaJid('')).toBeNull();
    });
  });

  describe('isPersonalWaJid', () => {
    it('true for personal, false for groups', () => {
      expect(isPersonalWaJid('5199@s.whatsapp.net')).toBe(true);
      expect(isPersonalWaJid('5199:1@s.whatsapp.net')).toBe(true);
      expect(isPersonalWaJid('120363@g.us')).toBe(false);
    });
  });

  describe('phoneE164FromJid', () => {
    it('prefixes + for digit-only user part', () => {
      expect(phoneE164FromJid('51999999999@s.whatsapp.net')).toBe(
        '+51999999999',
      );
      expect(phoneE164FromJid('51999999999:3@s.whatsapp.net')).toBe(
        '+51999999999',
      );
    });

    it('null for non-digit or non-personal', () => {
      expect(phoneE164FromJid('120363@g.us')).toBeNull();
    });
  });
});
