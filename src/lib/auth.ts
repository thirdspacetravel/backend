import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { config } from '../utils/envConfig.js';

const JWT_SECRET = config.jwtSecret;
const EXPIRES_IN = '7d';

export const hashPassword = (password: string) => bcrypt.hash(password, 12);

export const comparePassword = (password: string, hash: string) => bcrypt.compare(password, hash);

export const signJwt = (payload: { id: string; username: string; role: 'admin' | 'user' }) => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: EXPIRES_IN,
  });
};

export const verifyJwt = (token: string) =>
  jwt.verify(token, JWT_SECRET) as {
    id: string;
    username: string;
    role: 'admin' | 'user';
  };
