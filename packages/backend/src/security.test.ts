import { describe, it, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { assertJwtSecret } from './middleware/auth.js';
import { requestLogger, logLine } from './middleware/logging.js';
import { linkCodeLimiter, LINK_RATE_LIMIT_MAX } from './middleware/rateLimits.js';
import { registerSchema } from './schemas/index.js';

function listen(app: express.Express): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

describe('JWT secret validation', () => {
  const originalEnv = { NODE_ENV: process.env.NODE_ENV, JWT_SECRET: process.env.JWT_SECRET };

  after(() => {
    process.env.NODE_ENV = originalEnv.NODE_ENV;
    process.env.JWT_SECRET = originalEnv.JWT_SECRET;
  });

  beforeEach(() => {
    delete process.env.JWT_SECRET;
  });

  it('throws in production when JWT_SECRET is missing', () => {
    process.env.NODE_ENV = 'production';
    assert.throws(() => assertJwtSecret(), /JWT_SECRET/);
  });

  it('throws in production when JWT_SECRET is the default placeholder', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'change-me-to-a-long-random-secret-in-production';
    assert.throws(() => assertJwtSecret(), /JWT_SECRET/);
  });

  it('throws in production when JWT_SECRET is the dev fallback', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'dev-secret-not-for-production';
    assert.throws(() => assertJwtSecret(), /JWT_SECRET/);
  });

  it('passes in production with a real secret', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a-sufficiently-long-and-unique-random-secret-value';
    assert.doesNotThrow(() => assertJwtSecret());
  });

  it('does not throw in development without a secret', () => {
    process.env.NODE_ENV = 'development';
    assert.doesNotThrow(() => assertJwtSecret());
  });
});

describe('password strength', () => {
  const base = { username: 'player1', email: 'player@example.com' };

  it('rejects passwords shorter than 8 characters', () => {
    const result = registerSchema.safeParse({ ...base, password: 'abc1' });
    assert.equal(result.success, false);
  });

  it('rejects passwords without a number', () => {
    const result = registerSchema.safeParse({ ...base, password: 'onlyletters' });
    assert.equal(result.success, false);
    assert.match(JSON.stringify(result.error?.issues), /number/);
  });

  it('accepts a password with 8+ chars and a number', () => {
    const result = registerSchema.safeParse({ ...base, password: 'str0ngpassword' });
    assert.equal(result.success, true);
  });
});

describe('request logging middleware', () => {
  it('assigns a request ID, echoes it in the response, and logs JSON', async () => {
    const lines: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => lines.push(msg);

    const app = express();
    app.use(requestLogger);
    app.get('/ping', (req, res) => res.json({ requestId: req.id }));

    const { server, baseUrl } = await listen(app);
    try {
      const res = await fetch(`${baseUrl}/ping`);
      const body = (await res.json()) as { requestId: string };
      const headerId = res.headers.get('x-request-id');

      assert.ok(headerId, 'X-Request-Id header should be set');
      assert.equal(body.requestId, headerId);

      for (let i = 0; i < 20 && lines.length === 0; i++) await sleep(25);
      const entry = JSON.parse(lines.at(-1)!);
      assert.equal(entry.requestId, headerId);
      assert.equal(entry.method, 'GET');
      assert.equal(entry.path, '/ping');
      assert.equal(entry.status, 200);
      assert.equal(entry.level, 'info');
      assert.equal(typeof entry.durationMs, 'number');
    } finally {
      console.log = originalLog;
      server.close();
    }
  });

  it('honors a well-formed incoming X-Request-Id', async () => {
    const app = express();
    app.use(requestLogger);
    app.get('/ping', (_req, res) => res.sendStatus(204));

    const { server, baseUrl } = await listen(app);
    try {
      const res = await fetch(`${baseUrl}/ping`, { headers: { 'X-Request-Id': 'my-trace-id-123' } });
      assert.equal(res.headers.get('x-request-id'), 'my-trace-id-123');
    } finally {
      server.close();
    }
  });

  it('logLine emits valid JSON with timestamp and level', () => {
    const lines: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => lines.push(msg);
    try {
      logLine('info', { hello: 'world' });
    } finally {
      console.log = originalLog;
    }
    const entry = JSON.parse(lines[0]);
    assert.equal(entry.level, 'info');
    assert.equal(entry.hello, 'world');
    assert.ok(!Number.isNaN(Date.parse(entry.timestamp)));
  });
});

describe('bot link rate limiting', () => {
  it(`allows successful links but blocks after ${LINK_RATE_LIMIT_MAX} failed attempts per IP`, async () => {
    let failMode = false;
    const app = express();
    app.post('/api/bot/link', linkCodeLimiter, (_req, res) => {
      if (failMode) {
        res.status(400).json({ error: 'Invalid link code', code: 'LINK_FAILED' });
      } else {
        res.json({ data: { linked: true } });
      }
    });

    const { server, baseUrl } = await listen(app);
    try {
      const attempt = () => fetch(`${baseUrl}/api/bot/link`, { method: 'POST' });

      // Successful links do not consume the budget.
      for (let i = 0; i < 3; i++) {
        assert.equal((await attempt()).status, 200);
      }

      // Failed attempts do: exactly LINK_RATE_LIMIT_MAX are allowed through.
      failMode = true;
      for (let i = 0; i < LINK_RATE_LIMIT_MAX; i++) {
        assert.equal((await attempt()).status, 400);
      }

      const blocked = await attempt();
      assert.equal(blocked.status, 429);
      const body = (await blocked.json()) as { code: string };
      assert.equal(body.code, 'RATE_LIMITED');
    } finally {
      server.close();
    }
  });
});
