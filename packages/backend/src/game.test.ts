import './test-setup.js';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_DEFINITIONS, DECK_SIZE, getStarterDeck } from '@vcc/shared';
import type { DeckCard } from '@vcc/shared';
import { startTestServer, request, registerUser, type TestServer } from './test-helpers.js';
import { updateRating } from './services/user.service.js';

let server: TestServer;
let baseUrl: string;

before(async () => {
  server = await startTestServer();
  baseUrl = server.baseUrl;
});

after(async () => {
  await server.close();
});

/** A valid 30-card deck that differs from the starter deck. */
function buildValidDeck(): DeckCard[] {
  const deck: DeckCard[] = [
    { cardId: 'training-dummy', quantity: 3 },
    { cardId: 'ember-knight', quantity: 3 },
    { cardId: 'tide-sage', quantity: 3 },
    { cardId: 'stone-guardian', quantity: 3 },
    { cardId: 'wind-striker', quantity: 3 },
    { cardId: 'flame-drake', quantity: 3 },
    { cardId: 'frost-warden', quantity: 3 },
    { cardId: 'earth-titan', quantity: 3 },
    { cardId: 'storm-harbinger', quantity: 3 },
    { cardId: 'void-sentinel', quantity: 3 },
  ];
  const total = deck.reduce((sum, c) => sum + c.quantity, 0);
  assert.equal(total, DECK_SIZE, 'test fixture must be a full deck');
  return deck;
}

describe('GET /api/game/cards', () => {
  it('returns the full public card catalog without auth', async () => {
    const res = await request(baseUrl, 'GET', '/api/game/cards');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, CARD_DEFINITIONS);
  });

  it('exposes the fields the client needs on every card', async () => {
    const res = await request(baseUrl, 'GET', '/api/game/cards');

    for (const card of res.body.data) {
      for (const field of ['id', 'name', 'rarity', 'element', 'attack', 'defense', 'cost']) {
        assert.ok(field in card, `card ${card.id} missing ${field}`);
      }
    }
  });
});

describe('GET /api/game/leaderboard', () => {
  it('ranks players by rating in descending order', async () => {
    const alice = await registerUser(baseUrl);
    const bob = await registerUser(baseUrl);
    // Both start at 1000; push bob above alice directly in the database.
    updateRating(bob.user.id, 150, 'win');

    const res = await request(baseUrl, 'GET', '/api/game/leaderboard');

    assert.equal(res.status, 200);
    const entries = res.body.data as {
      rank: number;
      userId: string;
      username: string;
      rating: number;
      wins: number;
      losses: number;
    }[];

    entries.forEach((entry, i) => assert.equal(entry.rank, i + 1));
    for (let i = 1; i < entries.length; i += 1) {
      assert.ok(entries[i - 1].rating >= entries[i].rating, 'leaderboard must be sorted by rating');
    }

    const bobEntry = entries.find((e) => e.userId === bob.user.id);
    const aliceEntry = entries.find((e) => e.userId === alice.user.id);
    assert.ok(bobEntry, 'bob should appear on the leaderboard');
    assert.ok(aliceEntry, 'alice should appear on the leaderboard');
    assert.equal(bobEntry!.rating, 1150);
    assert.equal(bobEntry!.wins, 1);
    assert.ok(bobEntry!.rank < aliceEntry!.rank);
  });

  it('is publicly accessible without a token', async () => {
    const res = await request(baseUrl, 'GET', '/api/game/leaderboard');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
  });
});

describe('POST /api/game/decks', () => {
  it('creates a valid deck for the authenticated user', async () => {
    const { user, token } = await registerUser(baseUrl);
    const cards = buildValidDeck();
    const res = await request(baseUrl, 'POST', '/api/game/decks', {
      token,
      body: { name: 'Aggro Elements', cards },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.name, 'Aggro Elements');
    assert.equal(res.body.data.userId, user.id);
    assert.deepEqual(res.body.data.cards, cards);
    // The starter deck created at registration stays the default.
    assert.equal(res.body.data.isDefault, false);
  });

  it('rejects a deck that is not exactly 30 cards', async () => {
    const { token } = await registerUser(baseUrl);
    const res = await request(baseUrl, 'POST', '/api/game/decks', {
      token,
      body: { name: 'Too Small', cards: [{ cardId: 'training-dummy', quantity: 3 }] },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'DECK_INVALID');
    assert.match(res.body.error, /exactly 30/);
  });

  it('rejects a deck containing an unknown card', async () => {
    const { token } = await registerUser(baseUrl);
    const cards = buildValidDeck();
    cards[0] = { cardId: 'no-such-card', quantity: 3 };
    const res = await request(baseUrl, 'POST', '/api/game/decks', {
      token,
      body: { name: 'Fake Cards', cards },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'DECK_INVALID');
    assert.match(res.body.error, /Unknown card: no-such-card/);
  });

  it('rejects card quantities outside 1-3 at the schema level', async () => {
    const { token } = await registerUser(baseUrl);
    for (const quantity of [0, 4]) {
      const res = await request(baseUrl, 'POST', '/api/game/decks', {
        token,
        body: { name: 'Bad Quantities', cards: [{ cardId: 'training-dummy', quantity }] },
      });

      assert.equal(res.status, 400, `expected 400 for quantity ${quantity}`);
      assert.equal(res.body.code, 'VALIDATION_ERROR');
      assert.ok(res.body.details['cards.0.quantity']);
    }
  });

  it('rejects a missing or empty deck name', async () => {
    const { token } = await registerUser(baseUrl);
    const res = await request(baseUrl, 'POST', '/api/game/decks', {
      token,
      body: { name: '', cards: buildValidDeck() },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
    assert.ok(res.body.details.name);
  });

  it('rejects a payload where cards is not an array', async () => {
    const { token } = await registerUser(baseUrl);
    const res = await request(baseUrl, 'POST', '/api/game/decks', {
      token,
      body: { name: 'Broken', cards: 'not-a-list' },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
    assert.ok(res.body.details.cards);
  });

  it('requires authentication', async () => {
    const res = await request(baseUrl, 'POST', '/api/game/decks', {
      body: { name: 'No Auth', cards: buildValidDeck() },
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'AUTH_REQUIRED');
  });
});

describe('GET /api/game/decks', () => {
  it('returns the starter deck created at registration', async () => {
    const { user, token } = await registerUser(baseUrl);
    const res = await request(baseUrl, 'GET', '/api/game/decks', { token });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    const starter = res.body.data[0];
    assert.equal(starter.name, 'Starter Deck');
    assert.equal(starter.userId, user.id);
    assert.equal(starter.isDefault, true);
    assert.deepEqual(starter.cards, getStarterDeck());
  });

  it('only returns decks owned by the requesting user', async () => {
    const owner = await registerUser(baseUrl);
    const other = await registerUser(baseUrl);
    await request(baseUrl, 'POST', '/api/game/decks', {
      token: owner.token,
      body: { name: 'Owner Deck', cards: buildValidDeck() },
    });

    const res = await request(baseUrl, 'GET', '/api/game/decks', { token: other.token });

    assert.equal(res.status, 200);
    const names = res.body.data.map((d: { name: string }) => d.name);
    assert.ok(!names.includes('Owner Deck'));
    assert.ok(res.body.data.every((d: { userId: string }) => d.userId === other.user.id));
  });

  it('requires authentication', async () => {
    const res = await request(baseUrl, 'GET', '/api/game/decks');
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'AUTH_REQUIRED');
  });
});
