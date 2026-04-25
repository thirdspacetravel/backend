import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { config } from './env.config.js';

// 1. Better type safety for the global object
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

// 2. Use the singleton
export const prisma = globalForPrisma.prisma ?? prismaClientFactory();

// Always cache to global object to prevent multiple instantiations
globalForPrisma.prisma = prisma;

// 3. Graceful Shutdown
const handleShutdown = async (signal: string) => {
  console.log(`\n${signal} received. Disconnecting...`);
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
