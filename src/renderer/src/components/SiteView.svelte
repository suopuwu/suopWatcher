<script lang="ts">
    import { api } from '../lib/api'
    import type { Site, DiffResult, HistoryEntry, UniqueSnapshot } from '../types'
    import DiffView from './DiffView.svelte'
    import VisualDiff from './VisualDiff.svelte'
    import HistoryView from './HistoryView.svelte'
    import SiteSettings from './SiteSettings.svelte'
    import SearchTab from './SearchTab.svelte'

    let {
        site,
        onScanned,
        onScan,
        scanActive = false,
    }: {
        site: Site
        onScanned: () => void
        onScan: (siteId: number) => Promise<void>
        scanActive?: boolean
    } = $props()

    type Tab = 'diff' | 'search' | 'history' | 'settings'
    type DiffMode = 'text' | 'visual'

    let tab = $state<Tab>('diff')
    let diffMode = $state<DiffMode>('text')
    let diffResult = $state<DiffResult | null>(null)
    let history = $state<HistoryEntry[]>([])
    let uniqueHistory = $state<UniqueSnapshot[]>([])
    let scanning = $state(false)
    let loading = $state(false)

    $effect(() => {
        if (site.id) loadDiff()
    })

    async function loadDiff() {
        loading = true
        diffResult = null
        try {
            diffResult = await api.snapshots.diff(site.id)
        } finally {
            loading = false
        }
    }

    async function loadHistory() {
        const [hist, unique] = await Promise.all([api.snapshots.history(site.id), api.snapshots.uniqueHistory(site.id)])
        history = hist
        uniqueHistory = unique
    }

    async function scan() {
        scanning = true
        try {
            await onScan(site.id)
            await loadDiff()
            if (tab === 'history') loadHistory()
            onScanned()
        } finally {
            scanning = false
        }
    }

    function switchTab(t: Tab) {
        tab = t
        if (t === 'history') loadHistory()
    }

    function formatDate(ts: number): string {
        return new Date(ts * 1000).toLocaleString()
    }
</script>

<div class="site-view">
    <header>
        <div class="site-header">
            <div>
                <h1>{site.name || new URL(site.url).hostname}</h1>
                <a class="site-url" href={site.url} onclick={(e) => e.preventDefault()}>{site.url}</a>
            </div>
            <button class="scan-btn" onclick={scan} disabled={scanning || scanActive}>
                {#if scanning || scanActive}
                    <span class="spin">↻</span> Scanning…
                {:else}
                    ↻ Scan Now
                {/if}
            </button>
        </div>

        <div class="tabs-row">
            <nav class="tabs">
                <button class:active={tab === 'diff'} onclick={() => switchTab('diff')}>Changes</button>
                <button class:active={tab === 'search'} onclick={() => switchTab('search')}>Search</button>
                <button class:active={tab === 'history'} onclick={() => switchTab('history')}>History</button>
                <button class:active={tab === 'settings'} onclick={() => switchTab('settings')}>Settings</button>
            </nav>

            {#if tab === 'diff' && diffResult?.previous}
                <div class="mode-toggle">
                    <button class:active={diffMode === 'text'} onclick={() => (diffMode = 'text')}>Text</button>
                    <button class:active={diffMode === 'visual'} onclick={() => (diffMode = 'visual')}>Visual</button>
                </div>
            {/if}
        </div>
    </header>

    <div class="content">
        {#if tab === 'diff'}
            {#if loading}
                <p class="status">Loading…</p>
            {:else if !diffResult}
                <p class="status">No scans yet. Click "Scan Now" to fetch this page.</p>
            {:else if !diffResult.previous}
                <p class="status">First scan complete. Scan again to detect changes.</p>
            {:else if diffMode === 'visual'}
                <VisualDiff previous={diffResult.previous} latest={diffResult.latest} siteUrl={site.url} />
            {:else}
                <DiffView diff={diffResult.diff} />
            {/if}
        {:else if tab === 'search'}
            <SearchTab siteId={site.id} />
        {:else if tab === 'settings'}
            <SiteSettings {site} onSaved={onScanned} />
        {:else if tab === 'history'}
            <div class="history-tabs">
                <div class="scan-log">
                    {#each history as entry}
                        <div class="log-row" class:log-error={!!entry.error}>
                            <span class="ts">{formatDate(entry.scanned_at)}</span>
                            {#if entry.error}
                                <span class="log-err-msg">{entry.error}</span>
                            {:else}
                                <span class="hash">{entry.content_hash.slice(0, 12)}</span>
                            {/if}
                        </div>
                    {/each}
                </div>
                <HistoryView snapshots={uniqueHistory} siteUrl={site.url} />
            </div>
        {/if}
    </div>
</div>

<style>
    .site-view {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    header {
        border-bottom: 1px solid var(--border);
        padding: 16px 20px 0;
        flex-shrink: 0;
    }

    .site-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
    }

    h1 {
        font-size: 15px;
        font-weight: 600;
        margin-bottom: 2px;
        user-select: text;
    }

    .site-url {
        font-size: 11px;
        color: var(--accent);
        text-decoration: none;
        font-family: var(--font-mono);
        user-select: text;
    }

    .scan-btn {
        background: var(--bg-3);
        color: var(--text-0);
        padding: 6px 14px;
        font-size: 12px;
        font-weight: 500;
        flex-shrink: 0;
    }

    .scan-btn:hover:not(:disabled) {
        background: var(--bg-hover);
    }

    .spin {
        display: inline-block;
        animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    .tabs-row {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
    }

    .tabs {
        display: flex;
    }

    .tabs button {
        background: transparent;
        color: var(--text-1);
        padding: 8px 16px;
        border-radius: 0;
        font-size: 13px;
        border-bottom: 2px solid transparent;
        margin-bottom: -1px;
    }

    .tabs button:hover {
        color: var(--text-0);
    }

    .tabs button.active {
        color: var(--text-0);
        border-bottom-color: var(--accent);
    }

    .mode-toggle {
        display: flex;
        gap: 2px;
        background: var(--bg-2);
        border-radius: var(--radius);
        padding: 3px;
        margin-bottom: 6px;
    }

    .mode-toggle button {
        background: transparent;
        color: var(--text-1);
        font-size: 11px;
        font-weight: 500;
        padding: 3px 10px;
        border-radius: 4px;
    }

    .mode-toggle button.active {
        background: var(--bg-3);
        color: var(--text-0);
    }
    .mode-toggle button:hover:not(.active) {
        color: var(--text-0);
    }

    .content {
        flex: 1;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }

    .status {
        padding: 40px;
        text-align: center;
        color: var(--text-2);
        font-size: 13px;
    }

    /* History */
    .history-tabs {
        flex: 1;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }

    .scan-log {
        max-height: 140px;
        overflow-y: auto;
        border-bottom: 1px solid var(--border);
        flex-shrink: 0;
    }

    .log-row {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 5px 20px;
        font-size: 11px;
        border-bottom: 1px solid var(--border);
    }

    .log-row:last-child {
        border-bottom: none;
    }
    .log-row.log-error {
        background: var(--red-dim);
    }

    .ts {
        color: var(--text-1);
        white-space: nowrap;
        font-family: var(--font-mono);
        flex-shrink: 0;
    }

    .hash {
        color: var(--text-2);
        font-family: var(--font-mono);
    }

    .log-err-msg {
        color: var(--red);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
</style>
