import './test-setup.js';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, request, registerUser, type TestServer } from './test-helpers.js';
import { signToken } from './middleware/auth.js';

let server: TestServer;
let baseUrl: string;

before(async () => {
  server = await startTestServer();
  baseUrl = server.baseUrl;
});

after(async () => {
  await server.close();
});

describe('POST /api/auth/register', () => {
  it('creates a user and returns profile plus access token', async () => {
    const res = await request(baseUrl, 'POST', '/api/auth/register', {
      body: {
        username: 'alice_1',
        email: 'alice@example.com',
        password: 'password123',
        displayName: 'Alice',
      },
    });

    assert.equal(res.status, 201);
    const { user, tokens } = res.body.data;
    assert.equal(user.username, 'alice_1');
    assert.equal(user.displayName, 'Alice');
    assert.equal(user.rating, 1000);
    assert.equal(user.wins, 0);
    assert.equal(user.losses, 0);
    assert.ok(user.id);
    assert.ok(tokens.accessToken.length > 20);
    assert.ok(tokens.expiresIn);
    // Profile must not leak sensitive fields.
    assert.equal(user.email, undefined);
    assert.equal(user.passwordHash, undefined);
  });

  it('defaults displayName to username when omitted', async () => {
    const res = await request(baseUrl, 'POST', '/api/auth/register', {
      body: { username: 'bob_2', email: 'bob@example.com', password: 'password123' },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.user.displayName, 'bob_2');
  });

  it('rejects a duplicate email with 409 EMAIL_EXISTS', async () => {
    const { input } = await registerUser(baseUrl);
    const res = await request(baseUrl, 'POST', '/api/auth/register', {
      body: { username: 'different_name', email: input.email, password: 'password123' },
    });

    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'EMAIL_EXISTS');
  });

  it('rejects a duplicate email regardless of case', async () => {
    const { input } = await registerUser(baseUrl);
    const res = await request(baseUrl, 'POST', '/api/auth/register', {
      body: { username: 'another_name', email: input.email.toUpperCase(), password: 'password123' },
    });

    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'EMAIL_EXISTS');
  });

  it('rejects a duplicate username with 409 USERNAME_EXISTS', async () => {
    const { input } = await registerUser(baseUrl);
    const res = await request(baseUrl, 'POST', '/api/auth/register', {
      body: { username: input.username, email: 'unused@example.com', password: 'password123' },
    });

    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'USERNAME_EXISTS');
  });

  it('rejects an invalid email with a validation error', async () => {
    const res = await request(baseUrl, 'POST', '/api/auth/register', {
      body: { username: 'valid_name', email: 'not-an-email', password: 'password123' },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
    assert.ok(res.body.details.email);
  });

  it('rejects a password shorter than 8 characters', async () => {
    const res = await request(baseUrl, 'POST', '/api/auth/register', {
      body: { username: 'valid_name', email: 'short-pw@example.com', password: 'short' },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
    assert.ok(res.body.details.password);
  });

  it('rejects usernames with invalid characters or length', async () => {
    for (const username of ['has space', 'bad!char', 'ab', 'x'.repeat(21)]) {
      const res = await request(baseUrl, 'POST', '/api/auth/register', {
        body: { username, email: 'chars@example.com', password: 'password123' },
      });

      assert.equal(res.status, 400, `expected 400 for username ${JSON.stringify(username)}`);
      assert.equal(res.body.code, 'VALIDATION_ERROR');
      assert.ok(res.body.details.username);
    }
  });

  it('rejects an empty body listing all missing fields', async () => {
    const res = await request(baseUrl, 'POST', '/api/auth/register', { body: {} });

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
    assert.ok(res.body.details.username);
    assert.ok(res.body.details.email);
    assert.ok(res.body.details.password);
  });
});

describe('POST /api/auth/login', () => {
  it('returns the user profile and token for valid credentials', async () => {
    const { input, user } = await registerUser(baseUrl);
    const res = await request(baseUrl, 'POST', '/api/auth/login', {
      body: { email: input.email, password: input.password },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.id, user.id);
    assert.equal(res.body.data.user.username, input.username);
    assert.ok(res.body.data.tokens.accessToken.length > 20);
  });

  it('accepts the email with different casing', async () => {
    const { input, user } = await registerUser(baseUrl);
    const res = await request(baseUrl, 'POST', '/api/auth/login', {
      body: { email: input.email.toUpperCase(), password: input.password },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.id, user.id);
  });

  it('rejects a wrong password with 401 INVALID_CREDENTIALS', async () => {
    const { input } = await registerUser(baseUrl);
    const res = await request(baseUrl, 'POST', '/api/auth/login', {
      body: { email: input.email, password: 'wrong-password' },
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'INVALID_CREDENTIALS');
  });

  it('rejects an unknown email with 401 INVALID_CREDENTIALS', async () => {
    const res = await request(baseUrl, 'POST', '/api/auth/login', {
      body: { email: 'nobody@example.com', password: 'password123' },
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'INVALID_CREDENTIALS');
  });

  it('rejects a malformed payload with a validation error', async () => {
    const res = await request(baseUrl, 'POST', '/api/auth/login', {
      body: { email: 'not-an-email', password: '' },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
    assert.ok(res.body.details.email);
    assert.ok(res.body.details.password);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the authenticated user profile', async () => {
    const { user, token } = await registerUser(baseUrl);
    const res = await request(baseUrl, 'GET', '/api/auth/me', { token });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.id, user.id);
    assert.equal(res.body.data.username, user.username);
    assert.equal(res.body.data.rating, 1000);
  });

  it('rejects requests without an Authorization header', async () => {
    const res = await request(baseUrl, 'GET', '/api/auth/me');

    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'AUTH_REQUIRED');
  });

  it('rejects a garbage token', async () => {
    const res = await request(baseUrl, 'GET', '/api/auth/me', { token: 'not.a.jwt' });

    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'AUTH_INVALID');
  });

  it('returns 404 for a valid token whose user no longer exists', async () => {
    const token = signToken({ userId: 'ghost-user-id', username: 'ghost', role: 'player' });
    const res = await request(baseUrl, 'GET', '/api/auth/me', { token });

    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'USER_NOT_FOUND');
  });
});
