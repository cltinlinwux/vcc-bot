import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from '../db/migrate.js';
import { createUser, verifyPassword } from '../services/user.service.js';
import { createStarterDeck } from '../services/deck.service.js';
import { getStarterDeck } from '@vcc/shared';

describe('user service', () => {
  before(() => {
    migrate();
  });

  it('creates and verifies a user', () => {
    const suffix = Date.now();
    const user = createUser({
      username: `testuser${suffix}`,
      email: `test${suffix}@vcc.game`,
      password: 'password1',
    });
    createStarterDeck(user.id, getStarterDeck());
    assert.equal(user.username, `testuser${suffix}`);

    const verified = verifyPassword(`test${suffix}@vcc.game`, 'password1');
    assert.ok(verified);
    assert.equal(verified!.id, user.id);
  });

  it('rejects wrong password', () => {
    assert.equal(verifyPassword('nonexistent@vcc.game', 'wrongpass1'), null);
  });
});
