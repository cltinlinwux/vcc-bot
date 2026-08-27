import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const dbPath = process.env.DATABASE_URL?.replace('file:', '') ?? './data/vcc.db';
const resolvedPath = path.resolve(dbPath);
const dir = path.dirname(resolvedPath);

if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const database = new Database(resolvedPath);

database.pragma('journal_mode = WAL');
database.pragma('foreign_keys = ON');

export const db: Database.Database = database;

export function checkDatabase(): boolean {
  try {
    db.prepare('SELECT 1').get();
    return true;
  } catch {
    return false;
  }
}
