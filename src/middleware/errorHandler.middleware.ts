import type { Request, Response, NextFunction } from 'express';
import { config } from '../config/env.config.js';
import { logger } from '../config/logger.config.js';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  logger.error({ err }, 'An error occurred');
  res.status(500).json({
    success: false,
    error: config.env === 'development' ? err.message : 'Internal server error',
    timestamp: new Date().toISOString(),
  });
}
