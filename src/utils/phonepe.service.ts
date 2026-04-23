import { config } from '../config/env.config.js';
import PhonePeManager from './PhonePeManager.js';
import dotenv from 'dotenv';

dotenv.config();
const env = config.phonepeEnv === 'production' ? 'production' : 'sandbox';
export const phonePeProvider = new PhonePeManager(
  process.env.PHONEPE_CLIENT_ID!,
  process.env.PHONEPE_CLIENT_SECRET!,
  '1',
  env,
);
