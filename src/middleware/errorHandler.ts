import type { Request, Response, NextFunction } from 'express';
import { config } from '../utils/envConfig.js';
import { logger } from '../utils/logger.js';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  logger.error({ err }, 'An error occurred');
  res.status(500).json({
    success: false,
    error: config.env === 'production' ? 'Internal server error' : err.message,
    timestamp: new Date().toISOString(),
  });
}
