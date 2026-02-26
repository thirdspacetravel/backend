import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { config } from './env.config.js';

declare global {
  namespace globalThis {
    var prisma: PrismaClient | undefined;
  }
}

const adapter = new PrismaMariaDb({
  host: config.host,
  user: config.user,
  password: config.password,
  database: config.name,
  connectionLimit: 50,
});

const prismaClientFactory = () => {
  console.log('✨ Initializing New Prisma Client with MariaDB adapter...');
  console.log(`📡 Connecting to MariaDB at ${config.host} as ${config.user}...`);
  return new PrismaClient({
    adapter,
    log: config.env === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
};

export const prisma = global.prisma || prismaClientFactory();

if (config.env !== 'production') {
  global.prisma = prisma;
}

const handleShutdown = async (signal: string) => {
  console.log(`\n${signal} received. Disconnecting Prisma...`);
  try {
    await prisma.$disconnect();
    console.log('Successfully disconnected from MariaDB.');
    process.exit(0);
  } catch (error) {
    console.error('Error during Prisma disconnection:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
