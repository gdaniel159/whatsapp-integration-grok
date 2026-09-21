import { ContactsService } from './contacts.service';

type ContactRow = {
  id: string;
  waJid: string;
  phoneE164: string | null;
  displayName: string | null;
  profileName: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function makeMockPrisma() {
  const store = new Map<string, ContactRow>();
  let seq = 0;

  return {
    store,
    prisma: {
      contact: {
        findUnique: jest.fn(async ({ where }: { where: { waJid: string } }) => {
          return store.get(where.waJid) ?? null;
        }),
        create: jest.fn(async ({ data }: { data: Partial<ContactRow> }) => {
          const row: ContactRow = {
            id: `c${++seq}`,
            waJid: data.waJid!,
            phoneE164: data.phoneE164 ?? null,
            displayName: data.displayName ?? null,
            profileName: data.profileName ?? null,
            firstSeenAt: data.firstSeenAt ?? new Date(),
            lastSeenAt: data.lastSeenAt ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          store.set(row.waJid, row);
          return row;
        }),
        update: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string };
            data: Partial<ContactRow>;
          }) => {
            const existing = [...store.values()].find((c) => c.id === where.id);
            if (!existing) throw new Error('not found');
            Object.assign(existing, data, { updatedAt: new Date() });
            return existing;
          },
        ),
      },
    },
  };
}

describe('ContactsService.upsertFromWaJid', () => {
  it('returns null for groups (no contact)', async () => {
    const { prisma } = makeMockPrisma();
    const svc = new ContactsService(prisma as never);
    expect(await svc.upsertFromWaJid('120363-xxx@g.us')).toBeNull();
    expect(prisma.contact.create).not.toHaveBeenCalled();
  });

  it('creates contact for personal JID and links identity', async () => {
    const { prisma, store } = makeMockPrisma();
    const svc = new ContactsService(prisma as never);
    const c = await svc.upsertFromWaJid('51991112233@s.whatsapp.net', {
      pushName: 'Ana',
      seenAt: new Date('2026-01-01T00:00:00Z'),
    });
    expect(c).not.toBeNull();
    expect(c!.waJid).toBe('51991112233@s.whatsapp.net');
    expect(c!.phoneE164).toBe('+51991112233');
    expect(c!.displayName).toBe('Ana');
    expect(c!.profileName).toBe('Ana');
    expect(store.size).toBe(1);
  });

  it('same waJid is idempotent (no duplicate)', async () => {
    const { prisma, store } = makeMockPrisma();
    const svc = new ContactsService(prisma as never);
    const a = await svc.upsertFromWaJid('51991112233@s.whatsapp.net', {
      pushName: 'Ana',
    });
    const b = await svc.upsertFromWaJid('51991112233@s.whatsapp.net', {
      pushName: 'Ana',
    });
    expect(a!.id).toBe(b!.id);
    expect(store.size).toBe(1);
    expect(prisma.contact.create).toHaveBeenCalledTimes(1);
    expect(prisma.contact.update).toHaveBeenCalled();
  });

  it('device suffix :XX normalizes to same contact', async () => {
    const { prisma, store } = makeMockPrisma();
    const svc = new ContactsService(prisma as never);
    const a = await svc.upsertFromWaJid('51991112233@s.whatsapp.net');
    const b = await svc.upsertFromWaJid('51991112233:55@s.whatsapp.net');
    expect(a!.id).toBe(b!.id);
    expect(store.size).toBe(1);
  });

  it('updates lastSeenAt always; firstSeenAt only on create', async () => {
    const { prisma } = makeMockPrisma();
    const svc = new ContactsService(prisma as never);
    const t1 = new Date('2026-01-01T00:00:00Z');
    const t2 = new Date('2026-02-01T00:00:00Z');
    const a = await svc.upsertFromWaJid('51991112233@s.whatsapp.net', {
      seenAt: t1,
    });
    const b = await svc.upsertFromWaJid('51991112233@s.whatsapp.net', {
      seenAt: t2,
    });
    expect(a!.firstSeenAt).toEqual(t1);
    expect(b!.firstSeenAt).toEqual(t1);
    expect(b!.lastSeenAt).toEqual(t2);
  });

  it('does not overwrite custom displayName when it differs from profileName', async () => {
    const { prisma, store } = makeMockPrisma();
    const svc = new ContactsService(prisma as never);
    await svc.upsertFromWaJid('51991112233@s.whatsapp.net', {
      pushName: 'Ana',
    });
    const row = store.get('51991112233@s.whatsapp.net')!;
    row.displayName = 'Cliente VIP';
    row.profileName = 'Ana';
    const updated = await svc.upsertFromWaJid('51991112233@s.whatsapp.net', {
      pushName: 'Ana Nueva',
    });
    expect(updated!.displayName).toBe('Cliente VIP');
    expect(updated!.profileName).toBe('Ana Nueva');
  });

  it('creates contact for @lid personal JID (no phoneE164)', async () => {
    const { prisma, store } = makeMockPrisma();
    const svc = new ContactsService(prisma as never);
    const c = await svc.upsertFromWaJid('123456789012345@lid', {
      pushName: 'LidUser',
    });
    expect(c).not.toBeNull();
    expect(c!.waJid).toBe('123456789012345@lid');
    expect(c!.phoneE164).toBeNull();
    expect(c!.displayName).toBe('LidUser');
    expect(store.size).toBe(1);
  });

  it('device suffix on @lid is same contact', async () => {
    const { prisma, store } = makeMockPrisma();
    const svc = new ContactsService(prisma as never);
    const a = await svc.upsertFromWaJid('123456789012345@lid');
    const b = await svc.upsertFromWaJid('123456789012345:9@lid');
    expect(a!.id).toBe(b!.id);
    expect(store.size).toBe(1);
  });

  it('creates contact for @simulator.local (phoneE164 null)', async () => {
    const { prisma, store } = makeMockPrisma();
    const svc = new ContactsService(prisma as never);
    const c = await svc.upsertFromWaJid('test-001@simulator.local', {
      pushName: 'Cliente prueba',
    });
    expect(c).not.toBeNull();
    expect(c!.waJid).toBe('test-001@simulator.local');
    expect(c!.phoneE164).toBeNull();
    expect(c!.displayName).toBe('Cliente prueba');
    expect(store.size).toBe(1);
  });

});
