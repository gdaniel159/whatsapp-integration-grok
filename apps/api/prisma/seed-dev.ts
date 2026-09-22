/**
 * DEV-only commercial mock contacts.
 * Idempotent: deletes ONLY the exact 8 simulator JIDs below (and their
 * conversations/messages/activities), then recreates them. Never touches other contacts.
 */
import {
  CommercialActivitySource,
  CommercialActivityType,
  LeadStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';

const prisma = new PrismaClient();

/** Exact JIDs cleaned + recreated by seed-dev (exported for tests). */
export const DEV_MOCK_CONTACT_JIDS = [
  'mock-carlos@simulator.local',
  'mock-maria@simulator.local',
  'mock-jose@simulator.local',
  'mock-luis@simulator.local',
  'mock-andrea@simulator.local',
  'mock-pedro@simulator.local',
  'mock-sofia@simulator.local',
  'mock-diego@simulator.local',
] as const;

type SeedActivity = {
  type: CommercialActivityType;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
  /** Minutes before `now` — larger = older. */
  minutesAgo: number;
};

type MockScenario = {
  waJid: (typeof DEV_MOCK_CONTACT_JIDS)[number];
  displayName: string;
  leadStatus: LeadStatus;
  notes: string;
  tags: string[];
  messages: Array<{ direction: 'IN' | 'OUT'; body: string; hoursAgo: number }>;
  activities: SeedActivity[];
};

const SCENARIOS: MockScenario[] = [
  {
    waJid: 'mock-carlos@simulator.local',
    displayName: 'Carlos Mendoza',
    leadStatus: LeadStatus.NEW,
    notes: 'Preguntó por accesorios Toyota Hilux. Primer contacto.',
    tags: ['Toyota', 'Hilux', 'nuevo'],
    messages: [
      { direction: 'IN', body: 'Hola, venden accesorios para Hilux?', hoursAgo: 2 },
      { direction: 'OUT', body: '¡Hola Carlos! Sí, tenemos parachoques, estribos y racks para Hilux.', hoursAgo: 1.8 },
      { direction: 'IN', body: 'Ok gracias, luego les escribo', hoursAgo: 1.5 },
    ],
    activities: [
      {
        type: CommercialActivityType.CONTACT_CREATED,
        title: 'Contacto creado',
        minutesAgo: 130,
      },
    ],
  },
  {
    waJid: 'mock-maria@simulator.local',
    displayName: 'María López',
    leadStatus: LeadStatus.IN_PROGRESS,
    notes: 'En conversación por kit de protección Ford Ranger.',
    tags: ['Ford', 'Ranger', 'Protección'],
    messages: [
      { direction: 'IN', body: 'Buenas, necesito protección inferior para Ranger 2022', hoursAgo: 26 },
      { direction: 'OUT', body: 'Claro María. Tenemos kit completo de protección para Ranger.', hoursAgo: 25 },
      { direction: 'IN', body: 'Me puedes pasar fotos y medidas?', hoursAgo: 24 },
      { direction: 'OUT', body: 'Te envío el catálogo en un momento.', hoursAgo: 23 },
    ],
    activities: [
      {
        type: CommercialActivityType.CONTACT_CREATED,
        title: 'Contacto creado',
        minutesAgo: 1600,
      },
      {
        type: CommercialActivityType.NOTES_UPDATED,
        title: 'Notas actualizadas',
        minutesAgo: 1550,
      },
      {
        type: CommercialActivityType.TAGS_UPDATED,
        title: 'Etiquetas actualizadas',
        metadata: {
          added: ['Ford', 'Ranger', 'Protección'],
          removed: [],
        },
        minutesAgo: 1520,
      },
      {
        type: CommercialActivityType.STATUS_CHANGED,
        title: 'Estado cambiado a En seguimiento',
        metadata: { from: 'NEW', to: 'IN_PROGRESS' },
        minutesAgo: 1400,
      },
    ],
  },
  {
    waJid: 'mock-jose@simulator.local',
    displayName: 'José Ramírez',
    leadStatus: LeadStatus.INTERESTED,
    notes: 'Muy interesado en estribos laterales Jeep Wrangler.',
    tags: ['Jeep', 'Wrangler', 'Estribos'],
    messages: [
      { direction: 'IN', body: 'Quiero estribos para Wrangler JL', hoursAgo: 50 },
      { direction: 'OUT', body: 'Tenemos estribos aluminio y acero para JL. ¿Cuál prefieres?', hoursAgo: 49 },
      { direction: 'IN', body: 'Aluminio, para uso diario en ciudad', hoursAgo: 48 },
      { direction: 'OUT', body: 'Perfecto. El set aluminio está en stock.', hoursAgo: 47 },
      { direction: 'IN', body: 'Genial, me interesa. ¿Cuánto sale instalado?', hoursAgo: 30 },
    ],
    activities: [
      {
        type: CommercialActivityType.CONTACT_CREATED,
        title: 'Contacto creado',
        minutesAgo: 3100,
      },
      {
        type: CommercialActivityType.STATUS_CHANGED,
        title: 'Estado cambiado a En seguimiento',
        metadata: { from: 'NEW', to: 'IN_PROGRESS' },
        minutesAgo: 3000,
      },
      {
        type: CommercialActivityType.TAGS_UPDATED,
        title: 'Etiquetas actualizadas',
        metadata: {
          added: ['Jeep', 'Wrangler', 'Estribos'],
          removed: [],
        },
        minutesAgo: 2900,
      },
      {
        type: CommercialActivityType.STATUS_CHANGED,
        title: 'Estado cambiado a Interesado',
        metadata: { from: 'IN_PROGRESS', to: 'INTERESTED' },
        minutesAgo: 2000,
      },
    ],
  },
  {
    waJid: 'mock-luis@simulator.local',
    displayName: 'Luis Fernández',
    leadStatus: LeadStatus.QUOTED,
    notes: 'Cotización enviada: parachoque delantero Hilux + instalación.',
    tags: ['Toyota', 'Hilux', 'Parachoque', 'cotización'],
    messages: [
      { direction: 'IN', body: 'Necesito cotización de parachoque delantero Hilux 2020', hoursAgo: 72 },
      { direction: 'OUT', body: 'Luis, te armo la cotización con instalación incluida.', hoursAgo: 71 },
      { direction: 'OUT', body: 'Cotización: Parachoque S/ 2,450 + instalación S/ 180. Válida 7 días.', hoursAgo: 70 },
      { direction: 'IN', body: 'Recibido, lo reviso con mi jefe', hoursAgo: 68 },
    ],
    activities: [
      {
        type: CommercialActivityType.CONTACT_CREATED,
        title: 'Contacto creado',
        minutesAgo: 4500,
      },
      {
        type: CommercialActivityType.STATUS_CHANGED,
        title: 'Estado cambiado a En seguimiento',
        metadata: { from: 'NEW', to: 'IN_PROGRESS' },
        minutesAgo: 4400,
      },
      {
        type: CommercialActivityType.STATUS_CHANGED,
        title: 'Estado cambiado a Interesado',
        metadata: { from: 'IN_PROGRESS', to: 'INTERESTED' },
        minutesAgo: 4300,
      },
      {
        type: CommercialActivityType.NOTES_UPDATED,
        title: 'Notas actualizadas',
        minutesAgo: 4250,
      },
      {
        type: CommercialActivityType.STATUS_CHANGED,
        title: 'Estado cambiado a Cotizado',
        metadata: { from: 'INTERESTED', to: 'QUOTED' },
        minutesAgo: 4200,
      },
    ],
  },
  {
    waJid: 'mock-andrea@simulator.local',
    displayName: 'Andrea Vargas',
    leadStatus: LeadStatus.WON,
    notes: 'Venta cerrada: estribos Ford Ranger. Entrega programada.',
    tags: ['Ford', 'Ranger', 'Estribos', 'ganado'],
    messages: [
      { direction: 'IN', body: 'Confirmo la compra de los estribos Ranger', hoursAgo: 96 },
      { direction: 'OUT', body: '¡Excelente Andrea! Reservamos el set. ¿Retiro o envío?', hoursAgo: 95 },
      { direction: 'IN', body: 'Retiro en taller el viernes', hoursAgo: 94 },
      { direction: 'OUT', body: 'Listo, te esperamos el viernes de 9 a 13.', hoursAgo: 93 },
    ],
    activities: [
      {
        type: CommercialActivityType.CONTACT_CREATED,
        title: 'Contacto creado',
        minutesAgo: 6000,
      },
      {
        type: CommercialActivityType.STATUS_CHANGED,
        title: 'Estado cambiado a En seguimiento',
        metadata: { from: 'NEW', to: 'IN_PROGRESS' },
        minutesAgo: 5800,
      },
      {
        type: CommercialActivityType.STATUS_CHANGED,
        title: 'Estado cambiado a Interesado',
        metadata: { from: 'IN_PROGRESS', to: 'INTERESTED' },
        minutesAgo: 5600,
      },
      {
        type: CommercialActivityType.STATUS_CHANGED,
        title: 'Estado cambiado a Cotizado',
        metadata: { from: 'INTERESTED', to: 'QUOTED' },
        minutesAgo: 5400,
      },
      {
        type: CommercialActivityType.TAGS_UPDATED,
        title: 'Etiquetas actualizadas',
        metadata: { added: ['ganado'], removed: [] },
        minutesAgo: 5300,
      },
      {
        type: CommercialActivityType.STATUS_CHANGED,
        title: 'Estado cambiado a Ganado',
        metadata: { from: 'QUOTED', to: 'WON' },
        minutesAgo: 5200,
      },
    ],
  },
  {
    waJid: 'mock-pedro@simulator.local',
    displayName: 'Pedro Castillo',
    leadStatus: LeadStatus.LOST,
    notes: 'Perdido: eligió rack de la competencia por precio.',
    tags: ['Jeep', 'Wrangler', 'Rack', 'perdido'],
    messages: [
      { direction: 'IN', body: 'Tienen rack de techo para Wrangler?', hoursAgo: 120 },
      { direction: 'OUT', body: 'Sí Pedro, rack modular en aluminio. Precio S/ 1,890.', hoursAgo: 119 },
      { direction: 'IN', body: 'Encontré uno más barato, gracias igual', hoursAgo: 100 },
      { direction: 'OUT', body: 'Entendido. Cualquier cosa aquí estamos.', hoursAgo: 99 },
    ],
    activities: [
      {
        type: CommercialActivityType.CONTACT_CREATED,
        title: 'Contacto creado',
        minutesAgo: 7500,
      },
      {
        type: CommercialActivityType.STATUS_CHANGED,
        title: 'Estado cambiado a En seguimiento',
        metadata: { from: 'NEW', to: 'IN_PROGRESS' },
        minutesAgo: 7400,
      },
      {
        type: CommercialActivityType.STATUS_CHANGED,
        title: 'Estado cambiado a Cotizado',
        metadata: { from: 'IN_PROGRESS', to: 'QUOTED' },
        minutesAgo: 7200,
      },
      {
        type: CommercialActivityType.NOTES_UPDATED,
        title: 'Notas actualizadas',
        minutesAgo: 6050,
      },
      {
        type: CommercialActivityType.STATUS_CHANGED,
        title: 'Estado cambiado a Perdido',
        metadata: { from: 'QUOTED', to: 'LOST' },
        minutesAgo: 6000,
      },
    ],
  },
  {
    waJid: 'mock-sofia@simulator.local',
    displayName: 'Sofía Herrera',
    leadStatus: LeadStatus.INTERESTED,
    notes: 'Interesada en kit de protección + parachoque Toyota Hilux.',
    tags: ['Toyota', 'Hilux', 'Protección', 'Parachoque'],
    messages: [
      { direction: 'IN', body: 'Hola, busco pack protección + parachoque Hilux', hoursAgo: 8 },
      { direction: 'OUT', body: 'Hola Sofía. Tenemos pack combo con descuento.', hoursAgo: 7.5 },
      { direction: 'IN', body: 'Qué incluye exactamente el pack?', hoursAgo: 6 },
      { direction: 'OUT', body: 'Parachoque delantero + protección inferior + tornillería.', hoursAgo: 5.5 },
    ],
    activities: [
      {
        type: CommercialActivityType.CONTACT_CREATED,
        title: 'Contacto creado',
        minutesAgo: 500,
      },
      {
        type: CommercialActivityType.TAGS_UPDATED,
        title: 'Etiquetas actualizadas',
        metadata: {
          added: ['Toyota', 'Hilux', 'Protección', 'Parachoque'],
          removed: [],
        },
        minutesAgo: 450,
      },
      {
        type: CommercialActivityType.STATUS_CHANGED,
        title: 'Estado cambiado a Interesado',
        metadata: { from: 'NEW', to: 'INTERESTED' },
        minutesAgo: 360,
      },
    ],
  },
  {
    waJid: 'mock-diego@simulator.local',
    displayName: 'Diego Núñez',
    leadStatus: LeadStatus.QUOTED,
    notes: 'Cotización rack + estribos Ford Ranger enviada ayer.',
    tags: ['Ford', 'Ranger', 'Rack', 'Estribos'],
    messages: [
      { direction: 'IN', body: 'Cotización de rack y estribos para Ranger?', hoursAgo: 20 },
      { direction: 'OUT', body: 'Diego, rack S/ 1,650 + estribos S/ 980. Pack: S/ 2,450.', hoursAgo: 19 },
      { direction: 'IN', body: 'Incluye instalación?', hoursAgo: 18 },
      { direction: 'OUT', body: 'Instalación incluida en el pack. Cotización válida 10 días.', hoursAgo: 17 },
      { direction: 'IN', body: 'Perfecto, lo comento en casa y te confirmo', hoursAgo: 10 },
    ],
    activities: [
      {
        type: CommercialActivityType.CONTACT_CREATED,
        title: 'Contacto creado',
        minutesAgo: 1300,
      },
      {
        type: CommercialActivityType.STATUS_CHANGED,
        title: 'Estado cambiado a En seguimiento',
        metadata: { from: 'NEW', to: 'IN_PROGRESS' },
        minutesAgo: 1200,
      },
      {
        type: CommercialActivityType.STATUS_CHANGED,
        title: 'Estado cambiado a Interesado',
        metadata: { from: 'IN_PROGRESS', to: 'INTERESTED' },
        minutesAgo: 1100,
      },
      {
        type: CommercialActivityType.NOTES_UPDATED,
        title: 'Notas actualizadas',
        minutesAgo: 1050,
      },
      {
        type: CommercialActivityType.STATUS_CHANGED,
        title: 'Estado cambiado a Cotizado',
        metadata: { from: 'INTERESTED', to: 'QUOTED' },
        minutesAgo: 1000,
      },
    ],
  },
];

/** Delete only the exact mock JIDs and cascade their conversations/messages/activities. */
export async function cleanupDevMockContacts(
  client: PrismaClient = prisma,
): Promise<number> {
  const jids = [...DEV_MOCK_CONTACT_JIDS];
  const existing = await client.contact.findMany({
    where: { waJid: { in: jids } },
    select: { id: true, waJid: true },
  });
  const ids = existing.map((c) => c.id);

  // Conversations may link by contactId or remoteJid; messages cascade.
  await client.conversation.deleteMany({
    where: {
      OR: [
        ...(ids.length ? [{ contactId: { in: ids } }] : []),
        { remoteJid: { in: jids } },
      ],
    },
  });

  // CommercialActivity cascades on contact delete; explicit delete is fine too.
  if (ids.length) {
    await client.commercialActivity.deleteMany({
      where: { contactId: { in: ids } },
    });
  }

  const deleted = await client.contact.deleteMany({
    where: { waJid: { in: jids } },
  });
  return deleted.count;
}

async function seedScenarios() {
  const now = Date.now();

  for (const s of SCENARIOS) {
    const lastMsg = s.messages.reduce((a, b) =>
      a.hoursAgo < b.hoursAgo ? a : b,
    );
    const lastSeenAt = new Date(now - lastMsg.hoursAgo * 3600_000);
    const firstSeenAt = new Date(
      now - Math.max(...s.messages.map((m) => m.hoursAgo)) * 3600_000,
    );

    const contact = await prisma.contact.create({
      data: {
        waJid: s.waJid,
        phoneE164: null,
        displayName: s.displayName,
        profileName: s.displayName,
        firstSeenAt,
        lastSeenAt,
        leadStatus: s.leadStatus,
        notes: s.notes,
        tags: s.tags,
      },
    });

    // Older first (coherent timeline)
    const orderedActs = [...s.activities].sort(
      (a, b) => b.minutesAgo - a.minutesAgo,
    );
    for (const act of orderedActs) {
      await prisma.commercialActivity.create({
        data: {
          contactId: contact.id,
          type: act.type,
          source: CommercialActivitySource.SEED,
          title: act.title,
          description: act.description ?? null,
          metadata: (act.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
          createdAt: new Date(now - act.minutesAgo * 60_000),
        },
      });
    }

    const conversation = await prisma.conversation.create({
      data: {
        remoteJid: s.waJid,
        name: s.displayName,
        contactId: contact.id,
        lastMessageAt: lastSeenAt,
        aiMode: 'AI',
      },
    });

    // Insert oldest first for natural ordering
    const ordered = [...s.messages].sort((a, b) => b.hoursAgo - a.hoursAgo);
    for (const m of ordered) {
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: m.direction,
          body: m.body,
          timestamp: new Date(now - m.hoursAgo * 3600_000),
        },
      });
    }
  }
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('seed-dev aborted: NODE_ENV=production');
    process.exit(1);
  }

  const cleaned = await cleanupDevMockContacts();
  console.log(`Cleaned ${cleaned} prior mock contact(s)`);

  // DEV BusinessProfile fixture only — not a platform default.
  await prisma.botSettings.upsert({
    where: { id: 'default' },
    update: {
      businessName: 'DMX 4x4',
      timezone: 'America/Lima',
      businessHoursStart: '08:00',
      businessHoursEnd: '18:00',
    },
    create: {
      id: 'default',
      welcomeMessage:
        '¡Hola! 👋 Bienvenido/a a DMX 4x4. Soy el asistente virtual.',
      firstAction:
        'Escribe 1 para productos, 2 para horarios, o cuéntame en qué puedo ayudarte.',
      hfModel: null,
      globalAutoReplyEnabled: false,
      commercialAutomationMode: 'OFF',
      businessName: 'DMX 4x4',
      timezone: 'America/Lima',
      businessHoursStart: '08:00',
      businessHoursEnd: '18:00',
    },
  });
  console.log('Seed-dev OK — BotSettings BusinessProfile fixture (DMX 4x4 / America/Lima 08–18)');

  await seedScenarios();
  console.log(
    `Seed-dev OK — ${DEV_MOCK_CONTACT_JIDS.length} mock contacts with conversations/messages/activities`,
  );
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
