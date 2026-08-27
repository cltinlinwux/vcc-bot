import { v4 as uuid } from 'uuid';
import { db } from '../db/client.js';
import { validateDeck } from '@vcc/shared';
import type { Deck, DeckCard } from '@vcc/shared';

interface DeckRow {
  id: string;
  user_id: string;
  name: string;
  cards_json: string;
  is_default: number;
  created_at: string;
  updated_at: string;
}

function rowToDeck(row: DeckRow): Deck {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    cards: JSON.parse(row.cards_json) as DeckCard[],
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getUserDecks(userId: string): Deck[] {
  const rows = db.prepare('SELECT * FROM decks WHERE user_id = ? ORDER BY is_default DESC, created_at ASC').all(userId) as DeckRow[];
  return rows.map(rowToDeck);
}

export function getDefaultDeck(userId: string): Deck | null {
  const row = db.prepare('SELECT * FROM decks WHERE user_id = ? AND is_default = 1 LIMIT 1').get(userId) as DeckRow | undefined;
  return row ? rowToDeck(row) : null;
}

export function createDeck(userId: string, name: string, cards: DeckCard[]): Deck {
  const error = validateDeck(cards);
  if (error) throw new Error(error);

  const now = new Date().toISOString();
  const id = uuid();
  const hasDefault = db.prepare('SELECT id FROM decks WHERE user_id = ? AND is_default = 1').get(userId);

  db.prepare(`
    INSERT INTO decks (id, user_id, name, cards_json, is_default, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, name, JSON.stringify(cards), hasDefault ? 0 : 1, now, now);

  return rowToDeck(db.prepare('SELECT * FROM decks WHERE id = ?').get(id) as DeckRow);
}

export function createStarterDeck(userId: string, cards: DeckCard[]): Deck {
  const now = new Date().toISOString();
  const id = uuid();
  db.prepare(`
    INSERT INTO decks (id, user_id, name, cards_json, is_default, created_at, updated_at)
    VALUES (?, ?, 'Starter Deck', ?, 1, ?, ?)
  `).run(id, userId, JSON.stringify(cards), now, now);
  return rowToDeck(db.prepare('SELECT * FROM decks WHERE id = ?').get(id) as DeckRow);
}
