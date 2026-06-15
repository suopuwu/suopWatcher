<script lang="ts">
    import { api } from '../lib/api'
    import type { SearchResult } from '../types'

    let { siteId }: { siteId: number } = $props()

    let searchQuery = $state('')
    let isRegex = $state(false)
    let searchResults = $state<SearchResult[]>([])
    let searchError = $state('')

    async function runSearch() {
        if (!searchQuery) {
            searchResults = []
            return
        }
        searchError = ''
        const result = await api.snapshots.search(siteId, searchQuery, isRegex)
        if ('error' in result) {
            searchError = result.error
            searchResults = []
        } else {
            searchResults = result as SearchResult[]
        }
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
</script>

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

<style>
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

    .status {
        padding: 40px;
        text-align: center;
        color: var(--text-2);
        font-size: 13px;
    }

    .err {
        padding: 16px;
        color: var(--red);
        font-size: 12px;
    }
</style>
