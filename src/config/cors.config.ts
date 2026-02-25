import type { CorsOptions } from 'cors';

const allowedOrigins = [
  'http://192.168.1.64:5173',
  'https://thirdspacetravel.com',
  'https://www.thirdspacetravel.com',
];

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'trpc-batch-mode'],
};
