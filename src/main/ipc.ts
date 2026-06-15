import { ipcMain } from 'electron'
import { diffLines } from 'diff'
import { getDb } from './db'
import { scanSite } from './scanner'

export function registerIpcHandlers(): void {
  const db = getDb()

  ipcMain.handle('sites:list', () => {
    return db
      .prepare(
        `SELECT w.*,
          (SELECT scanned_at FROM snapshots WHERE website_id = w.id ORDER BY scanned_at DESC LIMIT 1) AS last_scanned,
          (SELECT error FROM snapshots WHERE website_id = w.id ORDER BY scanned_at DESC LIMIT 1) AS last_error,
          (
            SELECT CASE WHEN COUNT(DISTINCT content_hash) > 1 THEN 1 ELSE 0 END
            FROM (
              SELECT content_hash FROM snapshots
              WHERE website_id = w.id AND error IS NULL
              ORDER BY scanned_at DESC LIMIT 2
            )
          ) AS has_changes
        FROM websites w
        ORDER BY w.created_at ASC`
      )
      .all()
  })

  ipcMain.handle('sites:add', (_e, { url, name }: { url: string; name?: string }) => {
    try {
      new URL(url)
    } catch {
      throw new Error('Invalid URL')
    }
    const result = db
      .prepare('INSERT INTO websites (url, name) VALUES (?, ?) RETURNING *')
      .get(url.trim(), name?.trim() || null) as object
    return result
  })

  ipcMain.handle('sites:delete', (_e, { id }: { id: number }) => {
    db.prepare('DELETE FROM websites WHERE id = ?').run(id)
  })

  ipcMain.handle('scan:run', async (_e, { siteId }: { siteId?: number }) => {
    const sites = siteId
      ? (db.prepare('SELECT id, url FROM websites WHERE id = ?').all(siteId) as { id: number; url: string }[])
      : (db.prepare('SELECT id, url FROM websites').all() as { id: number; url: string }[])

    const results = await Promise.all(
      sites.map(async (site) => {
        const result = await scanSite(site.id, site.url)
        return { siteId: site.id, url: site.url, ...result }
      })
    )

    return results
  })

  ipcMain.handle('snapshots:diff', (_e, { siteId }: { siteId: number }) => {
    const rows = db
      .prepare(
        'SELECT * FROM snapshots WHERE website_id = ? AND error IS NULL ORDER BY scanned_at DESC LIMIT 2'
      )
      .all(siteId) as Array<{ id: number; content: string; content_hash: string; scanned_at: number }>

    if (rows.length === 0) return null

    const [latest, previous] = rows

    if (!previous) {
      return { hasChanges: false, latest, previous: null, diff: [] }
    }

    const hasChanges = latest.content_hash !== previous.content_hash
    const changes = diffLines(previous.content, latest.content)

    const diff = changes.map((c) => ({
      type: c.added ? 'added' : c.removed ? 'removed' : 'unchanged',
      value: c.value,
      count: c.count
    }))

    return { hasChanges, latest, previous, diff }
  })

  ipcMain.handle('snapshots:history', (_e, { siteId }: { siteId: number }) => {
    return db
      .prepare(
        'SELECT id, scanned_at, content_hash, error FROM snapshots WHERE website_id = ? ORDER BY scanned_at DESC LIMIT 50'
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
          let idx = line.toLowerCase().indexOf(lowerPattern)
          while (idx !== -1) {
            matches.push({ start: idx, end: idx + lowerPattern.length })
            idx = line.toLowerCase().indexOf(lowerPattern, idx + 1)
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
