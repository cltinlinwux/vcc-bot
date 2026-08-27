/**
 * Test environment bootstrap. Must be imported BEFORE any module that touches
 * the database, because db/client.ts resolves DATABASE_URL at load time.
 * Each test file runs in its own process, so each gets an isolated temp DB.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcc-backend-test-'));

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = `file:${path.join(tempDir, 'test.db')}`;
process.env.JWT_SECRET = 'vcc-backend-test-secret-0123456789abcdef';
process.env.JWT_EXPIRES_IN = '1h';
// Low bcrypt cost keeps password hashing fast in tests.
process.env.BCRYPT_ROUNDS = '4';

process.on('exit', () => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});
