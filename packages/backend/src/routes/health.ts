import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDatabase } from '../db/client.js';
import { logLine } from '../middleware/logging.js';
import { getMetrics } from '../metrics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The backend package manifest sits one directory above both src/ (tsx dev)
// and dist/ (compiled), so the same relative path works in either mode.
const packageJson = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'),
) as { version?: string };
const VERSION = packageJson.version ?? '0.0.0';

export const healthRouter = Router();

/** Liveness probe: the process is up and able to serve requests. */
healthRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    version: VERSION,
    timestamp: new Date().toISOString(),
  });
});

/** Readiness probe: the process can serve real traffic (database reachable). */
healthRouter.get('/health/ready', (_req, res) => {
  const databaseOk = checkDatabase();
  res.status(databaseOk ? 200 : 503).json({
    status: databaseOk ? 'ready' : 'unavailable',
    checks: { database: databaseOk },
    timestamp: new Date().toISOString(),
  });
});

/** Constant-time comparison; hashing first sidesteps length mismatches. */
function safeEqual(a: string, b: string): boolean {
  const digestA = createHash('sha256').update(a).digest();
  const digestB = createHash('sha256').update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

/**
 * Guards GET /metrics when METRICS_TOKEN is configured (recommended in
 * production, where the endpoint would otherwise be public). Without the env
 * var the endpoint stays open, which suits local development.
 */
function metricsAuth(req: Request, res: Response, next: NextFunction): void {
  const requiredToken = process.env.METRICS_TOKEN;
  if (!requiredToken) {
    next();
    return;
  }

  const header = req.headers.authorization;
  const provided = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!provided || !safeEqual(provided, requiredToken)) {
    logLine('warn', { event: 'metrics_unauthorized', requestId: req.id, ip: req.ip });
    res.status(401).json({ error: 'Valid metrics token required', code: 'METRICS_AUTH_REQUIRED' });
    return;
  }
  next();
}

healthRouter.get('/metrics', metricsAuth, (_req, res) => {
  res.json({
    ...getMetrics(),
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});
