import express from 'express';
import type { Application, Request, Response } from 'express';
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
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { authenticate } from './lib/auth.js';
import { sleep } from './lib/sleep.js';

const app: Application = express();
app.use(cookieParser());

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

const allowedOrigins: string[] = [
  'http://192.168.1.64:5173',
  'https://thirdspacetravel.com',
  'https://www.thirdspacetravel.com',
];

const corsOptions: CorsOptions = {
  origin: allowedOrigins, // Express-cors handles the logic for you if you pass an array
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'trpc-batch-mode'],
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

    return res.status(200).json({ admin, allowedOrigins, config, envs: process.env });
  } catch (error) {
    console.error('REST API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const UPLOAD_DIR = 'uploads';

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR);
}

const storage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req: Request, file: Express.Multer.File, cb) => {
    const fileExt = path.extname(file.originalname);
    const newFileName = `${uuidv4()}${fileExt}`;
    cb(null, newFileName);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images are allowed!') as any, false);
    }
  },
});
app.post(
  '/upload',
  authenticate,
  upload.single('image'),
  async (req: Request, res: Response): Promise<any> => {
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }
    // await sleep(40000);
    return res.json({
      success: true,
      message: 'File uploaded successfully',
      filename: file.filename,
    });
  },
);

const uploadPath = path.join(process.cwd(), 'uploads');
app.use('/images', express.static(uploadPath));
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
