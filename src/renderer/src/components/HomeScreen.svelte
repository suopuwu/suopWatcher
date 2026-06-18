<script lang="ts">
    import type { Site } from '../types'

    let {
        sites,
        scanning,
        onSelect,
        onScan,
        onOpen,
        onDelete,
    }: {
        sites: Site[]
        scanning: Set<number>
        onSelect: (id: number) => void
        onScan: (id: number) => void
        onOpen: (url: string) => void
        onDelete: (id: number) => void
    } = $props()

    type Category = 'changed' | 'ok' | 'error' | 'new'

    const catConfig: Record<Category, { label: string; color: string; dimColor: string }> = {
        changed: { label: 'Changes Detected', color: 'var(--yellow)', dimColor: 'var(--yellow-dim)' },
        error: { label: 'Error', color: 'var(--red)', dimColor: 'var(--red-dim)' },
        ok: { label: 'Up to Date', color: 'var(--green)', dimColor: 'var(--green-dim)' },
        new: { label: 'Not Yet Scanned', color: 'var(--text-2)', dimColor: 'transparent' },
    }

    function categorize(s: Site): Category {
        if (s.last_error) return 'error'
        if (s.has_changes) return 'changed'
        if (s.last_scanned) return 'ok'
        return 'new'
    }

    function formatAge(ts: number | null): string {
        if (!ts) return '—'
        const diff = Date.now() - ts * 1000
        if (diff < 60000) return 'just now'
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
        return `${Math.floor(diff / 86400000)}d ago`
    }

    function onEnter(fn: () => void) {
        return (e: KeyboardEvent) => { if (e.key === 'Enter') fn() }
    }

    function hostname(url: string): string {
        try {
            return new URL(url).hostname
        } catch {
            return url
        }
    }

    const groups = $derived.by(() => {
        const g: Record<Category, Site[]> = { changed: [], ok: [], error: [], new: [] }
        for (const s of sites) g[categorize(s)].push(s)
        return (['changed', 'error', 'ok', 'new'] as Category[])
            .map((cat) => ({ cat, ...catConfig[cat], sites: g[cat] }))
            .filter((grp) => grp.sites.length > 0)
    })
</script>

<div class="home">
    {#if sites.length === 0}
        <div class="empty">
            <p>No sites yet.<br />Click <strong>+ Add Site</strong> to start watching.</p>
        </div>
    {:else}
        <div class="groups">
            {#each groups as group}
                <section class="group">
                    <h2 class="group-heading" style="color: {group.color}">
                        {group.label}
                        <span class="count">{group.sites.length}</span>
                    </h2>
                    <div class="cards">
                        {#each group.sites as site}
                            <button class="card" style="--ind: {group.color}; --dim: {group.dimColor}" onclick={() => onSelect(site.id)}>
                                <span class="card-dot"></span>
                                <span class="card-body">
                                    <span class="card-name">{site.name || hostname(site.url)}</span>
                                    <span class="card-url">{hostname(site.url)}</span>
                                </span>
                                <span class="card-age">{formatAge(site.last_scanned)}</span>
                                <span
                                    role="button"
                                    tabindex="0"
                                    class="card-btn"
                                    onclick={(e) => { e.stopPropagation(); onOpen(site.url) }}
                                    onkeydown={onEnter(() => onOpen(site.url))}
                                    aria-label="Open {site.name || hostname(site.url)} in browser">↗</span
                                >
                                <span
                                    role="button"
                                    tabindex="0"
                                    class="card-btn"
                                    aria-disabled={scanning.has(site.id)}
                                    onclick={(e) => { e.stopPropagation(); if (!scanning.has(site.id)) onScan(site.id) }}
                                    onkeydown={onEnter(() => { if (!scanning.has(site.id)) onScan(site.id) })}
                                    aria-label="Scan {site.name || hostname(site.url)}">↻</span
                                >
                                <span
                                    role="button"
                                    tabindex="0"
                                    class="card-btn delete-card-btn"
                                    onclick={(e) => { e.stopPropagation(); onDelete(site.id) }}
                                    onkeydown={onEnter(() => onDelete(site.id))}
                                    aria-label="Delete {site.name || hostname(site.url)}">×</span
                                >
                            </button>
                        {/each}
                    </div>
                </section>
            {/each}
        </div>
    {/if}
</div>

<style>
    .home {
        flex: 1;
        overflow-y: auto;
        padding: 24px 24px;
    }

    .empty {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--text-2);
        font-size: 13px;
        text-align: center;
        line-height: 1.8;
    }

    .groups {
        display: flex;
        flex-direction: column;
        gap: 28px;
    }

    .group-heading {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .count {
        font-size: 11px;
        color: var(--text-2);
        font-weight: 400;
        letter-spacing: 0;
        text-transform: none;
        background: var(--bg-3);
        padding: 1px 6px;
        border-radius: 10px;
    }

    .cards {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .card {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        border-radius: 10px;
        background: var(--bg-2);
        border: 1px solid var(--border);
        cursor: pointer;
        transition:
            background 0.1s,
            border-color 0.1s;
        width: 100%;
        text-align: left;
    }

    .card:hover {
        background: var(--dim);
        border-color: var(--ind);
    }

    .card-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--ind);
        flex-shrink: 0;
    }

    .card-body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 1px;
    }

    .card-name {
        font-size: 13px;
        font-weight: 500;
        color: var(--text-0);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .card-url {
        font-size: 11px;
        color: var(--text-2);
        font-family: var(--font-mono);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .card-age {
        font-size: 11px;
        color: var(--text-2);
        font-family: var(--font-mono);
        white-space: nowrap;
        flex-shrink: 0;
    }

    .card-btn {
        width: 28px;
        height: 28px;
        border-radius: 8px;
        background: var(--bg-3);
        border: 1px solid var(--border);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        line-height: 1;
        color: var(--text-1);
        flex-shrink: 0;
        cursor: pointer;
        transition:
            background 0.1s,
            color 0.1s,
            border-color 0.1s;
    }

    .card-btn:hover {
        background: var(--bg-hover);
        color: var(--text-0);
    }

    .delete-card-btn {
        background: transparent;
        border-color: var(--red);
        color: var(--red);
    }

    .delete-card-btn:hover {
        background: var(--red-dim);
        color: var(--red);
    }
    .card-btn[aria-disabled='true'] {
        opacity: 0.45;
        cursor: not-allowed;
    }
</style>
