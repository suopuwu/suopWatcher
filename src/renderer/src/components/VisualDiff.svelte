<script lang="ts">
  import type { Snapshot } from '../types'

  let { previous, latest, siteUrl }: { previous: Snapshot; latest: Snapshot; siteUrl: string } = $props()

  let prevFrame = $state<HTMLIFrameElement | null>(null)
  let latestFrame = $state<HTMLIFrameElement | null>(null)

  // Each time content changes, bump generation so stale listeners self-invalidate.
  let generation = 0
  let loadedCount = 0

  $effect(() => {
    previous; latest
    generation++
    loadedCount = 0
  })

  function onFrameLoad() {
    loadedCount++
    if (loadedCount >= 2) attachScrollSync()
  }

  function attachScrollSync() {
    const pWin = prevFrame?.contentWindow
    const lWin = latestFrame?.contentWindow
    if (!pWin || !lWin) return

    const gen = generation

    // Which pane is currently driving the sync. The other pane's scroll events
    // are ignored while a lock is held, preventing ping-pong drift.
    // 0 = unlocked, 1 = prev driving, 2 = latest driving
    let driver = 0
    let unlockTimer = 0

    function syncFrom(source: Window, target: Window, id: 1 | 2) {
      return () => {
        if (generation !== gen) return       // stale listener
        if (driver !== 0 && driver !== id) return  // other pane is driving

        driver = id
        clearTimeout(unlockTimer)

        const srcMax = source.document.documentElement.scrollHeight - source.innerHeight
        const tgtMax = target.document.documentElement.scrollHeight - target.innerHeight
        if (srcMax > 0 && tgtMax > 0) {
          const pct = source.scrollY / srcMax
          target.scrollTo({ top: pct * tgtMax, behavior: 'instant' })
        }

        // Release lock after 50 ms of quiet — long enough to absorb the echo
        // scroll event that fires when we call scrollTo above.
        unlockTimer = window.setTimeout(() => { driver = 0 }, 50) as unknown as number
      }
    }

    pWin.addEventListener('scroll', syncFrom(pWin, lWin, 1))
    lWin.addEventListener('scroll', syncFrom(lWin, pWin, 2))
  }

  function withBase(html: string, url: string): string {
    if (!html) return '<p style="font-family:sans-serif;padding:2rem;color:#888">No HTML stored — re-scan to capture visual data.</p>'
    const base = `<base href="${url}">`
    return html.includes('<head') ? html.replace(/(<head[^>]*>)/i, `$1${base}`) : base + html
  }

  const prevDoc = $derived(withBase(previous.raw_html, siteUrl))
  const latestDoc = $derived(withBase(latest.raw_html, siteUrl))

  function formatDate(ts: number): string {
    return new Date(ts * 1000).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })
  }
</script>

<div class="visual-diff">
  <div class="pane">
    <div class="pane-label old">Previous — {formatDate(previous.scanned_at)}</div>
    <iframe
      bind:this={prevFrame}
      title="Previous version"
      srcdoc={prevDoc}
      sandbox="allow-same-origin allow-popups"
      onload={onFrameLoad}
    ></iframe>
  </div>
  <div class="divider"></div>
  <div class="pane">
    <div class="pane-label new">Current — {formatDate(latest.scanned_at)}</div>
    <iframe
      bind:this={latestFrame}
      title="Current version"
      srcdoc={latestDoc}
      sandbox="allow-same-origin allow-popups"
      onload={onFrameLoad}
    ></iframe>
  </div>
</div>

<style>
  .visual-diff {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }

  .pane-label {
    padding: 6px 12px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.03em;
    flex-shrink: 0;
  }

  .pane-label.old {
    background: var(--red-dim);
    color: var(--red);
    border-bottom: 1px solid color-mix(in srgb, var(--red) 30%, transparent);
  }

  .pane-label.new {
    background: var(--green-dim);
    color: var(--green);
    border-bottom: 1px solid color-mix(in srgb, var(--green) 30%, transparent);
  }

  iframe {
    flex: 1;
    border: none;
    width: 100%;
    background: #fff;
  }

  .divider {
    width: 1px;
    background: var(--border);
    flex-shrink: 0;
  }
</style>
