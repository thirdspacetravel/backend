import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { config } from '../utils/envConfig.js';
import type { NextFunction, Request, Response } from 'express';
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

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  try {
    const decoded = verifyJwt(token);
    (req as any).user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ success: false, message: 'Invalid or expired token' });
  }
};
