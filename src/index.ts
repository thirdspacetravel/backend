import { app } from './app.js';
import { config } from './config/env.config.js';
import { logger } from './config/logger.config.js';
import { prisma } from './config/database.config.js';

const server = app.listen(config.port, () => {
  logger.info(`🚀 Server running on http://localhost:${config.port}`);
});

const shutdown = async (signal: string) => {
  logger.info(`${signal} received. Closing resources...`);

  server.close(async () => {
    await prisma.$disconnect();
    logger.info('Database disconnected. Server closed.');
    process.exit(0);
  });

  // Force shutdown after 10s if graceful fails
  setTimeout(() => process.exit(1), 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
