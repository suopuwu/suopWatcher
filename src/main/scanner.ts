import { createHash } from 'crypto'
import { request as httpsRequest } from 'https'
import { request as httpRequest } from 'http'
import { URL } from 'url'
import { getDb } from './db'

function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const requester = parsed.protocol === 'https:' ? httpsRequest : httpRequest

    const req = requester(
      url,
      {
        headers: {
          'User-Agent': 'suopWatcher/0.1 (website change monitor)',
          Accept: 'text/html,application/xhtml+xml,*/*'
        },
        timeout: 15000
      },
      (res) => {
        // Follow one level of redirect
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(fetchUrl(res.headers.location))
          return
        }
        let data = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => resolve(data))
      }
    )

    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request timed out after 15s'))
    })
    req.end()
  })
}

function extractText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function scanSite(siteId: number, url: string): Promise<{ success: boolean; hasChanges: boolean; error?: string }> {
  const db = getDb()

  try {
    const html = await fetchUrl(url)
    const text = extractText(html)
    const hash = createHash('sha256').update(text).digest('hex')

    const prev = db
      .prepare('SELECT content_hash FROM snapshots WHERE website_id = ? AND error IS NULL ORDER BY scanned_at DESC LIMIT 1')
      .get(siteId) as { content_hash: string } | undefined

    db.prepare(
      'INSERT INTO snapshots (website_id, content, content_hash, scanned_at) VALUES (?, ?, ?, unixepoch())'
    ).run(siteId, text, hash)

    const hasChanges = prev ? prev.content_hash !== hash : false
    return { success: true, hasChanges }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    db.prepare(
      "INSERT INTO snapshots (website_id, content, content_hash, scanned_at, error) VALUES (?, '', '', unixepoch(), ?)"
    ).run(siteId, message)
    return { success: false, hasChanges: false, error: message }
  }
}
