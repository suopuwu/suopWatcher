import { ipcMain, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { diffLines } from 'diff'
import { getDb } from './db'
import { scanSite, getScanConfig, processScan } from './scanner'

interface DbWatchRule {
  id: number
  website_id: number
  label: string
  selector: string
  selector_type: string
  detect: string
  created_at: number
}

interface RuleStateEntry {
  exists: boolean
  text: string
  childCount: number
  attrs: Record<string, string>
  regexCounts?: Record<string, number>
}

function evaluateRuleChange(
  rule: DbWatchRule,
  prev: RuleStateEntry | undefined,
  curr: RuleStateEntry | undefined,
) {
  const detect: string[] = JSON.parse(rule.detect)
  const triggers: string[] = []
  if (!curr || !prev) return { rule: { ...rule, detect }, previous: prev ?? null, current: curr ?? { exists: false, text: '', childCount: 0, attrs: {} }, triggers }
  for (const d of detect) {
    if (d === 'exists' && (prev?.exists ?? true) !== curr.exists) triggers.push(d)
    else if (d === 'content' && (prev?.text ?? '') !== curr.text) triggers.push(d)
    else if (d === 'count' && (prev?.childCount ?? -1) !== curr.childCount) triggers.push(d)
    else if (d.startsWith('attr:')) {
      const attr = d.slice(5)
      if ((prev?.attrs[attr] ?? '') !== (curr.attrs[attr] ?? '')) triggers.push(d)
    } else if (d.startsWith('regex_count:')) {
      const pattern = d.slice(12)
      if ((prev?.regexCounts?.[pattern] ?? 0) !== (curr?.regexCounts?.[pattern] ?? 0)) triggers.push(d)
    }
  }
  return { rule: { ...rule, detect }, previous: prev ?? null, current: curr, triggers }
}

export function registerIpcHandlers(): void {
  const db = getDb()

  ipcMain.handle('shell:open', (_e, { url }: { url: string }) => shell.openExternal(url))

  ipcMain.handle('settings:get', (_e, { key }: { key: string }) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    return row ? JSON.parse(row.value) : null
  })

  ipcMain.handle('settings:set', (_e, { key, value }: { key: string; value: unknown }) => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(value))
  })

  ipcMain.on('window:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
  ipcMain.on('window:maximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    win.isMaximized() ? win.unmaximize() : win.maximize()
  })
  ipcMain.on('window:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close())
  ipcMain.on('window:toggle-frame', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return

    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('native_frame') as { value: string } | undefined
    const current: boolean = row ? JSON.parse(row.value) : true
    const next = !current
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('native_frame', JSON.stringify(next))

    const bounds = win.getBounds()
    const newWin = new BrowserWindow({
      ...bounds,
      show: false,
      frame: next,
      ...(next ? { backgroundColor: '#1a1b1e' } : { transparent: true }),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        webviewTag: true
      }
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      newWin.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      newWin.loadFile(join(__dirname, '../renderer/index.html'))
    }

    newWin.removeMenu()
    newWin.once('ready-to-show', () => {
      newWin.show()
      win.close()
    })
  })

  ipcMain.handle('sites:list', () => {
    return db
      .prepare(
        `SELECT w.*,
          (SELECT scanned_at FROM snapshots WHERE website_id = w.id ORDER BY scanned_at DESC LIMIT 1) AS last_scanned,
          (SELECT error FROM snapshots WHERE website_id = w.id ORDER BY scanned_at DESC LIMIT 1) AS last_error,
          COALESCE(
            (SELECT has_changes FROM snapshots WHERE website_id = w.id AND error IS NULL ORDER BY scanned_at DESC LIMIT 1),
            0
          ) AS has_changes
        FROM websites w
        ORDER BY w.created_at ASC`
      )
      .all()
  })

  ipcMain.handle('sites:add', (_e, { url, name }: { url: string; name?: string }) => {
    const trimmed = url.trim()
    try {
      new URL(trimmed)
    } catch {
      throw new Error('Invalid URL')
    }
    try {
      return db
        .prepare('INSERT INTO websites (url, name) VALUES (?, ?) RETURNING *')
        .get(trimmed, name?.trim() || null) as object
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new Error('This URL is already in your watchlist')
      }
      throw err
    }
  })

  ipcMain.handle('sites:delete', (_e, { id }: { id: number }) => {
    db.prepare('DELETE FROM websites WHERE id = ?').run(id)
  })

  ipcMain.handle('scan:run', async (_e, { siteId }: { siteId?: number }) => {
    const sites = siteId
      ? (db.prepare('SELECT id, url FROM websites WHERE id = ?').all(siteId) as { id: number; url: string }[])
      : (db.prepare('SELECT id, url FROM websites').all() as { id: number; url: string }[])

    return Promise.all(
      sites.map(async (site) => {
        const result = await scanSite(site.id, site.url)
        return { siteId: site.id, url: site.url, ...result }
      })
    )
  })

  ipcMain.handle('scan:get-config', (_e, { siteId }: { siteId: number }) =>
    getScanConfig(siteId)
  )

  ipcMain.handle('scan:process', async (_e, { siteId, html, error, ruleStates }: { siteId: number; html: string; error?: string; ruleStates?: Record<number, RuleStateEntry> }) =>
    processScan(siteId, html, error, ruleStates)
  )

  ipcMain.handle('rules:list', (_e, { siteId }: { siteId: number }) =>
    (db.prepare('SELECT * FROM watch_rules WHERE website_id = ? ORDER BY created_at ASC').all(siteId) as DbWatchRule[])
      .map((r) => ({ ...r, detect: JSON.parse(r.detect) }))
  )

  ipcMain.handle('rules:add', (_e, { siteId, label, selector, selector_type, detect }: { siteId: number; label: string; selector: string; selector_type: string; detect: string[] }) => {
    const row = db.prepare('INSERT INTO watch_rules (website_id, label, selector, selector_type, detect) VALUES (?, ?, ?, ?, ?) RETURNING *')
      .get(siteId, label, selector, selector_type, JSON.stringify(detect)) as DbWatchRule
    return { ...row, detect: JSON.parse(row.detect) }
  })

  ipcMain.handle('rules:delete', (_e, { id }: { id: number }) =>
    db.prepare('DELETE FROM watch_rules WHERE id = ?').run(id)
  )

  ipcMain.handle('snapshots:update-rule-states', (_e, { siteId, ruleStates }: { siteId: number; ruleStates: Record<number, RuleStateEntry> }) => {
    const row = db.prepare('SELECT id, rule_states FROM snapshots WHERE website_id = ? AND error IS NULL ORDER BY scanned_at DESC LIMIT 1').get(siteId) as
      { id: number; rule_states: string } | undefined
    if (!row) return
    const existing: Record<number, RuleStateEntry> = JSON.parse(row.rule_states || '{}')
    db.prepare('UPDATE snapshots SET rule_states = ? WHERE id = ?').run(
      JSON.stringify({ ...existing, ...ruleStates }), row.id
    )
  })

  ipcMain.handle('sites:update', (_e, { id, scan_delay, actions }: { id: number; scan_delay: number; actions: object[] }) => {
    db.prepare('UPDATE websites SET scan_delay = ?, actions = ? WHERE id = ?')
      .run(scan_delay, JSON.stringify(actions), id)
  })

  ipcMain.handle('snapshots:diff', (_e, { siteId }: { siteId: number }) => {
    const rows = db
      .prepare(
        'SELECT id, content, content_hash, scanned_at, raw_html, rule_states, has_changes FROM snapshots WHERE website_id = ? AND error IS NULL ORDER BY scanned_at DESC LIMIT 2'
      )
      .all(siteId) as Array<{ id: number; content: string; content_hash: string; scanned_at: number; raw_html: string; rule_states: string; has_changes: number }>

    if (rows.length === 0) return null

    const [latest, previous] = rows

    if (!previous) {
      return { hasChanges: false, latest, previous: null, diff: [], ruleChanges: [] }
    }

    const hasChanges = latest.has_changes === 1
    const changes = diffLines(previous.content, latest.content)

    const diff = changes.map((c) => ({
      type: c.added ? 'added' : c.removed ? 'removed' : 'unchanged',
      value: c.value,
      count: c.count
    }))

    const rules = db.prepare('SELECT * FROM watch_rules WHERE website_id = ? ORDER BY created_at ASC').all(siteId) as DbWatchRule[]
    const latestStates: Record<number, RuleStateEntry> = JSON.parse(latest.rule_states || '{}')
    const prevStates: Record<number, RuleStateEntry> = JSON.parse(previous.rule_states || '{}')
    const ruleChanges = rules
      .map((r) => evaluateRuleChange(r, prevStates[r.id], latestStates[r.id]))
      .filter((rc) => rc.triggers.length > 0)

    return { hasChanges, latest, previous, diff, ruleChanges }
  })

  ipcMain.handle('snapshots:history', (_e, { siteId }: { siteId: number }) => {
    return db
      .prepare(
        'SELECT id, scanned_at, content_hash, error FROM snapshots WHERE website_id = ? ORDER BY scanned_at DESC LIMIT 50'
      )
      .all(siteId)
  })

  // Last 5 unique content versions (by hash) with raw HTML for iframe display
  ipcMain.handle('snapshots:unique-history', (_e, { siteId }: { siteId: number }) => {
    return db
      .prepare(
        `SELECT s.id, s.scanned_at, s.content_hash, s.raw_html
         FROM snapshots s
         WHERE s.id IN (
           SELECT MAX(id) FROM snapshots
           WHERE website_id = ? AND error IS NULL
           GROUP BY content_hash
         )
         ORDER BY s.scanned_at DESC
         LIMIT 5`
      )
      .all(siteId)
  })

  ipcMain.handle(
    'snapshots:search',
    (_e, { siteId, pattern, isRegex }: { siteId: number; pattern: string; isRegex: boolean }) => {
      const row = db
        .prepare(
          'SELECT content FROM snapshots WHERE website_id = ? AND error IS NULL ORDER BY scanned_at DESC LIMIT 1'
        )
        .get(siteId) as { content: string } | undefined

      if (!row || !pattern) return []

      const lines = row.content.split('\n')
      const results: Array<{ line: number; content: string; matches: Array<{ start: number; end: number }> }> = []

      let re: RegExp | null = null
      if (isRegex) {
        try {
          re = new RegExp(pattern, 'gi')
        } catch {
          return { error: 'Invalid regex pattern' }
        }
      }

      const lowerPattern = pattern.toLowerCase()

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const matches: Array<{ start: number; end: number }> = []

        if (re) {
          re.lastIndex = 0
          let m: RegExpExecArray | null
          while ((m = re.exec(line)) !== null) {
            matches.push({ start: m.index, end: m.index + m[0].length })
            if (m[0].length === 0) re.lastIndex++
          }
        } else {
          const lower = line.toLowerCase()
          let idx = lower.indexOf(lowerPattern)
          while (idx !== -1) {
            matches.push({ start: idx, end: idx + lowerPattern.length })
            idx = lower.indexOf(lowerPattern, idx + 1)
          }
        }

        if (matches.length > 0) {
          results.push({ line: i + 1, content: line, matches })
        }
      }

      return results
    }
  )
}
