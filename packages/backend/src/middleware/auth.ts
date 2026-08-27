import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

export interface AuthPayload {
  userId: string;
  username: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

const PLACEHOLDER_SECRETS = new Set([
  'change-me-to-a-long-random-secret-in-production',
  'dev-secret-not-for-production',
]);

/**
 * Fails fast in production when JWT_SECRET is missing or still one of the
 * known placeholder values. Called at startup so the server refuses to boot
 * with a guessable signing key.
 */
export function assertJwtSecret(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const secret = process.env.JWT_SECRET;
  if (!secret || PLACEHOLDER_SECRETS.has(secret)) {
    throw new Error('JWT_SECRET must be set to a unique, random value in production');
  }
}

function getJwtSecret(): string {
  assertJwtSecret();
  return process.env.JWT_SECRET ?? 'dev-secret-not-for-production';
}

export function signToken(payload: AuthPayload): string {
  const expiresIn = process.env.JWT_EXPIRES_IN ?? '7d';
  return jwt.sign(payload, getJwtSecret(), { expiresIn } as jwt.SignOptions);
}

export function verifyToken(token: string): AuthPayload {
  return jwt.verify(token, getJwtSecret()) as AuthPayload;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
    return;
  }

  try {
    req.auth = verifyToken(header.slice(7));
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token', code: 'AUTH_INVALID' });
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      req.auth = verifyToken(header.slice(7));
    } catch {
      // ignore invalid token for optional auth
    }
  }
  next();
}
