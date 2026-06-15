import { createHash } from 'crypto'
import { request as httpsRequest } from 'https'
import { request as httpRequest } from 'http'
import { URL } from 'url'
import { getDb } from './db'

// ─── HTTP ────────────────────────────────────────────────────────────────────

interface HttpResult {
  status: number
  contentType: string
  body: Buffer
  location?: string
}

function httpGet(url: string, timeoutMs = 12000): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const req = (parsed.protocol === 'https:' ? httpsRequest : httpRequest)(
      url,
      { headers: { 'User-Agent': 'suopWatcher/0.1', Accept: '*/*' }, timeout: timeoutMs },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(Buffer.from(c)))
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            contentType: ((res.headers['content-type'] as string) ?? '').split(';')[0].trim(),
            body: Buffer.concat(chunks),
            location: res.headers['location'] as string | undefined
          })
        )
      }
    )
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    req.end()
  })
}

async function fetchText(url: string, depth = 0): Promise<string | null> {
  if (depth > 3) return null
  try {
    const r = await httpGet(url)
    if (r.status >= 300 && r.status < 400 && r.location) return fetchText(r.location, depth + 1)
    if (r.status < 200 || r.status >= 300) return null
    return r.body.toString('utf-8')
  } catch { return null }
}

// ─── URL utilities ────────────────────────────────────────────────────────────

function resolveUrl(href: string, base: string): string | null {
  try {
    if (!href || href.startsWith('data:') || href.startsWith('blob:') ||
        href.startsWith('#') || href.startsWith('javascript:')) return null
    const u = new URL(href, base)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.href
  } catch { return null }
}

function mimeFromUrl(url: string): string {
  const ext = url.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase() ?? ''
  return ({
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    svg: 'image/svg+xml', webp: 'image/webp', ico: 'image/x-icon', avif: 'image/avif',
    woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
    eot: 'application/vnd.ms-fontobject'
  } as Record<string, string>)[ext] ?? 'application/octet-stream'
}

// ─── Asset fetching ───────────────────────────────────────────────────────────

const MAX_ASSET_BYTES = 1024 * 1024 // skip assets > 1 MB

async function asDataUri(url: string, cache: Map<string, string>, depth = 0): Promise<string | null> {
  if (cache.has(url)) return cache.get(url) ?? null
  if (depth > 2) return null
  try {
    const r = await httpGet(url, 8000)
    if (r.status >= 300 && r.status < 400 && r.location) return asDataUri(r.location, cache, depth + 1)
    if (r.status < 200 || r.status >= 300 || r.body.length > MAX_ASSET_BYTES) {
      cache.set(url, '')
      return null
    }
    const mime = r.contentType || mimeFromUrl(url)
    const uri = `data:${mime};base64,${r.body.toString('base64')}`
    cache.set(url, uri)
    return uri
  } catch {
    cache.set(url, '')
    return null
  }
}

// ─── CSS inlining ─────────────────────────────────────────────────────────────

async function inlineCssUrls(css: string, base: string, cache: Map<string, string>): Promise<string> {
  const urlRe = /url\(\s*(['"]?)([^'"\s)]+)\1\s*\)/g
  const toFetch = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = urlRe.exec(css)) !== null) {
    const resolved = resolveUrl(m[2], base)
    if (resolved) toFetch.add(resolved)
  }
  await Promise.all([...toFetch].map(u => asDataUri(u, cache)))

  return css.replace(/url\(\s*(['"]?)([^'"\s)]+)\1\s*\)/g, (full, _q, href) => {
    const resolved = resolveUrl(href, base)
    const uri = resolved ? cache.get(resolved) : undefined
    return uri ? `url(${uri})` : full
  })
}

// ─── Full page inlining ───────────────────────────────────────────────────────

export async function inlinePageAssets(html: string, pageUrl: string): Promise<string> {
  const cache = new Map<string, string>()
  let result = html

  // 1. External stylesheets → <style> blocks with url() assets resolved
  const cssLinks: Array<{ tag: string; href: string }> = []
  for (const re of [
    /<link\b[^>]*\brel=["']stylesheet["'][^>]*>/gi,
    /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']stylesheet["'][^>]*>/gi
  ]) {
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) !== null) {
      const hm = /\bhref=["']([^"']+)["']/.exec(m[0])
      const resolved = hm ? resolveUrl(hm[1], pageUrl) : null
      if (resolved && !cssLinks.find(l => l.href === resolved)) {
        cssLinks.push({ tag: m[0], href: resolved })
      }
    }
  }
  for (const { tag, href } of cssLinks) {
    const css = await fetchText(href)
    if (css != null) {
      const inlined = await inlineCssUrls(css, href, cache)
      result = result.replace(tag, `<style>${inlined}</style>`)
    }
  }

  // 2. Inline <style> block url() references
  const styleRe = /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi
  const styleBlocks: Array<{ full: string; open: string; content: string; close: string }> = []
  {
    let m: RegExpExecArray | null
    while ((m = styleRe.exec(result)) !== null) {
      styleBlocks.push({ full: m[0], open: m[1], content: m[2], close: m[3] })
    }
  }
  for (const { full, open, content, close } of styleBlocks) {
    const inlined = await inlineCssUrls(content, pageUrl, cache)
    result = result.replace(full, open + inlined + close)
  }

  // 3. Images: <img src="...">
  const imgRe = /(<img\b[^>]*\bsrc=["'])([^"']+)(["'])/gi
  const imgs: Array<{ full: string; pre: string; src: string; post: string }> = []
  {
    let m: RegExpExecArray | null
    while ((m = imgRe.exec(result)) !== null) {
      const resolved = resolveUrl(m[2], pageUrl)
      if (resolved) imgs.push({ full: m[0], pre: m[1], src: resolved, post: m[3] })
    }
  }
  await Promise.all(imgs.map(i => asDataUri(i.src, cache)))
  for (const { full, pre, src, post } of imgs) {
    const uri = cache.get(src)
    if (uri) result = result.replace(full, `${pre}${uri}${post}`)
  }

  return result
}

// ─── Text extraction ──────────────────────────────────────────────────────────

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

// ─── Main scan ────────────────────────────────────────────────────────────────

export async function scanSite(siteId: number, url: string): Promise<{ success: boolean; hasChanges: boolean; error?: string }> {
  const db = getDb()
  try {
    const raw = await fetchText(url)
    if (raw == null) throw new Error('Failed to fetch page')

    const [inlinedHtml, text] = await Promise.all([
      inlinePageAssets(raw, url),
      Promise.resolve(extractText(raw))
    ])
    const hash = createHash('sha256').update(text).digest('hex')

    const prev = db
      .prepare('SELECT content_hash FROM snapshots WHERE website_id = ? AND error IS NULL ORDER BY scanned_at DESC LIMIT 1')
      .get(siteId) as { content_hash: string } | undefined

    db.prepare(
      'INSERT INTO snapshots (website_id, content, content_hash, scanned_at, raw_html) VALUES (?, ?, ?, unixepoch(), ?)'
    ).run(siteId, text, hash, inlinedHtml)

    return { success: true, hasChanges: prev ? prev.content_hash !== hash : false }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    db.prepare(
      "INSERT INTO snapshots (website_id, content, content_hash, scanned_at, error) VALUES (?, '', '', unixepoch(), ?)"
    ).run(siteId, message)
    return { success: false, hasChanges: false, error: message }
  }
}
