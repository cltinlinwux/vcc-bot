import './test-setup.js';
import express from 'express';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { migrate } from './db/migrate.js';
import { authRouter, gameRouter, botRouter } from './routes/index.js';
import { errorHandler } from './middleware/validate.js';

export interface TestServer {
  baseUrl: string;
  close(): Promise<void>;
}

/**
 * Boots the API on an ephemeral port against the temp database configured by
 * test-setup. Mirrors the production app from index.ts minus rate limiting,
 * websockets, and static frontend serving.
 */
export async function startTestServer(): Promise<TestServer> {
  migrate();

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/auth', authRouter);
  app.use('/api/game', gameRouter);
  app.use('/api/bot', botRouter);
  app.use(errorHandler);

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

export interface ApiResponse {
  status: number;
  // Response shapes vary per endpoint; tests assert the parts they care about.
  body: any;
}

export async function request(
  baseUrl: string,
  method: string,
  requestPath: string,
  options: { body?: unknown; token?: string } = {},
): Promise<ApiResponse> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const res = await fetch(`${baseUrl}${requestPath}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
  displayName?: string;
}

export interface RegisteredUser {
  input: RegisterInput;
  user: {
    id: string;
    username: string;
    displayName: string;
    rating: number;
    wins: number;
    losses: number;
    draws: number;
  };
  token: string;
}

let userCounter = 0;

/** Registers a fresh user through the real endpoint and returns its token. */
export async function registerUser(
  baseUrl: string,
  overrides: Partial<RegisterInput> = {},
): Promise<RegisteredUser> {
  userCounter += 1;
  const input: RegisterInput = {
    username: `player${userCounter}`,
    email: `player${userCounter}@example.com`,
    password: 'sup3r-secret-pw',
    ...overrides,
  };

  const res = await request(baseUrl, 'POST', '/api/auth/register', { body: input });
  if (res.status !== 201) {
    throw new Error(`Test user registration failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return { input, user: res.body.data.user, token: res.body.data.tokens.accessToken };
}
