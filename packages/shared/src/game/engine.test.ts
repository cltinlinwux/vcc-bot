import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateDeck, createMatch, applyAction, calculateRatingChange } from './engine.js';
import { getStarterDeck } from './cards.js';
import { DECK_SIZE } from '../types/card.js';

describe('validateDeck', () => {
  it('accepts a valid starter deck', () => {
    const error = validateDeck(getStarterDeck());
    assert.equal(error, null);
  });

  it('rejects wrong deck size', () => {
    const error = validateDeck([{ cardId: 'training-dummy', quantity: 1 }]);
    assert.match(error!, /exactly/);
  });

  it('rejects unknown cards', () => {
    const deck = getStarterDeck();
    deck[0] = { cardId: 'nonexistent', quantity: 1 };
    const error = validateDeck(deck);
    assert.match(error!, /Unknown card/);
  });
});

describe('createMatch', () => {
  it('creates an active match with two players', () => {
    const deck = getStarterDeck();
    const match = createMatch(
      'match-1',
      { userId: 'u1', username: 'alice', displayName: 'Alice', deck },
      { userId: 'u2', username: 'bob', displayName: 'Bob', deck },
    );
    assert.equal(match.status, 'active');
    assert.equal(match.players[0].health, 30);
    assert.equal(match.players[1].hand.length, 5);
  });
});

describe('applyAction', () => {
  it('rejects action when not player turn', () => {
    const deck = getStarterDeck();
    const match = createMatch(
      'match-2',
      { userId: 'u1', username: 'alice', displayName: 'Alice', deck },
      { userId: 'u2', username: 'bob', displayName: 'Bob', deck },
    );
    const notCurrentPlayer = match.players[match.currentTurn === 0 ? 1 : 0].userId;
    assert.throws(
      () => applyAction(match, notCurrentPlayer, { type: 'end_turn' }),
      /Not your turn/,
    );
  });
});

describe('calculateRatingChange', () => {
  it('awards points to higher-rated winner facing lower-rated opponent', () => {
    const { winnerChange, loserChange } = calculateRatingChange(1200, 1000);
    assert.ok(winnerChange > 0);
    assert.ok(loserChange < 0);
    assert.equal(winnerChange + loserChange, 0);
  });
});

describe('DECK_SIZE constant', () => {
  it('starter deck matches required size', () => {
    const total = getStarterDeck().reduce((sum, c) => sum + c.quantity, 0);
    assert.equal(total, DECK_SIZE);
  });
});
