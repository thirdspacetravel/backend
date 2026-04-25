import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { config } from './env.config.js';

// Module-level cache (more reliable than globalThis)
let cachedPrisma: PrismaClient | null = null;

// Also use globalThis as fallback for HMR and multi-worker scenarios
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prismaClientFactory = () => {
  console.log('✨ Initializing Prisma Client & MariaDB Adapter...');

  // Initialize the adapter INSIDE the factory
  const adapter = new PrismaMariaDb({
    host: config.host,
    user: config.user,
    password: config.password,
    database: config.name,
    connectionLimit: 20,
  });

  return new PrismaClient({
    adapter,
    log: config.env === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
};

// 1. Use module-level cache first (most reliable)
// 2. Fall back to globalThis (for multi-process scenarios)
// 3. Create new instance if neither exists
export const prisma = cachedPrisma || globalForPrisma.prisma || (() => {
  const instance = prismaClientFactory();
  cachedPrisma = instance;
  globalForPrisma.prisma = instance;
  return instance;
})();

