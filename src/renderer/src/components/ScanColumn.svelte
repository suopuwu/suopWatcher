<script lang="ts">
    import { api } from '../lib/api'
    import type { LogEntry } from '../types'

    let {
        scanActive,
        scanPhase,
        scanHostname,
        scanProgress,
        scanLog,
        hasScanned,
        lastScannedUrl,
        webviewEl = $bindable(null),
        onClearLog,
    }: {
        scanActive: boolean
        scanPhase: 'loading' | 'processing'
        scanHostname: string
        scanProgress: { current: number; total: number } | null
        scanLog: LogEntry[]
        hasScanned: boolean
        lastScannedUrl: string
        webviewEl?: Element | null
        onClearLog: () => void
    } = $props()

    let scanColWidth = $state(260)
    let dragging = $state(false)
    let dragStartX = 0
    let dragStartWidth = 0

    const scanWvScale = $derived((scanColWidth - 30) / 1200)

    api.settings.get('scan_col_width').then((w) => {
        if (typeof w === 'number') scanColWidth = w
    })

    function formatLogTime(ts: number): string {
        const diff = Date.now() - ts * 1000
        if (diff < 60000) return 'just now'
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
        return new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    }
</script>

<svelte:window
    onmousemove={(e) => {
        if (!dragging) return
        const delta = dragStartX - e.clientX
        scanColWidth = Math.max(180, Math.min(560, dragStartWidth + delta))
    }}
    onmouseup={() => {
        if (dragging) api.settings.set('scan_col_width', scanColWidth)
        dragging = false
    }}
/>

<div class="scan-col" style="width: {scanColWidth}px">
    <div
        class="resize-handle"
        class:active={dragging}
        onmousedown={(e) => {
            dragging = true
            dragStartX = e.clientX
            dragStartWidth = scanColWidth
            e.preventDefault()
        }}
    ></div>

    <div class="scan-square">
        <!-- svelte-ignore -->
        <webview bind:this={webviewEl} class="scan-wv" style="transform: scale({scanWvScale})" allowpopups></webview>

        {#if !scanActive && !hasScanned}
            <div class="scan-idle">
                <span class="scan-idle-icon">⊙</span>
                <span class="scan-idle-label">Scan preview</span>
            </div>
        {:else if scanActive && scanPhase === 'processing'}
            <div class="scan-processing">
                <span class="spin">↻</span>
                Processing…
            </div>
        {/if}

        <!-- Blocks all interaction except scroll; click opens in browser -->
        <div
            class="scan-interact"
            class:has-url={hasScanned}
            onclick={() => {
                if (hasScanned) api.shell.open(lastScannedUrl)
            }}
            onwheel={(e) => {
                e.preventDefault()
                if (webviewEl) (webviewEl as any).executeJavaScript(`window.scrollBy(${e.deltaX}, ${e.deltaY})`)
            }}
        ></div>
    </div>

    <div class="log-section">
        <div class="log-header">
            <span class="log-title">
                {#if scanActive}
                    <span class="spin-small">↻</span>
                    {scanHostname}{scanProgress ? ` (${scanProgress.current}/${scanProgress.total})` : ''}
                {:else}
                    Log
                {/if}
            </span>
            {#if scanLog.length > 0}
                <button class="log-clear" onclick={onClearLog}>Clear</button>
            {/if}
        </div>
        <div class="log-entries">
            {#each scanLog as entry (entry.ts + entry.site)}
                <div class="log-entry" class:log-err={!!entry.error} class:log-changed={entry.hasChanges && !entry.error}>
                    <span class="log-dot"></span>
                    <span class="log-site">{entry.site}</span>
                    <span class="log-time">{formatLogTime(entry.ts)}</span>
                </div>
            {:else}
                <p class="log-empty">No scans yet</p>
            {/each}
        </div>
    </div>
</div>

<style>
    .scan-col {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 16px 14px;
        border-left: 1px solid var(--border);
        background: var(--bg-1);
        position: relative;
    }

    .resize-handle {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 5px;
        cursor: col-resize;
        z-index: 10;
        transition: background 0.15s;
    }

    .resize-handle:hover,
    .resize-handle.active {
        background: var(--accent);
    }

    .scan-square {
        width: 100%;
        aspect-ratio: 1 / 1;
        flex-shrink: 0;
        border-radius: 14px;
        overflow: hidden;
        background: var(--bg-0);
        border: 1px solid var(--border);
        position: relative;
    }

    .scan-wv {
        position: absolute;
        top: 0;
        left: 0;
        width: 1200px;
        height: 1200px;
        transform-origin: top left;
        border: none;
    }

    .scan-idle {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        background: var(--bg-0);
    }

    .scan-idle-icon {
        font-size: 28px;
        color: var(--text-2);
        opacity: 0.4;
    }

    .scan-idle-label {
        font-size: 11px;
        color: var(--text-2);
        letter-spacing: 0.04em;
    }

    .scan-processing {
        position: absolute;
        inset: 0;
        background: rgba(26, 27, 30, 0.8);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-size: 12px;
        color: var(--text-1);
        backdrop-filter: blur(2px);
    }

    .log-section {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 0;
        gap: 6px;
    }

    .log-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
    }

    .log-title {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--text-2);
        display: flex;
        align-items: center;
        gap: 5px;
        flex: 1;
        min-width: 0;
    }

    .log-clear {
        background: transparent;
        color: var(--text-2);
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 4px;
        flex-shrink: 0;
    }

    .log-clear:hover {
        color: var(--text-0);
        background: var(--bg-3);
    }

    .log-entries {
        flex: 1;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 2px;
        user-select: text;
    }

    .log-empty {
        font-size: 11px;
        color: var(--text-2);
        opacity: 0.5;
        text-align: center;
        padding: 12px 0;
    }

    .log-entry {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        padding: 2px 6px;
        font-size: 11px;
        line-height: 1.3;
    }

    .log-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--text-2);
        flex-shrink: 0;
        margin-top: 3px;
    }

    .log-changed .log-dot {
        background: var(--yellow);
    }
    .log-err .log-dot {
        background: var(--red);
    }

    .log-site {
        font-family: var(--font-mono);
        color: var(--text-1);
        word-break: break-all;
        user-select: text;
    }

    .log-time {
        font-size: 10px;
        color: var(--text-2);
        white-space: nowrap;
        flex-shrink: 0;
        font-family: var(--font-mono);
        margin-top: 1px;
    }

    .spin {
        display: inline-block;
        animation: spin 0.8s linear infinite;
        font-size: 18px;
        color: var(--accent);
    }

    .spin-small {
        display: inline-block;
        animation: spin 0.8s linear infinite;
        color: var(--accent);
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    .scan-interact {
        position: absolute;
        inset: 0;
        z-index: 10;
        cursor: default;
    }

    .scan-interact.has-url {
        cursor: pointer;
    }
</style>
