/** TEST-ONLY: apply the committed D1 migrations to a node:sqlite database (D1 is SQLite). */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

export const MIGRATIONS_DIR = resolve('migrations');

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR).filter(file => file.endsWith('.sql')).sort();
}

export function applyMigrations(db: DatabaseSync): void {
  db.exec('PRAGMA foreign_keys = ON;'); // D1 always enforces foreign keys.
  for (const file of migrationFiles()) db.exec(readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8'));
}
