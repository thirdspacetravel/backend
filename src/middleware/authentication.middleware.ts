import type { NextFunction, Response } from 'express';
import { verifyJwt } from '../utils/jwt.js';
import type { JWTPayload } from '../types/jwt.js';
import type { AuthenticatedRequest } from '../types/auth.js';

const getVerifiedPayload = (req: AuthenticatedRequest): JWTPayload | null => {
  const token = req.cookies.token;
  if (!token) return null;
  try {
    return verifyJwt(token);
  } catch {
    return null;
  }
};

export const authenticateAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const decoded = getVerifiedPayload(req);

  if (!decoded || decoded.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied: Admin privileges required.',
    });
  }

  req.user = decoded;
  next();
};

export const authenticateUser = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const decoded = getVerifiedPayload(req);

  if (!decoded || decoded.role !== 'user') {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.',
    });
  }

  req.user = decoded;
  next();
};
