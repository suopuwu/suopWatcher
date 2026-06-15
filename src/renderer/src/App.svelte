<script lang="ts">
  import { api } from './lib/api'
  import type { Site, ScanResult } from './types'
  import SiteList from './components/SiteList.svelte'
  import SiteView from './components/SiteView.svelte'
  import AddSiteModal from './components/AddSiteModal.svelte'

  let sites = $state<Site[]>([])
  let selectedId = $state<number | null>(null)
  let showAddModal = $state(false)
  let scanningAll = $state(false)
  let scanning = $state(new Set<number>())
  let toast = $state<{ msg: string; type: 'ok' | 'err' } | null>(null)

  const selectedSite = $derived(sites.find((s) => s.id === selectedId) ?? null)

  async function loadSites() {
    sites = await api.sites.list()
  }

  async function scanAll() {
    scanningAll = true
    scanning = new Set(sites.map((s) => s.id))
    try {
      const results: ScanResult[] = await api.scan.run()
      const changed = results.filter((r) => r.hasChanges).length
      const errors = results.filter((r) => !r.success).length
      showToast(
        errors > 0
          ? `Scan done: ${changed} changed, ${errors} failed`
          : `Scan done: ${changed} site${changed !== 1 ? 's' : ''} changed`,
        errors > 0 ? 'err' : 'ok'
      )
    } finally {
      scanningAll = false
      scanning = new Set()
      await loadSites()
    }
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
</script>

<div class="app">
  <div class="topbar">
    <span class="app-name">suopWatcher</span>
    <div class="topbar-actions">
      <button class="btn-scan" onclick={scanAll} disabled={scanningAll || sites.length === 0}>
        {scanningAll ? '↻ Scanning…' : '↻ Scan All'}
      </button>
      <button class="btn-add" onclick={() => (showAddModal = true)}>+ Add Site</button>
    </div>
  </div>

  <div class="body">
    <SiteList
      {sites}
      {selectedId}
      {scanning}
      onSelect={(id) => (selectedId = id)}
      onDelete={deleteSite}
    />

    <main>
      {#if selectedSite}
        {#key selectedSite.id}
          <SiteView
            site={selectedSite}
            onScanned={() => loadSites()}
          />
        {/key}
      {:else}
        <div class="empty-state">
          <p>Select a site from the sidebar,<br />or add a new one to get started.</p>
        </div>
      {/if}
    </main>
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

  .topbar {
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-1);
    flex-shrink: 0;
    -webkit-app-region: drag;
  }

  .app-name {
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.03em;
    color: var(--text-0);
  }

  .topbar-actions {
    display: flex;
    gap: 8px;
    -webkit-app-region: no-drag;
  }

  .btn-add {
    background: var(--accent);
    color: #000;
    font-weight: 600;
    font-size: 12px;
    padding: 5px 12px;
  }

  .btn-add:hover { opacity: 0.85; }

  .btn-scan {
    background: var(--bg-3);
    color: var(--text-0);
    font-size: 12px;
    padding: 5px 12px;
  }

  .btn-scan:hover:not(:disabled) { background: var(--bg-hover); }

  .body {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  main {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .empty-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-2);
    text-align: center;
    line-height: 1.8;
    font-size: 13px;
  }

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
    from { opacity: 0; transform: translateX(-50%) translateY(6px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
</style>
