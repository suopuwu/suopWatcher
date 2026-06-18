// NOTE: These tests are skipped in CI / plain Node environments because better-sqlite3
// is a native module compiled against Electron's Node ABI. Running it under a different
// Node.js version (different NODE_MODULE_VERSION) causes a binary incompatibility.
// To run these tests: rebuild better-sqlite3 for your system Node version first, OR
// run them inside Electron's test runner.
import fs from 'node:fs'
import { beforeEach, afterEach, describe, it, expect } from 'vitest'
import { initDb, getDb } from '../src/main/db'

const DB_PATH = '/tmp/suopwatcher-test/suopwatcher.db'

function cleanupDb(): void {
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH)
  }
  // Also remove WAL and SHM files if present
  for (const ext of ['-wal', '-shm']) {
    const p = DB_PATH + ext
    if (fs.existsSync(p)) fs.unlinkSync(p)
  }
}

beforeEach(() => {
  cleanupDb()
})

afterEach(() => {
  // Close the db connection so the file can be deleted cleanly
  try {
    const db = getDb()
    if (db && db.open) db.close()
  } catch { /* db may not be initialized */ }
  cleanupDb()
})

describe('initDb()', () => {
  it('creates the database file', () => {
    expect(fs.existsSync(DB_PATH)).toBe(false)
    initDb()
    expect(fs.existsSync(DB_PATH)).toBe(true)
  })

  it('is idempotent — calling it twice does not throw', () => {
    initDb()
    expect(() => initDb()).not.toThrow()
  })
})

describe('getDb()', () => {
  it('returns the same instance created by initDb()', () => {
    initDb()
    const db1 = getDb()
    const db2 = getDb()
    expect(db1).toBe(db2)
    expect(db1).toBeDefined()
  })
})

describe('websites table', () => {
  it('exists with the correct columns', () => {
    initDb()
    const db = getDb()
    const cols = db.pragma('table_info(websites)') as Array<{ name: string }>
    const colNames = cols.map((c) => c.name)
    expect(colNames).toContain('id')
    expect(colNames).toContain('url')
    expect(colNames).toContain('name')
    expect(colNames).toContain('created_at')
    expect(colNames).toContain('scan_delay')
    expect(colNames).toContain('actions')
  })

  it('can insert and retrieve a website', () => {
    initDb()
    const db = getDb()
    db.prepare(`INSERT INTO websites (url, name) VALUES (?, ?)`).run('https://example.com', 'Example')
    const row = db.prepare(`SELECT * FROM websites WHERE url = ?`).get('https://example.com') as {
      id: number
      url: string
      name: string
    }
    expect(row).toBeDefined()
    expect(row.url).toBe('https://example.com')
    expect(row.name).toBe('Example')
  })

  it('enforces UNIQUE constraint on url', () => {
    initDb()
    const db = getDb()
    db.prepare(`INSERT INTO websites (url, name) VALUES (?, ?)`).run('https://unique.com', 'First')
    expect(() => {
      db.prepare(`INSERT INTO websites (url, name) VALUES (?, ?)`).run('https://unique.com', 'Second')
    }).toThrow()
  })
})

describe('snapshots table', () => {
  it('exists with the correct columns', () => {
    initDb()
    const db = getDb()
    const cols = db.pragma('table_info(snapshots)') as Array<{ name: string }>
    const colNames = cols.map((c) => c.name)
    expect(colNames).toContain('id')
    expect(colNames).toContain('website_id')
    expect(colNames).toContain('content')
    expect(colNames).toContain('content_hash')
    expect(colNames).toContain('scanned_at')
    expect(colNames).toContain('error')
    expect(colNames).toContain('raw_html')
    expect(colNames).toContain('rule_states')
    expect(colNames).toContain('has_changes')
  })

  it('cascade-deletes snapshots when their website is deleted', () => {
    initDb()
    const db = getDb()
    const { lastInsertRowid } = db
      .prepare(`INSERT INTO websites (url, name) VALUES (?, ?)`)
      .run('https://cascade.com', 'Cascade Test')
    const websiteId = lastInsertRowid as number

    db.prepare(
      `INSERT INTO snapshots (website_id, content, content_hash) VALUES (?, ?, ?)`
    ).run(websiteId, 'hello', 'abc123')

    const before = db
      .prepare(`SELECT COUNT(*) as cnt FROM snapshots WHERE website_id = ?`)
      .get(websiteId) as { cnt: number }
    expect(before.cnt).toBe(1)

    db.prepare(`DELETE FROM websites WHERE id = ?`).run(websiteId)

    const after = db
      .prepare(`SELECT COUNT(*) as cnt FROM snapshots WHERE website_id = ?`)
      .get(websiteId) as { cnt: number }
    expect(after.cnt).toBe(0)
  })
})

describe('settings table', () => {
  it('exists', () => {
    initDb()
    const db = getDb()
    const cols = db.pragma('table_info(settings)') as Array<{ name: string }>
    expect(cols.length).toBeGreaterThan(0)
    const colNames = cols.map((c) => c.name)
    expect(colNames).toContain('key')
    expect(colNames).toContain('value')
  })

  it('enforces PRIMARY KEY on key (duplicate key throws)', () => {
    initDb()
    const db = getDb()
    db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)`).run('theme', 'dark')
    expect(() => {
      db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)`).run('theme', 'light')
    }).toThrow()
  })
})

describe('watch_rules table', () => {
  it('exists with the correct columns', () => {
    initDb()
    const db = getDb()
    const cols = db.pragma('table_info(watch_rules)') as Array<{ name: string }>
    const colNames = cols.map((c) => c.name)
    expect(colNames).toContain('id')
    expect(colNames).toContain('website_id')
    expect(colNames).toContain('label')
    expect(colNames).toContain('selector')
    expect(colNames).toContain('selector_type')
    expect(colNames).toContain('detect')
    expect(colNames).toContain('created_at')
  })
})
