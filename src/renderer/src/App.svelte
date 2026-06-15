<script lang="ts">
    import { tick } from 'svelte'
    import { api } from './lib/api'
    import type { Site, ScanAction } from './types'
    import HomeScreen from './components/HomeScreen.svelte'
    import SiteView from './components/SiteView.svelte'
    import AddSiteModal from './components/AddSiteModal.svelte'

    type LogEntry = {
        ts: number
        site: string
        hasChanges: boolean
        error?: string
    }

    type Wv = {
        src: string
        executeJavaScript(code: string): Promise<unknown>
        sendInputEvent(event: { type: string; keyCode?: string }): void
        addEventListener(ev: string, fn: (e: any) => void, opts?: { once?: boolean }): void
    }

    let sites = $state<Site[]>([])
    let selectedId = $state<number | null>(null)
    let showAddModal = $state(false)
    let scanningAll = $state(false)
    let scanning = $state(new Set<number>())
    let toast = $state<{ msg: string; type: 'ok' | 'err' } | null>(null)

    // Scan state
    let scanActive = $state(false)
    let scanPhase = $state<'loading' | 'processing'>('loading')
    let scanHostname = $state('')
    let scanProgress = $state<{ current: number; total: number } | null>(null)
    let webviewEl = $state<Element | null>(null)
    let hasScanned = $state(false)
    let lastScannedUrl = $state('')
    let scanColWidth = $state(260)
    let dragging = $state(false)
    let dragStartX = 0
    let dragStartWidth = 0
    let scanLog = $state<LogEntry[]>([])

    const scanWvScale = $derived((scanColWidth - 30) / 1200)

    const selectedSite = $derived(sites.find((s) => s.id === selectedId) ?? null)

    async function loadSites() {
        sites = await api.sites.list()
    }

    async function initSettings() {
        const w = await api.settings.get('scan_col_width')
        if (typeof w === 'number') scanColWidth = w
        const log = await api.settings.get('scan_log')
        if (Array.isArray(log)) scanLog = log as LogEntry[]
    }

    function addLogEntry(entry: LogEntry) {
        scanLog = [entry, ...scanLog].slice(0, 200)
        const serializableLog = scanLog.map((entry) => ({ ...entry }))
        api.settings.set('scan_log', serializableLog)
    }

    function clearLog() {
        scanLog = []
        api.settings.set('scan_log', [])
    }

    function formatLogTime(ts: number): string {
        const diff = Date.now() - ts * 1000
        if (diff < 60000) return 'just now'
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
        return new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    }

    // ─── Webview action executor ──────────────────────────────────────────────

    async function executeWebviewAction(wv: Wv, action: ScanAction): Promise<void> {
        switch (action.type) {
            case 'wait':
                await new Promise((r) => setTimeout(r, action.ms ?? 500))
                break
            case 'click_selector':
                await wv.executeJavaScript(`
          (() => { const el = document.querySelector(${JSON.stringify(action.selector ?? '')}); if (el) el.click() })()
        `)
                await new Promise((r) => setTimeout(r, 300))
                break
            case 'click_text':
                await wv.executeJavaScript(`
          (() => {
            const t = ${JSON.stringify(action.text ?? '')}
            const el = [...document.querySelectorAll('a,button,[role="button"],input[type="submit"]')]
              .find(e => e.textContent.trim().includes(t))
            if (el) el.click()
          })()
        `)
                await new Promise((r) => setTimeout(r, 300))
                break
            case 'type':
                await wv.executeJavaScript(`
          (() => {
            const el = document.querySelector(${JSON.stringify(action.selector ?? '')})
            if (el) {
              el.focus(); el.value = ${JSON.stringify(action.text ?? '')}
              el.dispatchEvent(new Event('input', { bubbles: true }))
              el.dispatchEvent(new Event('change', { bubbles: true }))
            }
          })()
        `)
                break
            case 'key':
                wv.sendInputEvent({ type: 'keyDown', keyCode: action.key ?? 'Return' })
                wv.sendInputEvent({ type: 'keyUp', keyCode: action.key ?? 'Return' })
                await new Promise((r) => setTimeout(r, 200))
                break
        }
    }

    // ─── Core scan logic ──────────────────────────────────────────────────────

    async function scanOne(siteId: number): Promise<{ success: boolean; hasChanges: boolean }> {
        const config = await api.scan.getConfig(siteId)
        scanHostname = new URL(config.url).hostname
        scanPhase = 'loading'

        const wv = webviewEl as unknown as Wv
        let html = ''
        let error: string | undefined

        try {
            await new Promise<void>((resolve, reject) => {
                let done = false
                const finish = (err?: Error) => {
                    if (!done) {
                        done = true
                        err ? reject(err) : resolve()
                    }
                }
                wv.addEventListener('did-finish-load', () => finish(), { once: true })
                wv.addEventListener(
                    'did-fail-load',
                    (e: any) => {
                        if (e.isMainFrame) finish(new Error(e.errorDescription || 'Failed to load'))
                    },
                    { once: true },
                )
                wv.src = config.url
                lastScannedUrl = config.url
            })

            if (config.scan_delay > 0) await new Promise((r) => setTimeout(r, config.scan_delay))
            for (const action of config.actions) await executeWebviewAction(wv, action)
            html = (await wv.executeJavaScript('document.documentElement.outerHTML')) as string
        } catch (err) {
            error = err instanceof Error ? err.message : String(err)
        }

        scanPhase = 'processing'
        const result = await api.scan.process(siteId, html, error)
        hasScanned = true
        addLogEntry({
            ts: Math.floor(Date.now() / 1000),
            site: new URL(config.url).hostname,
            hasChanges: result.hasChanges,
            error: result.success ? undefined : (error ?? 'Processing failed'),
        })
        return result
    }

    async function scanSingle(siteId: number): Promise<void> {
        if (scanActive) return
        scanning = new Set([siteId])
        scanActive = true
        scanPhase = 'loading'
        await tick()

        try {
            await scanOne(siteId)
        } finally {
            scanning = new Set()
            scanActive = false
            await loadSites()
        }
    }

    async function scanAll() {
        if (sites.length === 0 || scanActive) return
        scanningAll = true
        scanActive = true
        scanPhase = 'loading'
        scanProgress = { current: 0, total: sites.length }
        await tick()

        let changed = 0,
            errors = 0
        for (let i = 0; i < sites.length; i++) {
            scanning = new Set([sites[i].id])
            scanProgress = { current: i + 1, total: sites.length }
            try {
                const result = await scanOne(sites[i].id)
                if (result.hasChanges) changed++
                if (!result.success) errors++
            } catch (err) {
                console.error(err)
                errors++
            }
        }

        scanning = new Set()
        scanActive = false
        scanningAll = false
        scanProgress = null
        await loadSites()
        showToast(
            errors > 0 ? `Scan done: ${changed} changed, ${errors} failed` : `Scan done: ${changed} site${changed !== 1 ? 's' : ''} changed`,
            errors > 0 ? 'err' : 'ok',
        )
    }

    function showToast(msg: string, type: 'ok' | 'err' = 'ok') {
        toast = { msg, type }
        setTimeout(() => (toast = null), 3000)
    }

    async function deleteSite(id: number) {
        await api.sites.delete(id)
        if (selectedId === id) selectedId = null
        await loadSites()
    }

    function onSiteAdded(site: Site) {
        showAddModal = false
        sites = [...sites, { ...site, last_scanned: null, last_error: null, has_changes: 0 }]
        selectedId = site.id
    }

    loadSites()
    initSettings()
</script>

<svelte:window
    onmousemove={(e) => {
        if (!dragging) return
        const delta = dragStartX - e.clientX
        scanColWidth = Math.max(180, Math.min(560, dragStartWidth + delta))
    }}
    onmouseup={(e) => {
        if (dragging) api.settings.set('scan_col_width', scanColWidth)
        dragging = false
        if (e.button === 3 && selectedId !== null) selectedId = null
    }}
/>

<div class="app">
    <div class="topbar">
        <div class="topbar-left" style="-webkit-app-region: no-drag">
            {#if selectedId !== null}
                <button class="btn-back" onclick={() => (selectedId = null)}>← Back</button>
            {:else}
                <span class="app-name">suopWatcher</span>
            {/if}
        </div>

        <div class="topbar-actions">
            <button class="btn-scan" onclick={scanAll} disabled={scanningAll || scanActive || sites.length === 0}>
                {scanningAll ? '↻ Scanning…' : '↻ Scan All'}
            </button>
            <button class="btn-add" onclick={() => (showAddModal = true)}>+ Add Site</button>
            <div class="win-controls">
                <button class="wc-btn" onclick={() => api.window.minimize()} aria-label="Minimize">&#x2013;</button>
                <button class="wc-btn" onclick={() => api.window.maximize()} aria-label="Maximize">&#x25A1;</button>
                <button class="wc-btn wc-close" onclick={() => api.window.close()} aria-label="Close">&#x2715;</button>
            </div>
        </div>
    </div>

    <div class="body">
        <div class="main">
            {#if selectedSite}
                {#key selectedSite.id}
                    <SiteView site={selectedSite} onScan={scanSingle} onScanned={loadSites} scanActive={scanning.has(selectedSite.id)} />
                {/key}
            {:else}
                <HomeScreen
                    {sites}
                    {scanning}
                    onSelect={(id) => (selectedId = id)}
                    onScan={scanSingle}
                    onOpen={(url) => api.shell.open(url)}
                    onDelete={deleteSite}
                />
            {/if}
        </div>

        <!-- Always-visible scan preview square -->
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
                        <button class="log-clear" onclick={clearLog}>Clear</button>
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
    </div>
</div>

{#if showAddModal}
    <AddSiteModal onAdd={onSiteAdded} onClose={() => (showAddModal = false)} />
{/if}

{#if toast}
    <div class="toast" class:err={toast.type === 'err'}>{toast.msg}</div>
{/if}

<style>
    .app {
        height: 100vh;
        display: flex;
        flex-direction: column;
    }

    /* ── Topbar ─────────────────────────────────────────────────── */
    .topbar {
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 0 0 16px;
        border-bottom: 1px solid var(--border);
        background: var(--bg-1);
        flex-shrink: 0;
        -webkit-app-region: drag;
    }

    .topbar-left {
        display: flex;
        align-items: center;
    }

    .app-name {
        font-weight: 700;
        font-size: 13px;
        letter-spacing: 0.03em;
        color: var(--text-0);
    }

    .btn-back {
        background: transparent;
        color: var(--accent);
        font-size: 12px;
        font-weight: 500;
        padding: 4px 8px;
        border-radius: var(--radius);
    }

    .btn-back:hover {
        background: var(--accent-dim);
    }

    .topbar-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        padding-right: 0;
        -webkit-app-region: no-drag;
    }

    .win-controls {
        display: flex;
        margin-left: 4px;
    }

    .wc-btn {
        width: 34px;
        height: 44px;
        background: transparent;
        color: var(--text-2);
        font-size: 13px;
        padding: 0;
        border-radius: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        transition:
            background 0.1s,
            color 0.1s;
    }

    .wc-btn:hover {
        background: var(--bg-hover);
        color: var(--text-0);
    }
    .wc-close:hover {
        background: #c42b1c;
        color: #fff;
    }

    .btn-add {
        background: var(--accent);
        color: #000;
        font-weight: 600;
        font-size: 12px;
        padding: 5px 12px;
    }

    .btn-add:hover {
        opacity: 0.85;
    }

    .btn-scan {
        background: var(--bg-3);
        color: var(--text-0);
        font-size: 12px;
        padding: 5px 12px;
    }

    .btn-scan:hover:not(:disabled) {
        background: var(--bg-hover);
    }

    /* ── Body layout ────────────────────────────────────────────── */
    .body {
        flex: 1;
        display: flex;
        overflow: hidden;
        min-height: 0;
    }

    .main {
        flex: 1;
        display: flex;
        overflow: hidden;
        min-width: 0;
    }

    /* ── Scan column ────────────────────────────────────────────── */
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

    /* ── Scan interaction overlay ──────────────────────────────── */
    .scan-interact {
        position: absolute;
        inset: 0;
        z-index: 10;
        cursor: default;
    }

    .scan-interact.has-url {
        cursor: pointer;
    }

    /* ── Toast ──────────────────────────────────────────────────── */
    .toast {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--bg-3);
        color: var(--text-0);
        padding: 9px 18px;
        border-radius: 20px;
        font-size: 12px;
        border: 1px solid var(--border);
        animation: fadeIn 0.15s ease;
        z-index: 200;
    }

    .toast.err {
        background: var(--red-dim);
        border-color: var(--red);
        color: var(--red);
    }

    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateX(-50%) translateY(6px);
        }
        to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
    }
</style>
