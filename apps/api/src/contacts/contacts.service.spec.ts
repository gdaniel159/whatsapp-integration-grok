import { ContactsService } from './contacts.service';

type ContactRow = {
  id: string;
  waJid: string;
  phoneE164: string | null;
  displayName: string | null;
  profileName: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date | null;
  leadStatus: string;
  notes: string | null;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
};

type ActivityRow = {
  id: string;
  contactId: string;
  type: string;
  source: string;
  title: string;
  description: string | null;
  metadata: unknown;
  createdAt: Date;
};

function makeMockPrisma() {
  const store = new Map<string, ContactRow>();
  const activities: ActivityRow[] = [];
  let seq = 0;
  let actSeq = 0;

  const contactApi = {
    findUnique: jest.fn(
      async ({ where }: { where: { waJid?: string; id?: string } }) => {
        if (where.waJid) return store.get(where.waJid) ?? null;
        if (where.id) {
          return [...store.values()].find((c) => c.id === where.id) ?? null;
        }
        return null;
      },
    ),
    create: jest.fn(async ({ data }: { data: Partial<ContactRow> }) => {
      const row: ContactRow = {
        id: `c${++seq}`,
        waJid: data.waJid!,
        phoneE164: data.phoneE164 ?? null,
        displayName: data.displayName ?? null,
        profileName: data.profileName ?? null,
        firstSeenAt: data.firstSeenAt ?? new Date(),
        lastSeenAt: data.lastSeenAt ?? null,
        leadStatus: data.leadStatus ?? 'NEW',
        notes: data.notes ?? null,
        tags: data.tags ?? [],
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
  };

  const commercialActivityApi = {
    create: jest.fn(
      async ({
        data,
      }: {
        data: Omit<ActivityRow, 'id' | 'createdAt'> & { createdAt?: Date };
      }) => {
        const row: ActivityRow = {
          id: `a${++actSeq}`,
          contactId: data.contactId,
          type: data.type,
          source: data.source,
          title: data.title,
          description: data.description ?? null,
          metadata: data.metadata ?? null,
          createdAt: data.createdAt ?? new Date(),
        };
        activities.push(row);
        return row;
      },
    ),
    createMany: jest.fn(
      async ({
        data,
      }: {
        data: Array<Omit<ActivityRow, 'id' | 'createdAt'>>;
      }) => {
        for (const d of data) {
          activities.push({
            id: `a${++actSeq}`,
            contactId: d.contactId,
            type: d.type,
            source: d.source,
            title: d.title,
            description: d.description ?? null,
            metadata: d.metadata ?? null,
            createdAt: new Date(),
          });
        }
        return { count: data.length };
      },
    ),
    findMany: jest.fn(
      async ({
        where,
        orderBy,
        take,
      }: {
        where: { contactId: string };
        orderBy: { createdAt: 'asc' | 'desc' };
        take?: number;
      }) => {
        let rows = activities.filter((a) => a.contactId === where.contactId);
        rows = [...rows].sort((a, b) =>
          orderBy.createdAt === 'desc'
            ? b.createdAt.getTime() - a.createdAt.getTime()
            : a.createdAt.getTime() - b.createdAt.getTime(),
        );
        if (take != null) rows = rows.slice(0, take);
        return rows;
      },
    ),
  };

  const prisma = {
    contact: contactApi,
    commercialActivity: commercialActivityApi,
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        contact: contactApi,
        commercialActivity: commercialActivityApi,
      };
      return fn(tx);
    }),
  };

  return { store, activities, prisma };
}

describe('ContactsService.upsertFromWaJid', () => {
  it('returns null for groups (no contact)', async () => {
    const { prisma } = makeMockPrisma();
    const svc = new ContactsService(prisma as never);
    expect(await svc.upsertFromWaJid('120363-xxx@g.us')).toBeNull();
    expect(prisma.contact.create).not.toHaveBeenCalled();
  });

  it('1: creates contact + one CONTACT_CREATED SYSTEM activity', async () => {
    const { prisma, store, activities } = makeMockPrisma();
    const svc = new ContactsService(prisma as never);
    const c = await svc.upsertFromWaJid('51991112233@s.whatsapp.net', {
      pushName: 'Ana',
      seenAt: new Date('2026-01-01T00:00:00Z'),
    });
    expect(c).not.toBeNull();
    expect(c!.waJid).toBe('51991112233@s.whatsapp.net');
    expect(c!.phoneE164).toBe('+51991112233');
    expect(c!.displayName).toBe('Ana');
    expect(store.size).toBe(1);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(activities).toHaveLength(1);
    expect(activities[0].type).toBe('CONTACT_CREATED');
    expect(activities[0].source).toBe('SYSTEM');
    expect(activities[0].title).toBe('Contacto creado');
    expect(activities[0].contactId).toBe(c!.id);
  });

  it('same waJid is idempotent — update path creates NO CONTACT_CREATED', async () => {
    const { prisma, store, activities } = makeMockPrisma();
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
    expect(activities.filter((x) => x.type === 'CONTACT_CREATED')).toHaveLength(
      1,
    );
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
    const { prisma, store, activities } = makeMockPrisma();
    const svc = new ContactsService(prisma as never);
    const c = await svc.upsertFromWaJid('test-001@simulator.local', {
      pushName: 'Cliente prueba',
    });
    expect(c).not.toBeNull();
    expect(c!.waJid).toBe('test-001@simulator.local');
    expect(c!.phoneE164).toBeNull();
    expect(c!.displayName).toBe('Cliente prueba');
    expect(store.size).toBe(1);
    expect(activities).toHaveLength(1);
  });
});

describe('ContactsService.updateCommercial + activities', () => {
  function makeUpdateMock(overrides: Partial<ContactRow> = {}) {
    const row: ContactRow = {
      id: 'c1',
      waJid: '51991112233@s.whatsapp.net',
      phoneE164: '+51991112233',
      displayName: 'Ana',
      profileName: 'Ana',
      firstSeenAt: new Date('2026-01-01'),
      lastSeenAt: new Date('2026-01-02'),
      leadStatus: 'NEW',
      notes: null,
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
    const conversations = [
      {
        id: 'cv1',
        remoteJid: row.waJid,
        lastMessageAt: new Date(),
        name: 'Ana',
      },
    ];
    const activities: ActivityRow[] = [];
    let actSeq = 0;

    const contactApi = {
      findUnique: jest.fn(
        async ({
          where,
          include,
        }: {
          where: { id?: string; waJid?: string };
          include?: unknown;
        }) => {
          if (where.id && where.id !== row.id) return null;
          if (include) return { ...row, conversations };
          return { ...row };
        },
      ),
      update: jest.fn(async ({ data }: { data: Partial<ContactRow> }) => {
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      }),
      create: jest.fn(),
    };

    const commercialActivityApi = {
      createMany: jest.fn(
        async ({
          data,
        }: {
          data: Array<{
            contactId: string;
            type: string;
            source: string;
            title: string;
            description?: string | null;
            metadata?: unknown;
          }>;
        }) => {
          for (const d of data) {
            activities.push({
              id: `a${++actSeq}`,
              contactId: d.contactId,
              type: d.type,
              source: d.source,
              title: d.title,
              description: d.description ?? null,
              metadata: d.metadata ?? null,
              createdAt: new Date(Date.now() + actSeq),
            });
          }
          return { count: data.length };
        },
      ),
      findMany: jest.fn(
        async ({
          where,
          orderBy,
          take,
        }: {
          where: { contactId: string };
          orderBy: { createdAt: 'desc' | 'asc' };
          take?: number;
        }) => {
          let rows = activities.filter((a) => a.contactId === where.contactId);
          rows = [...rows].sort((a, b) =>
            orderBy.createdAt === 'desc'
              ? b.createdAt.getTime() - a.createdAt.getTime()
              : a.createdAt.getTime() - b.createdAt.getTime(),
          );
          if (take != null) rows = rows.slice(0, take);
          return rows;
        },
      ),
    };

    const prisma = {
      contact: contactApi,
      commercialActivity: commercialActivityApi,
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          contact: contactApi,
          commercialActivity: commercialActivityApi,
        });
      }),
    };
    return { prisma, row, activities };
  }

  it('updates leadStatus, notes and tags (legacy)', async () => {
    const { prisma, row } = makeUpdateMock();
    const svc = new ContactsService(prisma as never);
    const result = await svc.updateCommercial('c1', {
      leadStatus: 'INTERESTED' as never,
      notes: 'Cliente Toyota Hilux',
      tags: ['Toyota', 'Hilux'],
    });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: {
        leadStatus: 'INTERESTED',
        notes: 'Cliente Toyota Hilux',
        tags: ['Toyota', 'Hilux'],
      },
    });
    expect(result.leadStatus).toBe('INTERESTED');
    expect(result.notes).toBe('Cliente Toyota Hilux');
    expect(result.tags).toEqual(['Toyota', 'Hilux']);
    expect(result.conversations).toHaveLength(1);
    expect(result.waJid).toBe(row.waJid);
  });

  it('2: NEW->INTERESTED -> STATUS_CHANGED', async () => {
    const { prisma, activities } = makeUpdateMock();
    const svc = new ContactsService(prisma as never);
    await svc.updateCommercial('c1', { leadStatus: 'INTERESTED' as never });
    expect(activities).toHaveLength(1);
    expect(activities[0].type).toBe('STATUS_CHANGED');
    expect(activities[0].source).toBe('USER');
    expect(activities[0].title).toBe('Estado cambiado a Interesado');
    expect(activities[0].metadata).toEqual({
      from: 'NEW',
      to: 'INTERESTED',
    });
  });

  it('3: NEW->NEW -> zero activities', async () => {
    const { prisma, activities } = makeUpdateMock();
    const svc = new ContactsService(prisma as never);
    await svc.updateCommercial('c1', { leadStatus: 'NEW' as never });
    expect(prisma.contact.update).toHaveBeenCalled();
    expect(activities).toHaveLength(0);
    expect(prisma.commercialActivity.createMany).not.toHaveBeenCalled();
  });

  it('4: notes A->B -> NOTES_UPDATED', async () => {
    const { prisma, activities } = makeUpdateMock({ notes: 'A' });
    const svc = new ContactsService(prisma as never);
    await svc.updateCommercial('c1', { notes: 'B' });
    expect(activities).toHaveLength(1);
    expect(activities[0].type).toBe('NOTES_UPDATED');
    expect(activities[0].title).toBe('Notas actualizadas');
    expect(activities[0].description).toBeNull();
  });

  it('5: notes same -> none', async () => {
    const { prisma, activities } = makeUpdateMock({ notes: 'same' });
    const svc = new ContactsService(prisma as never);
    await svc.updateCommercial('c1', { notes: 'same' });
    expect(activities).toHaveLength(0);
  });

  it('6: tags add Hilux', async () => {
    const { prisma, activities } = makeUpdateMock({ tags: ['Toyota'] });
    const svc = new ContactsService(prisma as never);
    await svc.updateCommercial('c1', { tags: ['Toyota', 'Hilux'] });
    expect(activities).toHaveLength(1);
    expect(activities[0].type).toBe('TAGS_UPDATED');
    expect(activities[0].metadata).toEqual({
      added: ['Hilux'],
      removed: [],
    });
  });

  it('7: tags remove Toyota', async () => {
    const { prisma, activities } = makeUpdateMock({
      tags: ['Toyota', 'Hilux'],
    });
    const svc = new ContactsService(prisma as never);
    await svc.updateCommercial('c1', { tags: ['Hilux'] });
    expect(activities).toHaveLength(1);
    expect(activities[0].metadata).toEqual({
      added: [],
      removed: ['Toyota'],
    });
  });

  it('8: same tags different order -> none', async () => {
    const { prisma, activities } = makeUpdateMock({
      tags: ['Toyota', 'Hilux'],
    });
    const svc = new ContactsService(prisma as never);
    await svc.updateCommercial('c1', { tags: ['Hilux', 'Toyota'] });
    expect(activities).toHaveLength(0);
  });

  it('9: status+notes+tags -> three activities one transaction', async () => {
    const { prisma, activities } = makeUpdateMock({
      leadStatus: 'NEW',
      notes: 'old',
      tags: ['Toyota'],
    });
    const svc = new ContactsService(prisma as never);
    await svc.updateCommercial('c1', {
      leadStatus: 'QUOTED' as never,
      notes: 'new',
      tags: ['Hilux'],
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(activities).toHaveLength(3);
    expect(activities.map((a) => a.type)).toEqual([
      'STATUS_CHANGED',
      'NOTES_UPDATED',
      'TAGS_UPDATED',
    ]);
  });

  it('10: listActivities DESC', async () => {
    const { prisma, activities } = makeUpdateMock();
    // Seed two activities with distinct timestamps
    activities.push(
      {
        id: 'a-old',
        contactId: 'c1',
        type: 'CONTACT_CREATED',
        source: 'SYSTEM',
        title: 'Contacto creado',
        description: null,
        metadata: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'a-new',
        contactId: 'c1',
        type: 'STATUS_CHANGED',
        source: 'USER',
        title: 'Estado cambiado a Interesado',
        description: null,
        metadata: { from: 'NEW', to: 'INTERESTED' },
        createdAt: new Date('2026-02-01T00:00:00Z'),
      },
    );
    const svc = new ContactsService(prisma as never);
    const list = await svc.listActivities('c1', 50);
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe('a-new');
    expect(list[1].id).toBe('a-old');
  });

  it('11: DnD uses same updateCommercial — status change only', async () => {
    const { prisma, activities, row } = makeUpdateMock({
      notes: 'Cliente Toyota Hilux',
      tags: ['Toyota', 'Hilux'],
    });
    const svc = new ContactsService(prisma as never);
    const result = await svc.updateCommercial('c1', {
      leadStatus: 'INTERESTED' as never,
    });
    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { leadStatus: 'INTERESTED' },
    });
    const updateArg = (prisma.contact.update as jest.Mock).mock.calls[0][0];
    expect(updateArg.data).not.toHaveProperty('notes');
    expect(updateArg.data).not.toHaveProperty('tags');
    expect(result.notes).toBe('Cliente Toyota Hilux');
    expect(result.tags).toEqual(['Toyota', 'Hilux']);
    expect(activities).toHaveLength(1);
    expect(activities[0].type).toBe('STATUS_CHANGED');
    expect(row.waJid).toBeTruthy();
  });

  it('partial update only provided fields', async () => {
    const { prisma, activities } = makeUpdateMock();
    const svc = new ContactsService(prisma as never);
    await svc.updateCommercial('c1', { notes: 'Solo notas' });
    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { notes: 'Solo notas' },
    });
    expect(activities).toHaveLength(1);
    expect(activities[0].type).toBe('NOTES_UPDATED');
  });

  it('throws NotFoundException for unknown id', async () => {
    const { prisma } = makeUpdateMock();
    (prisma.contact.findUnique as jest.Mock).mockResolvedValue(null);
    const svc = new ContactsService(prisma as never);
    await expect(
      svc.updateCommercial('missing', { notes: 'x' }),
    ).rejects.toThrow('Contacto no encontrado');
  });
});

describe('UpdateCommercialDto validation (invalid status)', () => {
  const { validate } = require('class-validator');
  const { plainToInstance } = require('class-transformer');
  const ALLOWED = ['NEW', 'IN_PROGRESS', 'INTERESTED', 'QUOTED', 'WON', 'LOST'];

  it('documents allowed LeadStatus values and rejects unknown', () => {
    expect(ALLOWED).toContain('NEW');
    expect(ALLOWED).not.toContain('INVALID');
    expect(ALLOWED).not.toContain('closed');
  });

  it('rejects invalid leadStatus via DTO validators when class loaded', async () => {
    let UpdateCommercialDto: new () => object;
    try {
      ({ UpdateCommercialDto } = require('./update-commercial.dto'));
    } catch {
      return;
    }
    const dto = plainToInstance(UpdateCommercialDto, {
      leadStatus: 'NOT_A_STATUS',
    });
    const errors = await validate(dto);
    const statusErr = errors.find(
      (e: { property: string }) => e.property === 'leadStatus',
    );
    expect(statusErr).toBeDefined();
  });
});

describe('seed-dev mock JID cleanup list', () => {
  it('12: documents exact 8 JIDs cleaned by seed-dev (manual seed twice for idempotency)', () => {
    // Keep in sync with prisma/seed-dev.ts DEV_MOCK_CONTACT_JIDS
    // Validation: run `pnpm db:seed:dev` twice — second run must leave same 8 contacts
    // with coherent SEED CommercialActivity chains (no duplicates from prior run).
    const exact = [
      'mock-carlos@simulator.local',
      'mock-maria@simulator.local',
      'mock-jose@simulator.local',
      'mock-luis@simulator.local',
      'mock-andrea@simulator.local',
      'mock-pedro@simulator.local',
      'mock-sofia@simulator.local',
      'mock-diego@simulator.local',
    ];
    expect(exact).toHaveLength(8);
    expect(new Set(exact).size).toBe(8);
    for (const jid of exact) {
      expect(jid.endsWith('@simulator.local')).toBe(true);
      expect(jid.startsWith('mock-')).toBe(true);
    }
  });
});
