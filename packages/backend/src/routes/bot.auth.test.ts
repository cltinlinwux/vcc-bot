import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { Server } from 'node:http';

const testDbPath = path.join(os.tmpdir(), `vcc-bot-auth-test-${process.pid}.db`);
process.env.DATABASE_URL = `file:${testDbPath}`;
process.env.BCRYPT_ROUNDS = '4';
// A non-placeholder secret so user JWTs can be signed while NODE_ENV=production.
process.env.JWT_SECRET = 'vcc-bot-auth-test-secret-0123456789abcdef';

const SERVICE_TOKEN = 'test-bot-service-token';

const { migrate } = await import('../db/migrate.js');
const { botRouter } = await import('./index.js');
const { errorHandler } = await import('../middleware/validate.js');
const { signToken } = await import('../middleware/auth.js');
const { createUser } = await import('../services/user.service.js');
const { generateLinkCode, linkBotAccount } = await import('../services/bot.service.js');
const express = (await import('express')).default;

let server: Server;
let baseUrl: string;
const originalNodeEnv = process.env.NODE_ENV;

before(async () => {
  migrate();

  const user = createUser({ username: 'authuser', email: 'authuser@test.dev', password: 'password123' });
  const code = generateLinkCode(user.id);
  linkBotAccount({ code, platform: 'discord', platformUserId: 'discord-auth-1', platformUsername: 'authuser#0' });

  const app = express();
  app.use(express.json());
  app.use('/api/bot', botRouter);
  app.use(errorHandler);

  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Failed to bind test server');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(() => {
  process.env.NODE_ENV = originalNodeEnv;
  server?.close();
  for (const ext of ['', '-wal', '-shm']) {
    fs.rmSync(`${testDbPath}${ext}`, { force: true });
  }
});

function statsRequest(token?: string): Promise<Response> {
  return fetch(`${baseUrl}/api/bot/user/discord/discord-auth-1`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

describe('bot service auth outside production', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.BOT_SERVICE_TOKEN;
  });

  it('allows bot-service routes without a token', async () => {
    const res = await statsRequest();
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.username, 'authuser');
  });
});

describe('bot service auth in production', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.BOT_SERVICE_TOKEN = SERVICE_TOKEN;
  });

  it('rejects requests without a token', async () => {
    const res = await statsRequest();
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.code, 'BOT_AUTH_INVALID');
  });

  it('rejects requests with a wrong token', async () => {
    const res = await statsRequest('wrong-token');
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.code, 'BOT_AUTH_INVALID');
  });

  it('accepts requests with the correct token', async () => {
    const res = await statsRequest(SERVICE_TOKEN);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.username, 'authuser');
  });

  it('guards POST /api/bot/unlink the same way', async () => {
    const rejected = await fetch(`${baseUrl}/api/bot/unlink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: 'discord', platformUserId: 'discord-auth-1' }),
    });
    assert.equal(rejected.status, 401);

    const accepted = await fetch(`${baseUrl}/api/bot/unlink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_TOKEN}` },
      body: JSON.stringify({ platform: 'discord', platformUserId: 'discord-auth-1' }),
    });
    assert.equal(accepted.status, 200);
    const body = await accepted.json();
    assert.equal(body.data.unlinked, true);
  });

  it('fails closed when BOT_SERVICE_TOKEN is not configured', async () => {
    delete process.env.BOT_SERVICE_TOKEN;
    const res = await statsRequest(SERVICE_TOKEN);
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.code, 'BOT_AUTH_UNCONFIGURED');
  });

  it('leaves user-JWT routes governed by user auth, not the service token', async () => {
    const user = createUser({ username: 'jwtuser', email: 'jwtuser@test.dev', password: 'password123' });
    const jwt = signToken({ userId: user.id, username: user.username, role: 'user' });

    const res = await fetch(`${baseUrl}/api/bot/link-code`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.code.length, 8);
  });
});
