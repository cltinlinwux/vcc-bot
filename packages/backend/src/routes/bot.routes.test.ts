import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { Server } from 'node:http';

const testDbPath = path.join(os.tmpdir(), `vcc-bot-routes-test-${process.pid}.db`);
process.env.DATABASE_URL = `file:${testDbPath}`;
process.env.BCRYPT_ROUNDS = '4';

const { migrate } = await import('../db/migrate.js');
const { botRouter } = await import('./index.js');
const { errorHandler } = await import('../middleware/validate.js');
const { createUser } = await import('../services/user.service.js');
const { createStarterDeck } = await import('../services/deck.service.js');
const { generateLinkCode, linkBotAccount } = await import('../services/bot.service.js');
const { getStarterDeck } = await import('@vcc/shared');
const express = (await import('express')).default;

let server: Server;
let baseUrl: string;

function createLinkedUser(suffix: string, platformUserId: string): { userId: string } {
  const user = createUser({
    username: `player${suffix}`,
    email: `player${suffix}@test.dev`,
    password: 'password123',
  });
  createStarterDeck(user.id, getStarterDeck());
  const code = generateLinkCode(user.id);
  linkBotAccount({ code, platform: 'discord', platformUserId, platformUsername: `player${suffix}#0` });
  return { userId: user.id };
}

before(async () => {
  migrate();

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
  server?.close();
  for (const ext of ['', '-wal', '-shm']) {
    fs.rmSync(`${testDbPath}${ext}`, { force: true });
  }
});

describe('GET /api/bot/user/:platform/:platformUserId', () => {
  it('rejects an invalid platform', async () => {
    const res = await fetch(`${baseUrl}/api/bot/user/slack/12345`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.code, 'INVALID_PLATFORM');
  });

  it('returns 404 for an unlinked platform user', async () => {
    const res = await fetch(`${baseUrl}/api/bot/user/discord/unlinked-user-id`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.code, 'NOT_LINKED');
  });

  it('returns profile and stats for a linked user', async () => {
    createLinkedUser('stats', 'discord-stats-1');

    const res = await fetch(`${baseUrl}/api/bot/user/discord/discord-stats-1`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.username, 'playerstats');
    assert.equal(body.data.rating, 1000);
    assert.equal(body.data.wins, 0);
    assert.equal(body.data.losses, 0);
    assert.equal(body.data.draws, 0);
    assert.equal(body.data.platformUsername, 'playerstats#0');
  });
});

describe('POST /api/bot/queue/join', () => {
  async function joinQueueRequest(body: unknown): Promise<Response> {
    return fetch(`${baseUrl}/api/bot/queue/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('rejects an invalid body', async () => {
    const res = await joinQueueRequest({ platform: 'slack' });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.code, 'VALIDATION_ERROR');
  });

  it('returns 404 for an unlinked platform user', async () => {
    const res = await joinQueueRequest({ platform: 'discord', platformUserId: 'unlinked-user-id' });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.code, 'NOT_LINKED');
  });

  it('queues a linked user and matches a second one', async () => {
    createLinkedUser('one', 'discord-queue-1');
    createLinkedUser('two', 'discord-queue-2');

    const first = await joinQueueRequest({ platform: 'discord', platformUserId: 'discord-queue-1' });
    assert.equal(first.status, 200);
    const firstBody = await first.json();
    assert.equal(firstBody.data.matched, false);

    const second = await joinQueueRequest({ platform: 'discord', platformUserId: 'discord-queue-2' });
    assert.equal(second.status, 200);
    const secondBody = await second.json();
    assert.equal(secondBody.data.matched, true);
    assert.ok(secondBody.data.matchId);
    assert.equal(secondBody.data.state.status, 'active');
  });
});
