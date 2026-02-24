import { config } from './../utils/envConfig.js';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client.js';

// 1. Extend the Global interface to prevent TS errors on 'globalThis'
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

console.log('Initializing Prisma Client with MariaDB adapter...');

/**
 * 2. Setup the adapter.
 * Keeping connectionLimit at 5 for Dev to preserve your 500/hr quota.
 * Increase to 10+ once you are in a stable Production environment.
 */
const adapter = new PrismaMariaDb({
  host: config.host,
  user: config.user,
  password: config.password,
  database: config.name,
  connectionLimit: 5,
});

/**
 * 3. Singleton Pattern:
 * Reuses the existing Prisma instance if it exists in the global scope.
 */
export const prisma =
  global.prisma ??
  new PrismaClient({
    adapter,
    log: ['query', 'error', 'warn'],
  });

if (config.env !== 'production') {
  global.prisma = prisma;
}

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
