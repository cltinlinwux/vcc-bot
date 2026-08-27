import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authRouter, gameRouter, botRouter, healthRouter } from './routes/index.js';
import { errorHandler } from './middleware/validate.js';
import { assertJwtSecret } from './middleware/auth.js';
import { requestLogger } from './middleware/logging.js';
import { setupWebSocket } from './ws/index.js';
import { migrate } from './db/migrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';

assertJwtSecret();
migrate();

const app = express();
const port = parseInt(process.env.PORT ?? '3001', 10);
const host = process.env.HOST ?? '0.0.0.0';

app.use(requestLogger);
app.use(helmet({
  contentSecurityPolicy: isProduction
    ? {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:'],
          'font-src': ["'self'", 'data:'],
          'connect-src': ["'self'", 'ws:', 'wss:'],
          'object-src': ["'none'"],
          'base-uri': ["'self'"],
          'form-action': ["'self'"],
          'frame-ancestors': ["'none'"],
        },
      }
    : false,
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '900000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX ?? '100', 10),
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Liveness (/health), readiness (/health/ready), and metrics (/metrics).
app.use(healthRouter);

app.use('/api/auth', authRouter);
app.use('/api/game', gameRouter);
app.use('/api/bot', botRouter);

function resolveFrontendDist(): string | null {
  const candidates = [
    // Explicit override (set in the production Docker image).
    process.env.FRONTEND_DIST,
    // Relative to this file: works when running from src/ (tsx dev) or dist/ (compiled),
    // since both are one level below packages/backend.
    path.resolve(__dirname, '../../frontend/dist'),
    // Relative to the process cwd, e.g. when started from the monorepo root.
    path.resolve(process.cwd(), 'packages/frontend/dist'),
    path.resolve(process.cwd(), '../frontend/dist'),
  ].filter((p): p is string => Boolean(p));

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'index.html'))) {
      return candidate;
    }
  }
  return null;
}

const frontendDist = resolveFrontendDist();
if (frontendDist) {
  console.log(`Serving frontend from ${frontendDist}`);
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/health') || req.path.startsWith('/metrics')) {
      next();
      return;
    }
    res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
      if (err) next();
    });
  });
} else {
  console.warn('Frontend dist not found; static file serving disabled. Set FRONTEND_DIST or build @vcc/frontend.');
}

app.use(errorHandler);

const httpServer = createServer(app);
setupWebSocket(httpServer);

httpServer.listen(port, host, () => {
  console.log(`VCC backend running on http://${host}:${port}`);
});

export { app, httpServer };
