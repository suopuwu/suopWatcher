<script lang="ts">
  import { api } from '../lib/api'
  import type { Site } from '../types'

  let { onAdd, onClose }: { onAdd: (site: Site) => void; onClose: () => void } = $props()

  let url = $state('')
  let name = $state('')
  let error = $state('')
  let loading = $state(false)

  async function submit() {
    url = url.trim()
    if (!url) { error = 'URL is required'; return }
    if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url

    loading = true
    error = ''
    try {
      const site = await api.sites.add(url, name || undefined)
      onAdd(site)
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to add site'
    } finally {
      loading = false
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose()
    if (e.key === 'Enter') submit()
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div
  class="overlay"
  onclick={onClose}
  onkeydown={(e) => e.key === 'Escape' && onClose()}
  role="dialog"
  aria-modal="true"
  tabindex="-1"
>
  <div
    class="modal"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
    role="document"
  >
    <h2>Add Website</h2>

    <label>
      URL
      <input
        type="url"
        bind:value={url}
        placeholder="https://example.com"
      />
    </label>

    <label>
      Label <span class="optional">(optional)</span>
      <input
        type="text"
        bind:value={name}
        placeholder="My site"
      />
    </label>

    {#if error}
      <p class="error">{error}</p>
    {/if}

    <div class="actions">
      <button class="btn-ghost" onclick={onClose}>Cancel</button>
      <button class="btn-primary" onclick={submit} disabled={loading}>
        {loading ? 'Adding…' : 'Add Site'}
      </button>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .modal {
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 24px;
    width: 420px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  h2 {
    font-size: 15px;
    font-weight: 600;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12px;
    color: var(--text-1);
  }

  label input {
    width: 100%;
    font-size: 13px;
  }

  .optional {
    font-weight: 400;
    color: var(--text-2);
  }

  .error {
    font-size: 12px;
    color: var(--red);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }

  .btn-primary {
    background: var(--accent);
    color: #000;
    font-weight: 600;
    padding: 7px 16px;
  }

  .btn-primary:hover:not(:disabled) {
    opacity: 0.85;
  }

  .btn-ghost {
    background: transparent;
    color: var(--text-1);
    padding: 7px 16px;
    border: 1px solid var(--border);
  }

  .btn-ghost:hover {
    background: var(--bg-3);
  }
</style>
