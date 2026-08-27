import { v4 as uuid } from 'uuid';
import { db } from '../db/client.js';
import type { BotLink } from '@vcc/shared';

export function generateLinkCode(userId: string): string {
  const code = uuid().replace(/-/g, '').slice(0, 8).toUpperCase();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  db.prepare('DELETE FROM link_codes WHERE user_id = ?').run(userId);
  db.prepare('INSERT INTO link_codes (code, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
    code,
    userId,
    expiresAt,
    now,
  );

  return code;
}

export function linkBotAccount(data: {
  code: string;
  platform: 'discord' | 'telegram';
  platformUserId: string;
  platformUsername: string;
}): BotLink {
  const row = db.prepare('SELECT * FROM link_codes WHERE code = ?').get(data.code) as
    | { code: string; user_id: string; expires_at: string }
    | undefined;

  if (!row) throw new Error('Invalid link code');
  if (new Date(row.expires_at) < new Date()) throw new Error('Link code expired');

  const existing = db.prepare('SELECT id FROM bot_links WHERE platform = ? AND platform_user_id = ?').get(
    data.platform,
    data.platformUserId,
  );
  if (existing) throw new Error('Platform account already linked');

  const id = uuid();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO bot_links (id, user_id, platform, platform_user_id, platform_username, linked_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, row.user_id, data.platform, data.platformUserId, data.platformUsername, now);

  db.prepare('DELETE FROM link_codes WHERE code = ?').run(data.code);

  return {
    id,
    userId: row.user_id,
    platform: data.platform,
    platformUserId: data.platformUserId,
    platformUsername: data.platformUsername,
    linkedAt: now,
  };
}

export function findBotLink(platform: 'discord' | 'telegram', platformUserId: string): BotLink | null {
  const row = db.prepare('SELECT * FROM bot_links WHERE platform = ? AND platform_user_id = ?').get(
    platform,
    platformUserId,
  ) as {
    id: string;
    user_id: string;
    platform: string;
    platform_user_id: string;
    platform_username: string;
    linked_at: string;
  } | undefined;

  if (!row) return null;

  return {
    id: row.id,
    userId: row.user_id,
    platform: row.platform as BotLink['platform'],
    platformUserId: row.platform_user_id,
    platformUsername: row.platform_username,
    linkedAt: row.linked_at,
  };
}

export function unlinkBotAccount(platform: 'discord' | 'telegram', platformUserId: string): boolean {
  const result = db.prepare('DELETE FROM bot_links WHERE platform = ? AND platform_user_id = ?').run(
    platform,
    platformUserId,
  );
  return result.changes > 0;
}

export function getUserBotLinks(userId: string): BotLink[] {
  const rows = db.prepare('SELECT * FROM bot_links WHERE user_id = ?').all(userId) as {
    id: string;
    user_id: string;
    platform: string;
    platform_user_id: string;
    platform_username: string;
    linked_at: string;
  }[];

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    platform: r.platform as BotLink['platform'],
    platformUserId: r.platform_user_id,
    platformUsername: r.platform_username,
    linkedAt: r.linked_at,
  }));
}
