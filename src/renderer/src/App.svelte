<script lang="ts">
    import { tick } from 'svelte'
    import { api } from './lib/api'
    import type { Site, LogEntry, ElementDescriptor, RuleState } from './types'
    import { executeWebviewAction } from './lib/webviewActions'
    import { buildExtractionScript } from './lib/elementPicker'
    import HomeScreen from './components/HomeScreen.svelte'
    import SiteView from './components/SiteView.svelte'
    import ScanColumn from './components/ScanColumn.svelte'
    import AddSiteModal from './components/AddSiteModal.svelte'
    import ElementPickerPopup from './components/ElementPickerPopup.svelte'
    import PickerModal from './components/PickerModal.svelte'

    type Wv = {
        src: string
        executeJavaScript(code: string): Promise<unknown>
        sendInputEvent(event: { type: string; keyCode?: string }): void
        addEventListener(ev: string, fn: (e: any) => void, opts?: { once?: boolean }): void
        removeEventListener(ev: string, fn: (e: any) => void): void
    }

    let sites = $state<Site[]>([])
    let selectedId = $state<number | null>(null)
    let previousId = $state<number | null>(null)
    let showAddModal = $state(false)
    let scanningAll = $state(false)
    let scanning = $state(new Set<number>())
    let toast = $state<{ msg: string; type: 'ok' | 'err' } | null>(null)
    let nativeFrame = $state(true)

    // Picker state
    let pickerDescriptor = $state<ElementDescriptor | null>(null)
    let pickerActiveSiteId = $state<number | null>(null)
    let pickerSiteUrl = $state('')
    let rulesVersion = $state(0)

    // Scan state
    let scanActive = $state(false)
    let scanPhase = $state<'loading' | 'processing'>('loading')
    let scanHostname = $state('')
    let scanProgress = $state<{ current: number; total: number } | null>(null)
    let webviewEl = $state<Element | null>(null)
    let hasScanned = $state(false)
    let lastScannedUrl = $state('')
    let scanLog = $state<LogEntry[]>([])

    const selectedSite = $derived(sites.find((s) => s.id === selectedId) ?? null)

    async function loadSites() {
        sites = await api.sites.list()
    }

    async function initSettings() {
        const log = await api.settings.get('scan_log')
        if (Array.isArray(log)) scanLog = log
    }

    function addLogEntry(entry: LogEntry) {
        scanLog = [entry, ...scanLog].slice(0, 200)
        api.settings.set('scan_log', $state.snapshot(scanLog))
    }

    function clearLog() {
        scanLog = []
        api.settings.set('scan_log', [])
    }

    // ─── Core scan logic ──────────────────────────────────────────────────────

    async function scanOne(siteId: number): Promise<{ success: boolean; hasChanges: boolean }> {
        const config = await api.scan.getConfig(siteId)
        const hostname = new URL(config.url).hostname
        scanHostname = hostname
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
                        wv.removeEventListener('did-fail-load', onFailLoad)
                        err ? reject(err) : resolve()
                    }
                }
                // ERR_ABORTED (-3) fires for every HTTP redirect — ignore it and wait
                // for did-finish-load on the final URL instead.
                function onFailLoad(e: any) {
                    if (e.isMainFrame && e.errorCode !== -3)
                        finish(new Error(e.errorDescription || 'Failed to load'))
                }
                wv.addEventListener('did-finish-load', () => finish(), { once: true })
                wv.addEventListener('did-fail-load', onFailLoad)
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
        let ruleStates: Record<number, object> = {}
        if (!error) {
            const rules = await api.rules.list(siteId)
            if (rules.length > 0) {
                try {
                    ruleStates = (await (webviewEl as unknown as Wv).executeJavaScript(buildExtractionScript(rules))) as Record<number, object>
                } catch { /* non-fatal: fallback to hash-based detection */ }
            }
        }
        const result = await api.scan.process(siteId, html, error, ruleStates)
        hasScanned = true
        addLogEntry({
            ts: Math.floor(Date.now() / 1000),
            site: hostname,
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
            await loadSites()
        }

        scanning = new Set()
        scanActive = false
        scanningAll = false
        scanProgress = null
        showToast(
            errors > 0 ? `Scan done: ${changed} changed, ${errors} failed` : `Scan done: ${changed} site${changed !== 1 ? 's' : ''} changed`,
            errors > 0 ? 'err' : 'ok',
        )
    }

    function showToast(msg: string, type: 'ok' | 'err' = 'ok') {
        toast = { msg, type }
        setTimeout(() => (toast = null), 3000)
    }

    function startPicker(siteId: number, siteUrl: string) {
        if (scanActive) return
        pickerActiveSiteId = siteId
        pickerSiteUrl = siteUrl
    }

    function onPickerResult(desc: ElementDescriptor | null) {
        pickerActiveSiteId = null
        pickerSiteUrl = ''
        pickerDescriptor = desc  // null = cancelled, non-null = show ElementPickerPopup
    }

    function selectSite(id: number) {
        selectedId = id
        if (!scanActive && webviewEl) {
            const site = sites.find((s) => s.id === id)
            if (site) {
                const wv = webviewEl as unknown as Wv
                lastScannedUrl = site.url
                scanHostname = new URL(site.url).hostname
                wv.src = site.url
                wv.addEventListener('did-finish-load', () => { hasScanned = true }, { once: true })
            }
        }
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

    async function initFrame() {
        const val = await api.settings.get('native_frame')
        nativeFrame = (val ?? true) as boolean
    }

    $effect(() => {
        document.documentElement.classList.toggle('custom-frame', !nativeFrame)
    })

    loadSites()
    initSettings()
    initFrame()
</script>

<svelte:window
    onmouseup={(e) => {
        if (e.button === 3 && selectedId !== null) { previousId = selectedId; selectedId = null }
        if (e.button === 4 && selectedId === null && previousId !== null) {
            const id = previousId
            previousId = null
            selectSite(id)
        }
    }}
/>

<div class="app" class:rounded={!nativeFrame}>
    <div class="topbar" class:draggable={!nativeFrame}>
        <div class="topbar-left" style={!nativeFrame ? '-webkit-app-region: no-drag' : ''}>
            {#if selectedId !== null}
                <button class="btn-back" onclick={() => { previousId = selectedId; selectedId = null }}>← Back</button>
            {:else}
                <span class="app-name">suopWatcher</span>
            {/if}
        </div>

        <div class="topbar-actions" style={!nativeFrame ? '-webkit-app-region: no-drag' : ''}>
            <button class="btn-scan" onclick={scanAll} disabled={scanningAll || scanActive || sites.length === 0}>
                {scanningAll ? '↻ Scanning…' : '↻ Scan All'}
            </button>
            <button class="btn-add" onclick={() => (showAddModal = true)}>+ Add Site</button>
            <button class="btn-frame" onclick={() => api.window.toggleFrame()} title={nativeFrame ? 'Switch to custom title bar' : 'Switch to OS title bar'}>
                {nativeFrame ? '⊟' : '⊞'}
            </button>
            {#if !nativeFrame}
                <div class="win-controls">
                    <button class="wc-btn" onclick={() => api.window.minimize()} aria-label="Minimize">&#x2013;</button>
                    <button class="wc-btn" onclick={() => api.window.maximize()} aria-label="Maximize">&#x25A1;</button>
                    <button class="wc-btn wc-close" onclick={() => api.window.close()} aria-label="Close">&#x2715;</button>
                </div>
            {/if}
        </div>
    </div>

    <div class="body">
        <div class="main">
            {#if selectedSite}
                {#key selectedSite.id}
                    <SiteView
                        site={selectedSite}
                        onScan={scanSingle}
                        onScanned={loadSites}
                        scanActive={scanning.has(selectedSite.id)}
                        onAddWatcher={(url) => startPicker(selectedSite.id, url)}
                        pickerActiveSiteId={pickerActiveSiteId}
                        {rulesVersion}
                    />
                {/key}
            {:else}
                <HomeScreen
                    {sites}
                    {scanning}
                    onSelect={(id) => { previousId = null; selectSite(id) }}
                    onScan={scanSingle}
                    onOpen={(url) => api.shell.open(url)}
                    onDelete={deleteSite}
                />
            {/if}
        </div>

        <ScanColumn
            {scanActive}
            {scanPhase}
            {scanHostname}
            {scanProgress}
            {scanLog}
            {hasScanned}
            {lastScannedUrl}
            bind:webviewEl
            onClearLog={clearLog}
        />
    </div>
</div>

{#if showAddModal}
    <AddSiteModal onAdd={onSiteAdded} onClose={() => (showAddModal = false)} />
{/if}

{#if pickerActiveSiteId !== null}
    <PickerModal siteUrl={pickerSiteUrl} onPicked={onPickerResult} />
{/if}

{#if pickerDescriptor}
    <ElementPickerPopup
        descriptor={pickerDescriptor}
        siteId={selectedId!}
        onSave={async (label, selector, selector_type, detect) => {
            const newRule = await api.rules.add(selectedId!, label, selector, selector_type, detect)
            // Seed current element state as baseline so the next scan can detect changes immediately
            if (newRule && webviewEl) {
                try {
                    const states = await (webviewEl as unknown as Wv).executeJavaScript(buildExtractionScript([newRule]))
                    await api.snapshots.updateRuleStates(selectedId!, states as Record<number, RuleState>)
                } catch { /* non-fatal: falls back to no-detect on first scan */ }
            }
            pickerDescriptor = null
            rulesVersion++
        }}
        onCancel={() => { pickerDescriptor = null }}
    />
{/if}

{#if toast}
    <div class="toast" class:err={toast.type === 'err'}>{toast.msg}</div>
{/if}

<style>
    .app {
        height: 100vh;
        display: flex;
        flex-direction: column;
        background: var(--bg-0);
    }

    .app.rounded {
        border-radius: 10px;
        overflow: hidden;
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

    .topbar.draggable {
        -webkit-app-region: drag;
    }

    .topbar-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        padding-right: 0;
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
        transition: background 0.1s, color 0.1s;
    }

    .wc-btn:hover {
        background: var(--bg-hover);
        color: var(--text-0);
    }

    .wc-close:hover {
        background: #c42b1c;
        color: #fff;
    }

    .btn-frame {
        background: transparent;
        color: var(--text-2);
        font-size: 14px;
        padding: 4px 6px;
        border-radius: var(--radius);
        line-height: 1;
    }

    .btn-frame:hover {
        background: var(--bg-hover);
        color: var(--text-0);
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
