/**
 * End-to-end tests for the VCC match flow.
 *
 * Part 1 (REST): registers two fresh users against a running backend, logs
 * them in, joins the matchmaking queue via REST, and verifies a match is
 * created. Requires a backend at API_URL (scripts/test-all.sh starts one).
 *
 * Part 2 (engine): drives a full game in-process via the shared game engine —
 * playing cards, attacking, and ending turns until a winner emerges.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMatch,
  applyAction,
  STARTING_HEALTH,
  STARTING_MANA,
  HAND_SIZE,
  DECK_SIZE,
  type InternalMatchState,
} from '@vcc/shared';

const API = process.env.API_URL ?? 'http://localhost:3001';

interface ApiResult {
  status: number;
  body: any;
}

async function api(path: string, options: RequestInit = {}, token?: string): Promise<ApiResult> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string>),
    },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

describe('e2e match flow (REST)', () => {
  before(async () => {
    try {
      const res = await fetch(`${API}/health`);
      if (!res.ok) throw new Error(`health returned ${res.status}`);
    } catch (err) {
      throw new Error(
        `Backend not reachable at ${API} (${(err as Error).message}). ` +
          'Run via scripts/test-all.sh, which starts the backend automatically.',
        { cause: err },
      );
    }
  });

  it('two users log in, join the queue via REST, and a match is created', async () => {
    const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
    const password = `e2e-pass-${suffix}1`;
    const users = [
      { username: `e2eA${suffix}`.slice(0, 20), email: `e2e-a-${suffix}@vcc.test` },
      { username: `e2eB${suffix}`.slice(0, 20), email: `e2e-b-${suffix}@vcc.test` },
    ];

    for (const user of users) {
      const reg = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ ...user, password }),
      });
      assert.equal(reg.status, 201, `register ${user.username}: ${JSON.stringify(reg.body)}`);
    }

    const tokens: string[] = [];
    const userIds: string[] = [];
    for (const user of users) {
      const login = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: user.email, password }),
      });
      assert.equal(login.status, 200, `login ${user.email}: ${JSON.stringify(login.body)}`);
      tokens.push(login.body.data.tokens.accessToken);
      userIds.push(login.body.data.user.id);
    }

    try {
      // Registration creates a starter deck, so both users are queue-eligible.
      let joinA = await api('/api/game/queue/join', { method: 'POST' }, tokens[0]);
      assert.equal(joinA.status, 200);
      // Tolerate a stale queue occupant from a previous run against a
      // long-lived backend: rejoin so user A is the one left waiting.
      for (let retry = 0; joinA.body.data.matched && retry < 3; retry += 1) {
        joinA = await api('/api/game/queue/join', { method: 'POST' }, tokens[0]);
        assert.equal(joinA.status, 200);
      }
      assert.equal(joinA.body.data.matched, false, 'first user should wait in queue');

      const joinB = await api('/api/game/queue/join', { method: 'POST' }, tokens[1]);
      assert.equal(joinB.status, 200);
      const result = joinB.body.data;
      assert.equal(result.matched, true, 'second user should be matched');
      assert.ok(result.matchId, 'match id should be returned');
      assert.deepEqual(
        [...result.playerIds].sort(),
        [...userIds].sort(),
        'match should pair exactly the two queued users',
      );

      const state = result.state;
      assert.equal(state.id, result.matchId);
      assert.equal(state.status, 'active');
      assert.equal(state.turnNumber, 1);
      assert.equal(state.winnerId, null);
      assert.ok(state.startedAt, 'match should have a start timestamp');
      const stateIds = state.players.map((p: { userId: string }) => p.userId).sort();
      assert.deepEqual(stateIds, [...userIds].sort());
      for (const player of state.players) {
        assert.equal(player.health, STARTING_HEALTH);
        assert.equal(player.deckRemaining, DECK_SIZE - HAND_SIZE);
      }
    } finally {
      // Best effort: never leave a test user stuck in the queue.
      for (const token of tokens) {
        await api('/api/game/queue/leave', { method: 'POST' }, token).catch(() => {});
      }
    }
  });
});

describe('game flow (engine)', () => {
  // All training dummies (1/1, cost 1, no ability) keep the flow
  // deterministic regardless of deck shuffling and starting player.
  const dummyDeck = [{ cardId: 'training-dummy', quantity: DECK_SIZE }];

  function newMatch(id: string): InternalMatchState {
    return createMatch(
      id,
      { userId: 'p1', username: 'alice', displayName: 'Alice', deck: dummyDeck },
      { userId: 'p2', username: 'bob', displayName: 'Bob', deck: dummyDeck },
    );
  }

  it('playing a card moves it to the field and spends mana', () => {
    const state = newMatch('flow-play-card');
    const player = state.players[state.currentTurn];
    const card = player.hand[0];
    const handBefore = player.hand.length;
    const manaBefore = player.mana;

    applyAction(state, player.userId, { type: 'play_card', cardInstanceId: card.instanceId });

    assert.equal(player.hand.length, handBefore - 1);
    assert.equal(player.field.length, 1);
    assert.equal(player.field[0].instanceId, card.instanceId);
    assert.equal(player.mana, manaBefore - card.definition.cost);
  });

  it('ending a turn passes priority, ramps mana, and draws a card', () => {
    const state = newMatch('flow-end-turn');
    const first = state.currentTurn;
    const next = state.players[first === 0 ? 1 : 0];
    const nextHandBefore = next.hand.length;
    const nextDeckBefore = next.deck.length;

    applyAction(state, state.players[first].userId, { type: 'end_turn' });

    assert.notEqual(state.currentTurn, first);
    assert.equal(state.turnNumber, 2);
    assert.equal(next.maxMana, STARTING_MANA + 1);
    assert.equal(next.mana, next.maxMana);
    assert.equal(next.hand.length, nextHandBefore + 1);
    assert.equal(next.deck.length, nextDeckBefore - 1);
  });

  it('plays cards and ends turns until a winner is decided', () => {
    let state = newMatch('flow-full-game');
    assert.equal(state.status, 'active');

    for (let safety = 0; safety < 200 && state.status === 'active'; safety += 1) {
      const player = state.players[state.currentTurn];

      // Play as many affordable cards as the field allows.
      while (state.status === 'active' && player.field.length < 5) {
        const playable = player.hand.find((c) => c.definition.cost <= player.mana);
        if (!playable) break;
        state = applyAction(state, player.userId, {
          type: 'play_card',
          cardInstanceId: playable.instanceId,
        });
      }

      // Attack the opponent's face with every unit on the field.
      for (const attacker of [...player.field]) {
        if (state.status !== 'active') break;
        state = applyAction(state, player.userId, {
          type: 'attack',
          attackerInstanceId: attacker.instanceId,
        });
      }

      if (state.status === 'active') {
        state = applyAction(state, player.userId, { type: 'end_turn' });
      }
    }

    assert.equal(state.status, 'finished', 'game should finish within the safety limit');
    assert.ok(state.winnerId, 'a winner should be recorded');
    assert.ok(state.finishedAt, 'finish timestamp should be recorded');

    const winner = state.players.find((p) => p.userId === state.winnerId);
    const loser = state.players.find((p) => p.userId !== state.winnerId);
    assert.ok(winner, 'winner must be one of the match players');
    assert.ok(loser!.health <= 0, 'loser should have been reduced to 0 health');
    assert.ok(winner!.health > 0, 'winner should still have health remaining');
    assert.match(state.actionLog.at(-1)!, /Match won by/);
  });
});
