import { verifyJwt } from '../utils/jwt.js';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';

export function createContext({ req, res }: CreateExpressContextOptions) {
  const token = req.cookies?.token;

  let user = null;

  if (token) {
    try {
      user = verifyJwt(token);
    } catch {
      user = null;
    }
  }

  return { req, res, user };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
