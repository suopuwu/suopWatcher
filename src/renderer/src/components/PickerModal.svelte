<script lang="ts">
    import { onMount, onDestroy } from 'svelte'
    import { buildPickerScript } from '../lib/elementPicker'
    import type { ElementDescriptor } from '../types'

    let { siteUrl, onPicked }: {
        siteUrl: string
        onPicked: (d: ElementDescriptor | null) => void
    } = $props()

    let wvEl: any
    let loading = $state(true)
    let closed = false
    let pollInterval: ReturnType<typeof setInterval> | null = null

    function report(d: ElementDescriptor | null) {
        if (closed) return
        closed = true
        if (pollInterval) { clearInterval(pollInterval); pollInterval = null }
        onPicked(d)
    }

    function cancel() {
        try { wvEl?.executeJavaScript('window.__pickerCancel && window.__pickerCancel()') } catch {}
        report(null)
    }

    function startPolling() {
        if (pollInterval) return
        pollInterval = setInterval(async () => {
            try {
                const raw = await wvEl.executeJavaScript('JSON.stringify(window.__pickerResult)') as string
                const result = JSON.parse(raw)
                if (result && result.done) {
                    report(result.value as ElementDescriptor | null)
                }
            } catch {}
        }, 200)
    }

    onMount(() => {
        wvEl.addEventListener('did-finish-load', async () => {
            loading = false
            try { await wvEl.executeJavaScript(buildPickerScript()) } catch {}
            startPolling()
        }, { once: true })
        wvEl.src = siteUrl
    })

    onDestroy(() => { if (pollInterval) clearInterval(pollInterval) })
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') cancel() }} />

<div class="picker-modal">
    <div class="picker-bar">
        <span class="picker-msg">
            {#if loading}
                Loading <code>{new URL(siteUrl).hostname}</code>…
            {:else}
                Click an element to watch it &nbsp;·&nbsp; <kbd>Esc</kbd> to cancel
            {/if}
        </span>
        <button class="cancel-btn" onclick={cancel}>Cancel</button>
    </div>
    <div class="wv-wrap">
        <!-- svelte-ignore -->
        <webview bind:this={wvEl} class="picker-wv"></webview>
        {#if loading}
            <div class="loading-cover">Loading…</div>
        {/if}
    </div>
</div>

<style>
    .picker-modal {
        position: fixed;
        inset: 0;
        z-index: 500;
        display: flex;
        flex-direction: column;
        background: var(--bg-0);
    }

    .picker-bar {
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 16px;
        background: var(--bg-1);
        border-bottom: 1px solid var(--border);
        flex-shrink: 0;
        -webkit-app-region: no-drag;
    }

    .picker-msg {
        font-size: 12px;
        color: var(--text-1);
        display: flex;
        align-items: center;
        gap: 4px;
    }

    code {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--accent);
    }

    kbd {
        font-family: var(--font-mono);
        font-size: 11px;
        background: var(--bg-3);
        border: 1px solid var(--border);
        border-radius: 3px;
        padding: 1px 5px;
        color: var(--text-1);
    }

    .cancel-btn {
        background: var(--bg-3);
        color: var(--text-1);
        font-size: 12px;
        padding: 5px 14px;
        border-radius: var(--radius);
    }

    .cancel-btn:hover { background: var(--bg-hover); color: var(--text-0); }

    .wv-wrap {
        flex: 1;
        position: relative;
        overflow: hidden;
    }

    .picker-wv {
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
