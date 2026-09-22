import { PrismaClient } from '@prisma/client';
import {
  DEMO_BUSINESS_NAME,
  DEMO_BUSINESS_PROFILE,
  DEMO_FIRST_ACTION_UNUSED,
  DEMO_KB_CONTENT,
  DEMO_WELCOME_MESSAGE,
} from '../src/llm/demo-nova-servicios';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEFAULT_WELCOME = DEMO_WELCOME_MESSAGE;
const DEFAULT_FIRST_ACTION = DEMO_FIRST_ACTION_UNUSED;
const DEFAULT_KB = DEMO_KB_CONTENT;

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

  // DEMO CHATBOT DATA (Nova Servicios) — separate from pipeline mocks in seed-dev.
  await prisma.knowledgeBase.upsert({
    where: { id: 'default' },
    update: { content: DEFAULT_KB },
    create: {
      id: 'default',
      content: DEFAULT_KB,
    },
  });

  await prisma.botSettings.upsert({
    where: { id: 'default' },
    update: {
      welcomeMessage: DEFAULT_WELCOME,
      firstAction: DEFAULT_FIRST_ACTION,
      businessName: DEMO_BUSINESS_PROFILE.businessName,
      timezone: DEMO_BUSINESS_PROFILE.timezone,
      businessHoursStart: DEMO_BUSINESS_PROFILE.businessHoursStart,
      businessHoursEnd: DEMO_BUSINESS_PROFILE.businessHoursEnd,
    },
    create: {
      id: 'default',
      welcomeMessage: DEFAULT_WELCOME,
      firstAction: DEFAULT_FIRST_ACTION,
      hfModel: null,
      globalAutoReplyEnabled: false,
      commercialAutomationMode: 'OFF',
      businessName: DEMO_BUSINESS_PROFILE.businessName,
      timezone: DEMO_BUSINESS_PROFILE.timezone,
      businessHoursStart: DEMO_BUSINESS_PROFILE.businessHoursStart,
      businessHoursEnd: DEMO_BUSINESS_PROFILE.businessHoursEnd,
    },
  });

  console.log('Seed OK — user:', admin.username, '(password: Admin123!)');
  console.log('Seed OK — Nova Servicios DEMO KB + BusinessProfile + welcome');
console.log('  business:', DEMO_BUSINESS_NAME);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
