import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server as HttpServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

// Point the db at a throwaway file before any db-dependent module loads.
process.env.DATABASE_URL = `file:${path.join(mkdtempSync(path.join(tmpdir(), 'vcc-test-')), 'test.db')}`;

const { WS_EVENTS } = await import('@vcc/shared');
const { migrate } = await import('../db/migrate.js');
const { authRouter, gameRouter } = await import('../routes/index.js');
const { setupWebSocket } = await import('./index.js');
const { getQueueSize } = await import('../services/match.service.js');
const express = (await import('express')).default;
const { io: ioClient } = await import('socket.io-client');
type ClientSocket = import('socket.io-client').Socket;

let httpServer: HttpServer;
let baseUrl: string;
const openSockets: ClientSocket[] = [];

before(async () => {
  migrate();

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/game', gameRouter);

  httpServer = createServer(app);
  setupWebSocket(httpServer);

  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = httpServer.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  for (const socket of openSockets) socket.disconnect();
  await new Promise<void>((resolve, reject) => {
    httpServer.close((err) => (err ? reject(err) : resolve()));
  });
});

async function registerUser(name: string): Promise<{ userId: string; token: string }> {
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: name,
      email: `${name}@test.local`,
      password: 'password123',
      displayName: name,
    }),
  });
  assert.equal(res.status, 201, `register ${name} failed: ${await res.clone().text()}`);
  const body = (await res.json()) as { data: { user: { id: string }; tokens: { accessToken: string } } };
  return { userId: body.data.user.id, token: body.data.tokens.accessToken };
}

function connectSocket(token: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(baseUrl, { auth: { token }, transports: ['websocket'] });
    openSockets.push(socket);
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function waitForEvent<T>(socket: ClientSocket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for "${event}"`)),
      timeoutMs,
    );
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function restJoinQueue(token: string): Promise<{ matched: boolean; matchId?: string }> {
  const res = await fetch(`${baseUrl}/api/game/queue/join`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: { matched: boolean; matchId?: string } };
  return body.data;
}

interface MatchedPayload {
  matchId: string;
  state: { id: string; players: { userId: string }[]; currentTurn: number };
}

test('WS + WS: both players receive QUEUE_MATCHED and share the match room', async () => {
  const p1 = await registerUser('wsplayer1');
  const p2 = await registerUser('wsplayer2');
  const s1 = await connectSocket(p1.token);
  const s2 = await connectSocket(p2.token);

  const queuedAck = waitForEvent<{ queued: boolean }>(s1, WS_EVENTS.QUEUE_JOIN);
  s1.emit(WS_EVENTS.QUEUE_JOIN);
  assert.deepEqual(await queuedAck, { queued: true });
  assert.equal(getQueueSize(), 1);

  const matched1 = waitForEvent<MatchedPayload>(s1, WS_EVENTS.QUEUE_MATCHED);
  const matched2 = waitForEvent<MatchedPayload>(s2, WS_EVENTS.QUEUE_MATCHED);
  s2.emit(WS_EVENTS.QUEUE_JOIN);

  const [m1, m2] = await Promise.all([matched1, matched2]);
  assert.equal(m1.matchId, m2.matchId);
  assert.deepEqual(
    m1.state.players.map((p) => p.userId).sort(),
    [p1.userId, p2.userId].sort(),
  );
  assert.equal(getQueueSize(), 0);

  // Both sockets must be in the match room: an action by the current player
  // must produce a MATCH_STATE broadcast that the opponent receives.
  const currentTurnUserId = m1.state.players[m1.state.currentTurn].userId;
  const actor = currentTurnUserId === p1.userId ? s1 : s2;
  const observer = currentTurnUserId === p1.userId ? s2 : s1;

  const observerState = waitForEvent<{ turnNumber: number }>(observer, WS_EVENTS.MATCH_STATE);
  actor.emit(WS_EVENTS.MATCH_ACTION, { matchId: m1.matchId, action: { type: 'end_turn' } });
  assert.ok((await observerState).turnNumber >= 1);
});

test('REST first, WS second: REST-queued player is notified through their socket', async () => {
  const p1 = await registerUser('restplayer1');
  const p2 = await registerUser('restplayer2');
  const s1 = await connectSocket(p1.token);
  const s2 = await connectSocket(p2.token);

  const restResult = await restJoinQueue(p1.token);
  assert.equal(restResult.matched, false);
  assert.equal(getQueueSize(), 1);

  const matched1 = waitForEvent<MatchedPayload>(s1, WS_EVENTS.QUEUE_MATCHED);
  const matched2 = waitForEvent<MatchedPayload>(s2, WS_EVENTS.QUEUE_MATCHED);
  s2.emit(WS_EVENTS.QUEUE_JOIN);

  const [m1, m2] = await Promise.all([matched1, matched2]);
  assert.equal(m1.matchId, m2.matchId);
  assert.equal(getQueueSize(), 0);
});

test('WS first, REST second: REST join triggers match and notifies both sockets', async () => {
  const p1 = await registerUser('mixedplayer1');
  const p2 = await registerUser('mixedplayer2');
  const s1 = await connectSocket(p1.token);
  const s2 = await connectSocket(p2.token);

  const queuedAck = waitForEvent<{ queued: boolean }>(s1, WS_EVENTS.QUEUE_JOIN);
  s1.emit(WS_EVENTS.QUEUE_JOIN);
  await queuedAck;

  const matched1 = waitForEvent<MatchedPayload>(s1, WS_EVENTS.QUEUE_MATCHED);
  const matched2 = waitForEvent<MatchedPayload>(s2, WS_EVENTS.QUEUE_MATCHED);
  const restResult = await restJoinQueue(p2.token);

  assert.equal(restResult.matched, true);
  const [m1, m2] = await Promise.all([matched1, matched2]);
  assert.equal(m1.matchId, m2.matchId);
  assert.equal(m1.matchId, restResult.matchId);
  assert.equal(getQueueSize(), 0);
});

test('REST + REST: both players notified via sockets without any WS queue join', async () => {
  const p1 = await registerUser('restonly1');
  const p2 = await registerUser('restonly2');
  const s1 = await connectSocket(p1.token);
  const s2 = await connectSocket(p2.token);

  const first = await restJoinQueue(p1.token);
  assert.equal(first.matched, false);

  const matched1 = waitForEvent<MatchedPayload>(s1, WS_EVENTS.QUEUE_MATCHED);
  const matched2 = waitForEvent<MatchedPayload>(s2, WS_EVENTS.QUEUE_MATCHED);
  const second = await restJoinQueue(p2.token);

  assert.equal(second.matched, true);
  const [m1, m2] = await Promise.all([matched1, matched2]);
  assert.equal(m1.matchId, m2.matchId);
  assert.equal(getQueueSize(), 0);
});
