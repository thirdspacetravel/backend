import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // Hostinger/Passenger sends PORT as a string, Zod transforms it to Number
  PORT: z.coerce.number().default(8080),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string(), // Make optional so it doesn't crash if missing during build,
  DATABASE_HOST: z.string(),
  DATABASE_USER: z.string(),
  DATABASE_PASSWORD: z.string(),
  DATABASE_NAME: z.string(),
  // API_PREFIX: z.string().default(''),
  // LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  // CORS_ORIGIN: z.string().default('*'),
  // RATE_LIMIT_WINDOW: z.string().transform(Number).default(900000), // 15 min
  // RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default(100),
  // DB_HOST: z.string().optional(),
  // DB_PORT: z.string().transform(Number).optional(),
  JWT_SECRET: z.string(),
});

// Use safeParse so we can log errors instead of crashing silently
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.format());
  // In production, we might want to fallback to defaults instead of exiting
}

const env = parsed.success
  ? parsed.data
  : {
      PORT: 8080,
      NODE_ENV: 'production',
      DATABASE_URL: '',
      DATABASE_HOST: '',
      DATABASE_USER: '',
      DATABASE_PASSWORD: '',
      DATABASE_NAME: '',
      JWT_SECRET: '',
    };

export const config = {
  env: env.NODE_ENV,
  port: env.PORT,
  dbUrl: env.DATABASE_URL,
  host: env.DATABASE_HOST,
  user: env.DATABASE_USER,
  password: env.DATABASE_PASSWORD,
  name: env.DATABASE_NAME,
  jwtSecret: env.JWT_SECRET,
} as const;
