import {
  isLidJid,
  isPersonalWaJid,
  isSimulatorJid,
  normalizeWaJid,
  phoneE164FromJid,
} from './jid.util';

describe('jid.util', () => {
  describe('normalizeWaJid', () => {
    it('keeps personal bare phone JID', () => {
      expect(normalizeWaJid('51999999999@s.whatsapp.net')).toBe(
        '51999999999@s.whatsapp.net',
      );
    });

    it('strips device suffix :XX on phone JID', () => {
      expect(normalizeWaJid('51999999999:12@s.whatsapp.net')).toBe(
        '51999999999@s.whatsapp.net',
      );
      expect(normalizeWaJid('51999999999:99@s.whatsapp.net')).toBe(
        normalizeWaJid('51999999999@s.whatsapp.net'),
      );
    });

    it('accepts @lid and strips device suffix', () => {
      expect(normalizeWaJid('123456789012345@lid')).toBe(
        '123456789012345@lid',
      );
      expect(normalizeWaJid('123456789012345:7@lid')).toBe(
        '123456789012345@lid',
      );
    });

    it('accepts @simulator.local and strips device suffix', () => {
      expect(normalizeWaJid('test-001@simulator.local')).toBe(
        'test-001@simulator.local',
      );
      expect(normalizeWaJid('test-001:3@simulator.local')).toBe(
        'test-001@simulator.local',
      );
    });

    it('rejects groups, broadcast, status, newsletter', () => {
      expect(normalizeWaJid('120363@g.us')).toBeNull();
      expect(normalizeWaJid('status@broadcast')).toBeNull();
      expect(normalizeWaJid('xyz@broadcast')).toBeNull();
      expect(normalizeWaJid('123@newsletter')).toBeNull();
      expect(normalizeWaJid('')).toBeNull();
    });
  });

  describe('isPersonalWaJid', () => {
    it('true for phone, lid, simulator; false for groups', () => {
      expect(isPersonalWaJid('5199@s.whatsapp.net')).toBe(true);
      expect(isPersonalWaJid('5199:1@s.whatsapp.net')).toBe(true);
      expect(isPersonalWaJid('999@lid')).toBe(true);
      expect(isPersonalWaJid('999:2@lid')).toBe(true);
      expect(isPersonalWaJid('test-001@simulator.local')).toBe(true);
      expect(isPersonalWaJid('120363@g.us')).toBe(false);
    });
  });

  describe('isSimulatorJid', () => {
    it('detects simulator only', () => {
      expect(isSimulatorJid('test-001@simulator.local')).toBe(true);
      expect(isSimulatorJid('test-001:1@simulator.local')).toBe(true);
      expect(isSimulatorJid('5199@s.whatsapp.net')).toBe(false);
      expect(isSimulatorJid('999@lid')).toBe(false);
      expect(isSimulatorJid('120363@g.us')).toBe(false);
    });
  });

  describe('isLidJid', () => {
    it('detects lid only', () => {
      expect(isLidJid('999@lid')).toBe(true);
      expect(isLidJid('5199@s.whatsapp.net')).toBe(false);
      expect(isLidJid('test-001@simulator.local')).toBe(false);
      expect(isLidJid('120363@g.us')).toBe(false);
    });
  });

  describe('phoneE164FromJid', () => {
    it('prefixes + for digit-only phone user part', () => {
      expect(phoneE164FromJid('51999999999@s.whatsapp.net')).toBe(
        '+51999999999',
      );
      expect(phoneE164FromJid('51999999999:3@s.whatsapp.net')).toBe(
        '+51999999999',
      );
    });

    it('null for lid, simulator, or non-personal', () => {
      expect(phoneE164FromJid('123456789012345@lid')).toBeNull();
      expect(phoneE164FromJid('test-001@simulator.local')).toBeNull();
      expect(phoneE164FromJid('120363@g.us')).toBeNull();
    });
  });
});
