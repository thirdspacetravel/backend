import { config } from './../utils/envConfig.js';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client.js';
console.log('Initializing Prisma Client with MariaDB adapter...');
console.log(`Database Host: ${config.host}`);
console.log(`Database User: ${config.user}`);
const adapter = new PrismaMariaDb({
  host: config.host,
  user: config.user,
  password: config.password,
  database: config.name,
  connectionLimit: 5,
});
const prisma = new PrismaClient({ adapter });
export { prisma };
