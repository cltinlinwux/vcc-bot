import './test-setup.js';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTestServer, request, registerUser, type TestServer } from './test-helpers.js';
import { getMatch, performAction } from './services/match.service.js';
import { resetMetrics } from './metrics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendPackage = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'),
) as { version: string };

let server: TestServer;
let baseUrl: string;

before(async () => {
  server = await startTestServer();
  baseUrl = server.baseUrl;
});

after(async () => {
  await server.close();
});

describe('GET /health', () => {
  it('returns liveness JSON with status, uptime, version, and timestamp', async () => {
    const res = await request(baseUrl, 'GET', '/health');

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(typeof res.body.uptime, 'number');
    assert.ok(res.body.uptime >= 0, 'uptime must be non-negative');
    assert.equal(res.body.version, backendPackage.version);
    assert.ok(!Number.isNaN(Date.parse(res.body.timestamp)), 'timestamp must be parseable');
  });
});

describe('GET /health/ready', () => {
  it('reports ready with a passing database check', async () => {
    const res = await request(baseUrl, 'GET', '/health/ready');

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ready');
    assert.deepEqual(res.body.checks, { database: true });
  });
});

describe('GET /metrics', () => {
  it('exposes all counters as numbers', async () => {
    const res = await request(baseUrl, 'GET', '/metrics');

    assert.equal(res.status, 200);
    for (const field of ['matchesStarted', 'matchesCompleted', 'commandsProcessed', 'uptime']) {
      assert.equal(typeof res.body[field], 'number', `${field} must be a number`);
    }
  });

  it('counts started matches, processed commands, and completed matches', async () => {
    resetMetrics();

    const alice = await registerUser(baseUrl);
    const bob = await registerUser(baseUrl);
    const joinA = await request(baseUrl, 'POST', '/api/game/queue/join', { token: alice.token });
    assert.equal(joinA.body.data.matched, false, 'first user should wait in queue');
    const joinB = await request(baseUrl, 'POST', '/api/game/queue/join', { token: bob.token });
    assert.equal(joinB.body.data.matched, true, 'second user should be matched');
    const matchId = joinB.body.data.matchId as string;

    let metrics = (await request(baseUrl, 'GET', '/metrics')).body;
    assert.equal(metrics.matchesStarted, 1);
    assert.equal(metrics.matchesCompleted, 0);
    assert.equal(metrics.commandsProcessed, 0);

    // One command through the same service path REST and WebSocket use.
    const state = getMatch(matchId);
    assert.ok(state, 'match must be active');
    performAction(matchId, state!.players[state!.currentTurn].userId, { type: 'end_turn' });

    // Force a win condition so the next command finishes the match.
    const ongoing = getMatch(matchId);
    assert.ok(ongoing, 'match must still be active');
    ongoing!.players[ongoing!.currentTurn === 0 ? 1 : 0].health = 0;
    performAction(matchId, ongoing!.players[ongoing!.currentTurn].userId, { type: 'end_turn' });
    assert.equal(getMatch(matchId), null, 'finished match should leave the active set');

    metrics = (await request(baseUrl, 'GET', '/metrics')).body;
    assert.equal(metrics.matchesStarted, 1);
    assert.equal(metrics.commandsProcessed, 2);
    assert.equal(metrics.matchesCompleted, 1);
  });
});

describe('GET /metrics with METRICS_TOKEN configured', () => {
  it('rejects missing and wrong tokens, accepts the configured one', async () => {
    process.env.METRICS_TOKEN = 'test-metrics-token';
    try {
      const missing = await request(baseUrl, 'GET', '/metrics');
      assert.equal(missing.status, 401);
      assert.equal(missing.body.code, 'METRICS_AUTH_REQUIRED');

      const wrong = await request(baseUrl, 'GET', '/metrics', { token: 'wrong-token' });
      assert.equal(wrong.status, 401);

      const right = await request(baseUrl, 'GET', '/metrics', { token: 'test-metrics-token' });
      assert.equal(right.status, 200);
      assert.equal(typeof right.body.matchesStarted, 'number');
    } finally {
      delete process.env.METRICS_TOKEN;
    }
  });
});
