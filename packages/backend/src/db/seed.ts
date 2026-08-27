import { v4 as uuid } from 'uuid';
import bcrypt from 'bcryptjs';
import { db } from './client.js';
import { migrate } from './migrate.js';
import { CARD_DEFINITIONS, getStarterDeck } from '@vcc/shared';

export function seed(): void {
  migrate();

  const existing = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (existing.count > 0) {
    console.log('Database already seeded, skipping.');
    return;
  }

  const now = new Date().toISOString();
  const passwordHash = bcrypt.hashSync('demo1234', 12);

  const demoUsers = [
    { username: 'demo', email: 'demo@vcc.game', displayName: 'Demo Player' },
    { username: 'rival', email: 'rival@vcc.game', displayName: 'Rival Player' },
  ];

  for (const user of demoUsers) {
    const id = uuid();
    db.prepare(`
      INSERT INTO users (id, username, email, password_hash, display_name, role, rating, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'player', 1000, ?, ?)
    `).run(id, user.username, user.email, passwordHash, user.displayName, now, now);

    db.prepare(`
      INSERT INTO decks (id, user_id, name, cards_json, is_default, created_at, updated_at)
      VALUES (?, ?, 'Starter Deck', ?, 1, ?, ?)
    `).run(uuid(), id, JSON.stringify(getStarterDeck()), now, now);
  }

  console.log(`Seeded ${demoUsers.length} demo users and starter decks.`);
  console.log(`Card catalog: ${CARD_DEFINITIONS.length} cards available.`);
  console.log('Demo login: demo@vcc.game / demo1234');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed();
}
