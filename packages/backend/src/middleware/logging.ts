import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function logLine(level: 'info' | 'warn' | 'error', fields: Record<string, unknown>): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, ...fields });
  if (level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
}

/**
 * Assigns each request an ID (honoring a well-formed incoming X-Request-Id),
 * echoes it in the response, and emits one structured JSON log line per
 * completed request.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const requestId =
    typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();

  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);

  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logLine(level, {
      requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      ip: req.ip,
    });
  });

  next();
}
