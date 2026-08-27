import { v4 as uuid } from 'uuid';
import bcrypt from 'bcryptjs';
import { db } from '../db/client.js';
import type { User, UserProfile } from '@vcc/shared';

interface UserRow {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  display_name: string;
  role: string;
  avatar_url: string | null;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  created_at: string;
  updated_at: string;
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    displayName: row.display_name,
    role: row.role as User['role'],
    avatarUrl: row.avatar_url,
    rating: row.rating,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toProfile(user: User): UserProfile {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    rating: user.rating,
    wins: user.wins,
    losses: user.losses,
    draws: user.draws,
  };
}

export function findUserByEmail(email: string): User | null {
  const row = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email) as UserRow | undefined;
  return row ? rowToUser(row) : null;
}

export function findUserById(id: string): User | null {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  return row ? rowToUser(row) : null;
}

export function findUserByUsername(username: string): User | null {
  const row = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username) as UserRow | undefined;
  return row ? rowToUser(row) : null;
}

export function getPasswordHash(email: string): string | null {
  const row = db.prepare('SELECT password_hash FROM users WHERE email = ? COLLATE NOCASE').get(email) as { password_hash: string } | undefined;
  return row?.password_hash ?? null;
}

export function createUser(data: {
  username: string;
  email: string;
  password: string;
  displayName?: string;
}): User {
  const now = new Date().toISOString();
  const id = uuid();
  const rounds = parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10);
  const passwordHash = bcrypt.hashSync(data.password, rounds);

  db.prepare(`
    INSERT INTO users (id, username, email, password_hash, display_name, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'player', ?, ?)
  `).run(id, data.username, data.email, passwordHash, data.displayName ?? data.username, now, now);

  return findUserById(id)!;
}

export function verifyPassword(email: string, password: string): User | null {
  const hash = getPasswordHash(email);
  if (!hash) return null;
  if (!bcrypt.compareSync(password, hash)) return null;
  return findUserByEmail(email);
}

export function updateRating(userId: string, change: number, result: 'win' | 'loss' | 'draw'): void {
  const column = result === 'win' ? 'wins' : result === 'loss' ? 'losses' : 'draws';
  db.prepare(`
    UPDATE users SET rating = rating + ?, ${column} = ${column} + 1, updated_at = ? WHERE id = ?
  `).run(change, new Date().toISOString(), userId);
}

export function getLeaderboard(limit = 50): UserProfile[] {
  const rows = db.prepare(`
    SELECT id, username, display_name, avatar_url, rating, wins, losses, draws
    FROM users ORDER BY rating DESC LIMIT ?
  `).all(limit) as Pick<UserRow, 'id' | 'username' | 'display_name' | 'avatar_url' | 'rating' | 'wins' | 'losses' | 'draws'>[];

  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    rating: r.rating,
    wins: r.wins,
    losses: r.losses,
    draws: r.draws,
  }));
}
