import jwt from 'jsonwebtoken';
import { config } from '../config/env.config.js';
import type { JWTPayload } from '../types/jwt.js';

const JWT_SECRET = config.jwtSecret;
const EXPIRES_IN = '7d';

export const signJwt = (payload: JWTPayload): string => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: EXPIRES_IN,
  });
};

export const verifyJwt = (token: string): JWTPayload => {
  return jwt.verify(token, JWT_SECRET) as JWTPayload;
};
