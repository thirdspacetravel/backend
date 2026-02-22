import { z } from 'zod';
import dotenv from 'dotenv';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const envSchema = z.object({
  PORT: z.coerce.number().default(8080),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string(),
  DATABASE_HOST: z.string(),
  DATABASE_USER: z.string(),
  DATABASE_PASSWORD: z.string(),
  DATABASE_NAME: z.string(),
  JWT_SECRET: z.string(),
});

const parsed = envSchema.safeParse(process.env);

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
