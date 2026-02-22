import express from 'express';
import type { Application } from 'express';
import * as trpcExpress from '@trpc/server/adapters/express';
import { config } from './utils/envConfig.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { appRouter } from './trpc/routers/index.js';
import { createContext } from './trpc/context.js';
import helmet from 'helmet';
import cors, { type CorsOptions } from 'cors';
import cookieParser from 'cookie-parser';
import * as pino from 'pino-http';
import { logger } from './utils/logger.js';
import { prisma } from './lib/prisma.js';

const app: Application = express();
app.use(cookieParser());

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);

const allowedOrigins: string[] = [
  'http://192.168.1.64:5173',
  'https://thirdspacetravel.com',
  'https://www.thirdspacetravel.com',
];

const corsOptions: CorsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'trpc-batch-mode'],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const trpcLogger = pino.pinoHttp({
  logger,
  customLogLevel: () => 'info',
  serializers: {
    req: req => ({ method: req.method, url: req.url }),
    res: res => ({ statusCode: res.statusCode }),
  },
  quietReqLogger: true,
  autoLogging: true,
});

app.use(
  '/trpc',
  trpcLogger,
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext,
    onError({ error, path, type }) {
      logger.error({ path, type, error }, 'tRPC error');
    },
  }),
);

// const createUserSchema = z.object({
//   username: z.string().min(3),
//   email: z.string().email(),
//   age: z.number().int().positive(),
// });

// app.post(
//   '/users',
//   validateRequest(createUserSchema),
//   (req, res) => {
//     // At this point, req.body is guaranteed to match the schema
//     res.send({ success: true, data: req.body });
//   }
// );

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Server is up and running 🚀',
    timestamp: new Date().toISOString(),
  });
});

app.get('/admin-details/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const admin = await prisma.adminUser.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        email: true,
        avatarUrl: true,
        role: true,
      },
    });

    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    return res.status(200).json({ admin, allowedOrigins });
  } catch (error) {
    console.error('REST API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(config.port, () => {
  logger.info(`🚀 Server running on http://localhost:${config.port}`);
  logger.info(`📡 tRPC endpoint: http://localhost:${config.port}/trpc`);
  logger.info(`📦 Environment: ${config.env}`);
  logger.info(`🔧 Node version: ${process.version}`);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});
