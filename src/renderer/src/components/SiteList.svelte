<script lang="ts">
  import type { Site } from '../types'

  let {
    sites,
    selectedId,
    scanning,
    onSelect,
    onDelete
  }: {
    sites: Site[]
    selectedId: number | null
    scanning: Set<number>
    onSelect: (id: number) => void
    onDelete: (id: number) => void
  } = $props()

  function formatTime(ts: number | null): string {
    if (!ts) return 'Never'
    const d = new Date(ts * 1000)
    const now = Date.now()
    const diff = now - d.getTime()
    if (diff < 60_000) return 'Just now'
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`
    return d.toLocaleDateString()
  }

  function hostname(url: string): string {
    try { return new URL(url).hostname } catch { return url }
  }
</script>

<aside class="sidebar">
  <div class="list">
    {#each sites as site (site.id)}
      <div
        class="site-item"
        class:active={selectedId === site.id}
        onclick={() => onSelect(site.id)}
        onkeydown={(e) => e.key === 'Enter' && onSelect(site.id)}
        role="button"
        tabindex="0"
      >
        <div class="site-main">
          <span class="indicator" class:changed={site.has_changes === 1} class:error={!!site.last_error} class:scanning={scanning.has(site.id)}></span>
          <div class="site-info">
            <span class="site-name">{site.name || hostname(site.url)}</span>
            {#if site.name}
              <span class="site-url">{hostname(site.url)}</span>
            {/if}
          </div>
        </div>
        <div class="site-meta">
          <span class="last-scanned">{formatTime(site.last_scanned)}</span>
          <button
            class="delete-btn"
            onclick={(e) => { e.stopPropagation(); onDelete(site.id) }}
            title="Remove site"
          >×</button>
        </div>
      </div>
    {:else}
      <p class="empty">No sites added yet.<br />Click + to get started.</p>
    {/each}
  </div>
</aside>

<style>
  .sidebar {
    width: 240px;
    flex-shrink: 0;
    background: var(--bg-1);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .site-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    border-radius: var(--radius);
    background: transparent;
    color: var(--text-0);
    text-align: left;
    width: 100%;
    cursor: pointer;
  }

  .site-item:hover {
    background: var(--bg-hover);
  }

  .site-item.active {
    background: var(--accent-dim);
  }

  .site-main {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1;
  }

  .indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    background: var(--text-2);
  }

  .indicator.changed {
    background: var(--yellow);
  }

  .indicator.error {
    background: var(--red);
  }

  .indicator.scanning {
    background: var(--accent);
    animation: pulse 1s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  .site-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .site-name {
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .site-url {
    font-size: 11px;
    color: var(--text-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .site-meta {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .last-scanned {
    font-size: 10px;
    color: var(--text-2);
    white-space: nowrap;
  }

  .delete-btn {
    width: 18px;
    height: 18px;
    background: transparent;
    color: var(--text-2);
    font-size: 14px;
    line-height: 1;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.1s;
    padding: 0;
  }

  .site-item:hover .delete-btn {
    opacity: 1;
  }

  .delete-btn:hover {
    background: var(--red-dim);
    color: var(--red);
  }

  .empty {
    padding: 24px 12px;
    color: var(--text-2);
    text-align: center;
    line-height: 1.8;
    font-size: 12px;
  }
</style>
