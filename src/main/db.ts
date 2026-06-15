import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

let db: Database.Database

export function initDb(): void {
  const dbPath = join(app.getPath('userData'), 'suopwatcher.db')
  db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS websites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      name TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      website_id INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
      content TEXT NOT NULL DEFAULT '',
      content_hash TEXT NOT NULL DEFAULT '',
      scanned_at INTEGER NOT NULL DEFAULT (unixepoch()),
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_site ON snapshots(website_id, scanned_at DESC);
  `)
}

export function getDb(): Database.Database {
  return db
}
