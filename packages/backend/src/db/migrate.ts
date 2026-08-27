import { db } from './client.js';

const migrations = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'player',
    avatar_url TEXT,
    rating INTEGER NOT NULL DEFAULT 1000,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    draws INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_users_rating ON users(rating DESC)`,
  `CREATE TABLE IF NOT EXISTS decks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    cards_json TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_decks_user ON decks(user_id)`,
  `CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    player1_id TEXT NOT NULL REFERENCES users(id),
    player2_id TEXT NOT NULL REFERENCES users(id),
    winner_id TEXT REFERENCES users(id),
    state_json TEXT NOT NULL,
    player1_rating_change INTEGER NOT NULL DEFAULT 0,
    player2_rating_change INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    started_at TEXT,
    finished_at TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_matches_players ON matches(player1_id, player2_id)`,
  `CREATE INDEX IF NOT EXISTS idx_matches_finished ON matches(finished_at DESC)`,
  `CREATE TABLE IF NOT EXISTS bot_links (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    platform_user_id TEXT NOT NULL,
    platform_username TEXT NOT NULL,
    linked_at TEXT NOT NULL,
    UNIQUE(platform, platform_user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bot_links_user ON bot_links(user_id)`,
  `CREATE TABLE IF NOT EXISTS link_codes (
    code TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`,
];

export function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const current = db.prepare('SELECT MAX(version) as v FROM schema_migrations').get() as { v: number | null };
  const currentVersion = current?.v ?? 0;

  for (let i = currentVersion; i < migrations.length; i += 1) {
    db.exec(migrations[i]);
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      i + 1,
      new Date().toISOString(),
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate();
  console.log('Database migrations applied.');
}
