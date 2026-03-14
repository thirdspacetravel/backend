import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });

const envSchema = z.object({
  PORT: z.coerce.number().default(8080),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string(),
  DATABASE_HOST: z.string(),
  DATABASE_USER: z.string(),
  DATABASE_PASSWORD: z.string(),
  DATABASE_NAME: z.string(),
  JWT_SECRET: z.string(),
  EMAIL_HOST: z.string(),
  EMAIL_PORT: z.string(),
  EMAIL_USER: z.string(),
  EMAIL_PASS: z.string(),
  GOOGLE_CLIENT_ID: z.string(),
  GOOGLE_CLIENT_SECRET: z.string(),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  PHONEPE_CID: z.string(),
  PHONEPE_CLIENT_KEY: z.string(),
  PHONEPE_CALLBACK_URL: z.string(),
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
      EMAIL_HOST: '',
      EMAIL_PORT: '',
      EMAIL_USER: '',
      EMAIL_PASS: '',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      FRONTEND_URL: '',
      PHONEPE_CID: '',
      PHONEPE_CLIENT_KEY: '',
      PHONEPE_CALLBACK_URL: '',
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
  emailHost: env.EMAIL_HOST,
  emailPort: env.EMAIL_PORT,
  emailUser: env.EMAIL_USER,
  emailPass: env.EMAIL_PASS,
  googleClientId: env.GOOGLE_CLIENT_ID,
  googleClientSecret: env.GOOGLE_CLIENT_SECRET,
  frontendUrl: env.FRONTEND_URL,
  phonepeCid: env.PHONEPE_CID,
  phonepeClientKey: env.PHONEPE_CLIENT_KEY,
  phonepeCallbackUrl: env.PHONEPE_CALLBACK_URL,
} as const;
