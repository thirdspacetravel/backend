import pino from 'pino';
import { config } from '../utils/envConfig.js';

const isProduction = config.env === 'production';

const baseOptions: pino.LoggerOptions = {
  level: isProduction ? 'info' : 'debug',
  formatters: {
    level(label) {
      return { level: label.toUpperCase() };
    },
  },
  timestamp: () => `,"time":"${new Date().toISOString()}"`,
};

const logger = pino(baseOptions);

export { logger };

export const info = (msg: string, obj?: Record<string, unknown>) => logger.info(obj, msg);
export const warn = (msg: string, obj?: Record<string, unknown>) => logger.warn(obj, msg);
export const error = (msg: string, obj?: Record<string, unknown>) => logger.error(obj, msg);
export const debug = (msg: string, obj?: Record<string, unknown>) => logger.debug(obj, msg);
