import jwt from 'jsonwebtoken';
import { createHash, timingSafeEqual } from 'node:crypto';
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

function secretsMatch(a: string, b: string): boolean {
  // Hashing first gives equal-length buffers so the comparison stays timing-safe.
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}

/**
 * Guards bot-service endpoints (called by the Discord/Telegram bot process,
 * not by browsers). In production the bot must present
 * `Authorization: Bearer $BOT_SERVICE_TOKEN`; in dev/test requests pass
 * through so the API can be exercised locally without a token.
 */
export function botServiceAuth(req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV !== 'production') {
    next();
    return;
  }

  const serviceToken = process.env.BOT_SERVICE_TOKEN;
  if (!serviceToken) {
    res.status(503).json({ error: 'Bot service token not configured', code: 'BOT_AUTH_UNCONFIGURED' });
    return;
  }

  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ') || !secretsMatch(header.slice(7), serviceToken)) {
    res.status(401).json({ error: 'Invalid bot service token', code: 'BOT_AUTH_INVALID' });
    return;
  }

  next();
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
