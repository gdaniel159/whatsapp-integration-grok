import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

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

  console.log('Seed OK — user:', admin.username, '(password: Admin123!)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
