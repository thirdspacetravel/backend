import type { Request } from 'express';
import type { JWTPayload } from './jwt.js';
export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
}
