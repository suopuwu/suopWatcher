<script lang="ts">
    import { api } from '../lib/api'
    import type { Site, DiffResult, HistoryEntry, UniqueSnapshot, SearchResult } from '../types'
    import DiffView from './DiffView.svelte'
    import VisualDiff from './VisualDiff.svelte'
    import HistoryView from './HistoryView.svelte'
    import SiteSettings from './SiteSettings.svelte'

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
    let searchQuery = $state('')
    let isRegex = $state(false)
    let searchResults = $state<SearchResult[]>([])
    let searchError = $state('')
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

    async function runSearch() {
        if (!searchQuery) {
            searchResults = []
            return
        }
        searchError = ''
        const result = await api.snapshots.search(site.id, searchQuery, isRegex)
        if ('error' in result) {
            searchError = result.error
            searchResults = []
        } else {
            searchResults = result as SearchResult[]
        }
    }

    function switchTab(t: Tab) {
        tab = t
        if (t === 'history') loadHistory()
        if (t === 'search') searchResults = []
    }

    function highlightLine(content: string, matches: Array<{ start: number; end: number }>): string {
        let out = ''
        let pos = 0
        const sorted = [...matches].sort((a, b) => a.start - b.start)
        for (const m of sorted) {
            out += escHtml(content.slice(pos, m.start))
            out += `<mark>${escHtml(content.slice(m.start, m.end))}</mark>`
            pos = m.end
        }
        out += escHtml(content.slice(pos))
        return out
    }

    function escHtml(s: string): string {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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
            <div class="search-bar">
                <input type="text" bind:value={searchQuery} placeholder="Search latest snapshot…" oninput={runSearch} />
                <label class="regex-toggle">
                    <input type="checkbox" bind:checked={isRegex} onchange={runSearch} />
                    <span>Regex</span>
                </label>
            </div>
            <div class="search-results">
                {#if searchError}
                    <p class="err">{searchError}</p>
                {:else if searchQuery && searchResults.length === 0}
                    <p class="status">No matches found.</p>
                {:else}
                    {#each searchResults as result}
                        <div class="result-row">
                            <span class="line-num">{result.line}</span>
                            <span class="result-content">{@html highlightLine(result.content, result.matches)}</span>
                        </div>
                    {/each}
                {/if}
            </div>
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

    /* Search */
    .search-bar {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 16px;
        border-bottom: 1px solid var(--border);
        flex-shrink: 0;
    }

    .search-bar input[type='text'] {
        flex: 1;
        font-family: var(--font-mono);
        font-size: 13px;
    }

    .regex-toggle {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 12px;
        color: var(--text-1);
        cursor: pointer;
    }

    .regex-toggle input {
        cursor: pointer;
    }

    .search-results {
        flex: 1;
        overflow-y: auto;
        padding: 8px 0;
    }

    .result-row {
        display: flex;
        font-family: var(--font-mono);
        font-size: 12px;
        line-height: 1.6;
        user-select: text;
    }

    .result-row:hover {
        background: var(--bg-2);
    }

    .line-num {
        width: 52px;
        flex-shrink: 0;
        text-align: right;
        padding: 0 12px;
        color: var(--text-2);
        user-select: none;
        border-right: 1px solid var(--border);
    }

    .result-content {
        padding: 0 12px;
        word-break: break-all;
        white-space: pre-wrap;
    }

    .result-content :global(mark) {
        background: var(--yellow-dim);
        color: var(--yellow);
        border-radius: 2px;
        padding: 0 1px;
    }

    .err {
        padding: 16px;
        color: var(--red);
        font-size: 12px;
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
