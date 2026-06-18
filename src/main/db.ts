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

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS watch_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      website_id INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
      label TEXT NOT NULL DEFAULT '',
      selector TEXT NOT NULL,
      selector_type TEXT NOT NULL,
      detect TEXT NOT NULL DEFAULT '["content"]',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `)

  const migrate = (sql: string): void => { try { db.exec(sql) } catch { /* already exists */ } }
  migrate(`ALTER TABLE snapshots ADD COLUMN raw_html TEXT NOT NULL DEFAULT ''`)
  migrate(`ALTER TABLE websites ADD COLUMN scan_delay INTEGER NOT NULL DEFAULT 0`)
  migrate(`ALTER TABLE websites ADD COLUMN actions TEXT NOT NULL DEFAULT '[]'`)
  migrate(`ALTER TABLE snapshots ADD COLUMN rule_states TEXT NOT NULL DEFAULT '{}'`)
  migrate(`ALTER TABLE snapshots ADD COLUMN has_changes INTEGER NOT NULL DEFAULT 0`)
}

export function getDb(): Database.Database {
  return db
}
