import { createHash } from 'crypto'
import { request as httpsRequest } from 'https'
import { request as httpRequest } from 'http'
import { URL } from 'url'
import { BrowserWindow } from 'electron'
import { getDb } from './db'

export interface ScanAction {
  type: 'wait' | 'click_selector' | 'click_text' | 'type' | 'key'
  ms?: number       // wait
  selector?: string // click_selector, type
  text?: string     // click_text, type
  key?: string      // key — Electron key code, e.g. 'Return', 'Tab', 'Escape'
}

// ─── BrowserWindow-based page rendering (background / Scan All) ──────────────

async function renderPage(url: string, delayMs: number, actions: ScanAction[]): Promise<string> {
  const win = new BrowserWindow({
    width: 1280, height: 800, show: false,
    webPreferences: { sandbox: false }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const done = (err?: Error) => {
        if (settled) return
        settled = true
        err ? reject(err) : resolve()
      }
      win.webContents.once('did-finish-load', () => done())
      win.webContents.on('did-fail-load', (_e, code, desc, _u, isMain) => {
        if (isMain) done(new Error(`${desc} (${code})`))
      })
      win.loadURL(url).catch((e) => done(e instanceof Error ? e : new Error(String(e))))
    })

    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))
    for (const action of actions) await executeAction(win, action)
    return (await win.webContents.executeJavaScript('document.documentElement.outerHTML')) as string
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

async function executeAction(win: BrowserWindow, action: ScanAction): Promise<void> {
  const wc = win.webContents
  switch (action.type) {
    case 'wait':
      await new Promise((r) => setTimeout(r, action.ms ?? 500))
      break

    case 'click_selector':
      await wc.executeJavaScript(`
        (() => {
          const el = document.querySelector(${JSON.stringify(action.selector ?? '')})
          if (el) el.click()
        })()
      `)
      await new Promise((r) => setTimeout(r, 300))
      break

    case 'click_text':
      await wc.executeJavaScript(`
        (() => {
          const t = ${JSON.stringify(action.text ?? '')}
          const el = [...document.querySelectorAll('a,button,[role="button"],input[type="submit"]')]
            .find(e => e.textContent.trim().includes(t))
          if (el) el.click()
        })()
      `)
      await new Promise((r) => setTimeout(r, 300))
      break

    case 'type':
      await wc.executeJavaScript(`
        (() => {
          const el = document.querySelector(${JSON.stringify(action.selector ?? '')})
          if (el) {
            el.focus()
            el.value = ${JSON.stringify(action.text ?? '')}
            el.dispatchEvent(new Event('input', { bubbles: true }))
            el.dispatchEvent(new Event('change', { bubbles: true }))
          }
        })()
      `)
      break

    case 'key':
      wc.sendInputEvent({ type: 'keyDown', keyCode: action.key ?? 'Return' })
      wc.sendInputEvent({ type: 'keyUp', keyCode: action.key ?? 'Return' })
      await new Promise((r) => setTimeout(r, 200))
      break
  }
}

// ─── HTTP helpers (used for asset inlining) ───────────────────────────────────

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

const MAX_ASSET_BYTES = 1024 * 1024

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
  await Promise.all([...toFetch].map((u) => asDataUri(u, cache)))

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

  // 1. External stylesheets → <style> blocks
  const cssLinks: Array<{ tag: string; href: string }> = []
  for (const re of [
    /<link\b[^>]*\brel=["']stylesheet["'][^>]*>/gi,
    /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']stylesheet["'][^>]*>/gi
  ]) {
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) !== null) {
      const hm = /\bhref=["']([^"']+)["']/.exec(m[0])
      const resolved = hm ? resolveUrl(hm[1], pageUrl) : null
      if (resolved && !cssLinks.find((l) => l.href === resolved)) {
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
  await Promise.all(imgs.map((i) => asDataUri(i.src, cache)))
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

// Returns scan config for renderer-side webview scanning
export function getScanConfig(siteId: number): { url: string; scan_delay: number; actions: ScanAction[] } {
  const db = getDb()
  const row = db.prepare('SELECT url, scan_delay, actions FROM websites WHERE id = ?')
    .get(siteId) as { url: string; scan_delay: number; actions: string } | undefined
  if (!row) throw new Error(`Site ${siteId} not found`)
  return { url: row.url, scan_delay: row.scan_delay ?? 0, actions: JSON.parse(row.actions || '[]') }
}

// Processes HTML captured by the renderer webview: inlines assets, stores snapshot
export async function processScan(
  siteId: number,
  html: string,
  error?: string
): Promise<{ success: boolean; hasChanges: boolean; error?: string }> {
  const db = getDb()
  if (error) {
    db.prepare("INSERT INTO snapshots (website_id, content, content_hash, scanned_at, error) VALUES (?, '', '', unixepoch(), ?)")
      .run(siteId, error)
    return { success: false, hasChanges: false, error }
  }
  try {
    const { url } = db.prepare('SELECT url FROM websites WHERE id = ?').get(siteId) as { url: string }
    const [inlinedHtml, text] = await Promise.all([
      inlinePageAssets(html, url),
      Promise.resolve(extractText(html))
    ])
    const hash = createHash('sha256').update(text).digest('hex')
    const prev = db.prepare('SELECT content_hash FROM snapshots WHERE website_id = ? AND error IS NULL ORDER BY scanned_at DESC LIMIT 1')
      .get(siteId) as { content_hash: string } | undefined
    db.prepare('INSERT INTO snapshots (website_id, content, content_hash, scanned_at, raw_html) VALUES (?, ?, ?, unixepoch(), ?)')
      .run(siteId, text, hash, inlinedHtml)
    return { success: true, hasChanges: prev ? prev.content_hash !== hash : false }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    db.prepare("INSERT INTO snapshots (website_id, content, content_hash, scanned_at, error) VALUES (?, '', '', unixepoch(), ?)")
      .run(siteId, message)
    return { success: false, hasChanges: false, error: message }
  }
}

export async function scanSite(
  siteId: number,
  url: string
): Promise<{ success: boolean; hasChanges: boolean; error?: string }> {
  const db = getDb()
  try {
    const row = db
      .prepare('SELECT scan_delay, actions FROM websites WHERE id = ?')
      .get(siteId) as { scan_delay: number; actions: string } | undefined

    const delayMs = row?.scan_delay ?? 0
    const actions: ScanAction[] = JSON.parse(row?.actions ?? '[]')

    const raw = await renderPage(url, delayMs, actions)

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
