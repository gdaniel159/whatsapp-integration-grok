import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEFAULT_WELCOME =
  '¡Hola! 👋 Bienvenido/a. Soy el asistente virtual de nuestro negocio. Estoy aquí para ayudarte con información sobre productos, servicios y horarios.';

const DEFAULT_FIRST_ACTION =
  'Escribe 1 para precios, 2 para horarios, o cuéntame en qué puedo ayudarte.';

const DEFAULT_KB = `# Base de conocimiento (ejemplo)

## Negocio
Somos un negocio genérico de ejemplo. Edita este texto con la información real de tu empresa.

## Productos / Servicios
- Producto A: descripción breve, precio referencial
- Servicio B: descripción breve

## Horarios
Lunes a viernes: 9:00 – 18:00
Sábados: 9:00 – 13:00
Domingos: cerrado

## Contacto
Responde dudas frecuentes aquí. Si no sabes la respuesta, indica que un asesor humano continuará la conversación.
`;

async function main() {
  const passwordHash = await bcrypt.hash('Admin123!', 10);

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: { passwordHash },
    create: {
      username: 'admin',
      passwordHash,
    },
  });

  await prisma.whatsAppSession.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      status: 'DISCONNECTED',
    },
  });

  await prisma.knowledgeBase.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      content: DEFAULT_KB,
    },
  });

  await prisma.botSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      welcomeMessage: DEFAULT_WELCOME,
      firstAction: DEFAULT_FIRST_ACTION,
      hfModel: null,
      globalAutoReplyEnabled: false,
    },
  });

  console.log('Seed OK — user:', admin.username, '(password: Admin123!)');
  console.log('Seed OK — KnowledgeBase + BotSettings defaults');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
