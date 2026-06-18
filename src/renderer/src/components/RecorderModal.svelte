<script lang="ts">
    import { onMount, onDestroy } from 'svelte'
    import { buildRecorderScript } from '../lib/actionRecorder'
    import type { ScanAction } from '../types'

    let { siteUrl, onDone }: {
        siteUrl: string
        onDone: (actions: ScanAction[] | null) => void
    } = $props()

    let wvEl: any
    let loading = $state(true)
    let recorded = $state<ScanAction[]>([])
    let closed = false
    let pollInterval: ReturnType<typeof setInterval> | null = null
    let seenCount = 0

    function actionLabel(a: ScanAction): string {
        switch (a.type) {
            case 'click_text':     return `click "${(a.text ?? '').slice(0, 28)}"`
            case 'click_selector': return `click ${(a.selector ?? '').slice(0, 28)}`
            case 'type':           return `type "${(a.text ?? '').slice(0, 20)}" → ${(a.selector ?? '').slice(0, 20)}`
            case 'wait':           return `wait ${a.ms ?? 1000}ms`
            case 'key':            return `key ${a.key ?? 'Return'}`
        }
    }

    async function onPageLoad() {
        loading = false
        seenCount = 0
        try { await wvEl.executeJavaScript(buildRecorderScript()) } catch {}
    }

    function addWait() {
        recorded = [...recorded, { type: 'wait', ms: 1000 }]
    }

    function clearAll() {
        recorded = []
        seenCount = 0
        try { wvEl?.executeJavaScript('window.__recordedActions = []') } catch {}
    }

    function removeAction(i: number) {
        recorded = recorded.filter((_, idx) => idx !== i)
    }

    function close(result: ScanAction[] | null) {
        if (closed) return
        closed = true
        if (pollInterval) { clearInterval(pollInterval); pollInterval = null }
        onDone(result)
    }

    const finish = () => close(recorded.length > 0 ? recorded : null)
    const cancel = () => close(null)

    onMount(() => {
        wvEl.addEventListener('did-finish-load', onPageLoad)

        pollInterval = setInterval(async () => {
            try {
                const raw = await wvEl.executeJavaScript('JSON.stringify(window.__recordedActions || [])') as string
                const pageActions = JSON.parse(raw) as ScanAction[]
                const newOnes = pageActions.slice(seenCount)
                if (newOnes.length > 0) {
                    recorded = [...recorded, ...newOnes]
                    seenCount = pageActions.length
                }
            } catch {}
        }, 400)

        wvEl.src = siteUrl
    })

    onDestroy(() => { if (pollInterval) { clearInterval(pollInterval); pollInterval = null } })
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') cancel() }} />

<div class="recorder-modal">
    <div class="recorder-bar">
        <div class="bar-left">
            {#if loading}
                <span class="status-msg">Loading <code>{new URL(siteUrl).hostname}</code>…</span>
            {:else}
                <span class="rec-dot"></span>
                <span class="status-msg">Recording</span>
                {#if recorded.length > 0}
                    <div class="pills">
                        {#each recorded as action, i (i)}
                            <span class="pill">
                                {actionLabel(action)}
                                <button class="pill-remove" onclick={() => removeAction(i)} aria-label="Remove">✕</button>
                            </span>
                        {/each}
                    </div>
                {:else}
                    <span class="hint">Interact with the page — clicks and typing will be captured…</span>
                {/if}
            {/if}
        </div>

        <div class="bar-right">
            {#if !loading}
                <button class="bar-btn" onclick={addWait} title="Insert a wait step">+ Wait</button>
                {#if recorded.length > 0}
                    <button class="bar-btn" onclick={clearAll}>Clear</button>
                {/if}
            {/if}
            <button class="bar-btn done-btn" onclick={finish} disabled={recorded.length === 0}>
                Done{recorded.length > 0 ? ` (${recorded.length})` : ''}
            </button>
            <button class="bar-btn cancel-btn" onclick={cancel}>✕</button>
        </div>
    </div>

    <div class="wv-wrap">
        <!-- svelte-ignore -->
        <webview bind:this={wvEl} class="recorder-wv"></webview>
        {#if loading}
            <div class="loading-cover">Loading…</div>
        {/if}
    </div>
</div>

<style>
    .recorder-modal {
        position: fixed;
        inset: 0;
        z-index: 500;
        display: flex;
        flex-direction: column;
        background: var(--bg-0);
    }

    .recorder-bar {
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 12px;
        background: var(--bg-1);
        border-bottom: 1px solid var(--border);
        flex-shrink: 0;
        gap: 12px;
        overflow: hidden;
        -webkit-app-region: no-drag;
    }

    .bar-left {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        flex: 1;
        overflow: hidden;
    }

    .rec-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--red, #f44336);
        flex-shrink: 0;
        animation: blink 1.2s ease-in-out infinite;
    }

    @keyframes blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
    }

    .status-msg {
        font-size: 12px;
        color: var(--text-1);
        white-space: nowrap;
        flex-shrink: 0;
    }

    code {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--accent);
    }

    .hint {
        font-size: 12px;
        color: var(--text-2);
        font-style: italic;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .pills {
        display: flex;
        gap: 4px;
        overflow-x: auto;
        align-items: center;
        scrollbar-width: none;
        min-width: 0;
    }

    .pills::-webkit-scrollbar { display: none; }

    .pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: var(--bg-3);
        border: 1px solid var(--border);
        border-radius: 20px;
        padding: 2px 6px 2px 9px;
        font-size: 11px;
        color: var(--text-0);
        white-space: nowrap;
        flex-shrink: 0;
    }

    .pill-remove {
        background: transparent;
        color: var(--text-2);
        font-size: 9px;
        padding: 0 2px;
        line-height: 1;
        border-radius: 50%;
    }

    .pill-remove:hover { color: var(--red); }

    .bar-right {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
    }

    .bar-btn {
        background: var(--bg-3);
        color: var(--text-0);
        font-size: 12px;
        padding: 5px 12px;
        border-radius: var(--radius);
        white-space: nowrap;
    }

    .bar-btn:hover:not(:disabled) { background: var(--bg-hover); }
    .bar-btn:disabled { opacity: 0.4; cursor: default; }

    .done-btn {
        background: var(--accent);
        color: #000;
        font-weight: 600;
    }

    .done-btn:hover:not(:disabled) { opacity: 0.85; }

    .cancel-btn { color: var(--text-2); padding: 5px 9px; }

    .wv-wrap {
        flex: 1;
        position: relative;
        overflow: hidden;
    }

    .recorder-wv {
        width: 100%;
        height: 100%;
    }

    .loading-cover {
        position: absolute;
        inset: 0;
        background: var(--bg-0);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        color: var(--text-2);
        z-index: 1;
    }
</style>
