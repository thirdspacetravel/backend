import express from 'express';
import type { Application } from 'express';
import * as trpcExpress from '@trpc/server/adapters/express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pino from 'pino-http';
import { logger } from './config/logger.config.js';
import { trpcRouter } from './trpc/routers/index.js';
import { createContext } from './trpc/context.js';
import { corsOptions } from './config/cors.config.js';
import { errorHandler } from './middleware/errorHandler.middleware.js';
import { notFoundHandler } from './middleware/notFoundHandler.middleware.js';
import { apiRouter } from './api/index.js';
import { PERSISTENT_DIR, TMP_DIR, UPLOAD_DIR } from './middleware/upload.middleware.js';
import path from 'path';
import { initCronJobs } from './utils/cronTasks.js';

const app: Application = express();

// --- Security & Parsing ---
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Logging ---
const httpLogger = pino.pinoHttp({
  logger,
  customLogLevel: () => 'info',
  serializers: {
    req: req => ({ method: req.method, url: req.url }),
    res: res => ({ statusCode: res.statusCode }),
  },
  quietReqLogger: true,
  autoLogging: true,
});

// --- Routes ---

// tRPC
app.use(
  '/trpc',
  httpLogger,
  trpcExpress.createExpressMiddleware({
    router: trpcRouter,
    createContext,
    onError: ({ error, path }) => logger.error({ path, error }, 'tRPC error'),
  }),
);

// API
app.use(apiRouter);

// images
app.use('/images', express.static(PERSISTENT_DIR));
app.use('/images', express.static(TMP_DIR));
app.use('/exports', express.static(TMP_DIR));

app.get('/debug/env', (req, res) => {
  res.json(process.env);
});

// Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

initCronJobs();
export { app };
