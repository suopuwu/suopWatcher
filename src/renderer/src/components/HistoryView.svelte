<script lang="ts">
  import type { UniqueSnapshot } from '../types'

  let { snapshots, siteUrl }: { snapshots: UniqueSnapshot[]; siteUrl: string } = $props()

  let expanded = $state(new Set<number>())

  function toggle(id: number) {
    const next = new Set(expanded)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    expanded = next
  }

  function withBase(html: string, url: string): string {
    if (!html) return '<p style="font-family:sans-serif;padding:2rem;color:#888">No visual data — re-scan to capture HTML.</p>'
    const base = `<base href="${url}">`
    return html.includes('<head')
      ? html.replace(/(<head[^>]*>)/i, `$1${base}`)
      : base + html
  }

  function formatDate(ts: number): string {
    return new Date(ts * 1000).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }
</script>

<div class="history-view">
  {#if snapshots.length === 0}
    <p class="empty">No scan history yet.</p>
  {:else}
    {#each snapshots as snap, i (snap.id)}
      {@const open = expanded.has(snap.id)}
      <div class="version-card" class:open>
        <button
          class="version-header"
          onclick={() => toggle(snap.id)}
          aria-expanded={open}
        >
          <span class="version-label">{i === 0 ? 'Current' : `Version ${snapshots.length - i}`}</span>
          <span class="version-date">{formatDate(snap.scanned_at)}</span>
          <span class="version-hash">{snap.content_hash.slice(0, 8)}</span>
          <span class="chevron">{open ? '▲' : '▼'}</span>
        </button>

        {#if open}
          <div class="frame-wrap">
            <iframe
              title={`Snapshot ${formatDate(snap.scanned_at)}`}
              srcdoc={withBase(snap.raw_html, siteUrl)}
              sandbox="allow-same-origin"
            ></iframe>
          </div>
        {/if}
      </div>
    {/each}
  {/if}
</div>

<style>
  .history-view {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .empty {
    color: var(--text-2);
    text-align: center;
    padding: 40px;
    font-size: 13px;
  }

  .version-card {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    flex-shrink: 0;
  }

  .version-card.open {
    border-color: var(--accent);
  }

  .version-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    background: var(--bg-2);
    width: 100%;
    text-align: left;
    border-radius: 0;
    cursor: pointer;
  }

  .version-header:hover {
    background: var(--bg-hover);
  }

  .version-card.open .version-header {
    border-bottom: 1px solid var(--border);
  }

  .version-label {
    font-size: 11px;
    font-weight: 700;
    color: var(--accent);
    letter-spacing: 0.05em;
    text-transform: uppercase;
    flex-shrink: 0;
  }

  .version-date {
    font-size: 12px;
    color: var(--text-1);
    flex: 1;
  }

  .version-hash {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-2);
  }

  .chevron {
    font-size: 9px;
    color: var(--text-2);
    flex-shrink: 0;
  }

  .frame-wrap {
    height: 380px;
    background: #fff;
  }

  iframe {
    width: 100%;
    height: 100%;
    border: none;
    display: block;
  }
</style>
