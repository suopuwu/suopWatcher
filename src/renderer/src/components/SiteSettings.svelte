<script lang="ts">
  import { api } from '../lib/api'
  import type { Site, ScanAction, WatchRule } from '../types'

  let {
    site,
    onSaved,
    onAddWatcher,
    pickerActiveSiteId = null,
    rulesVersion = 0
  }: {
    site: Site
    onSaved: () => void
    onAddWatcher: (siteUrl: string) => void
    pickerActiveSiteId?: number | null
    rulesVersion?: number
  } = $props()

  let rules = $state<WatchRule[]>([])

  $effect(() => {
    void rulesVersion  // re-run when a rule is saved
    api.rules.list(site.id).then((r) => (rules = r))
  })

  async function deleteRule(id: number) {
    await api.rules.delete(id)
    rules = rules.filter((r) => r.id !== id)
  }

  const DETECT_LABELS: Record<string, string> = {
    content: 'content',
    exists: 'exists',
    count: 'child count'
  }

  let delaySeconds = $state((site.scan_delay ?? 0) / 1000)
  let actions = $state<ScanAction[]>(JSON.parse(site.actions || '[]'))
  let saving = $state(false)
  let saved = $state(false)
  let newActionType = $state<ScanAction['type']>('wait')

  const ACTION_LABELS: Record<ScanAction['type'], string> = {
    wait: 'Wait',
    click_selector: 'Click (CSS selector)',
    click_text: 'Click (by text)',
    type: 'Type text',
    key: 'Press key'
  }

  async function save() {
    saving = true
    try {
      await api.sites.update(site.id, Math.round(delaySeconds * 1000), actions)
      saved = true
      setTimeout(() => (saved = false), 2000)
      onSaved()
    } finally {
      saving = false
    }
  }

  function addAction() {
    const defaults: Record<ScanAction['type'], ScanAction> = {
      wait: { type: 'wait', ms: 1000 },
      click_selector: { type: 'click_selector', selector: '' },
      click_text: { type: 'click_text', text: '' },
      type: { type: 'type', selector: '', text: '' },
      key: { type: 'key', key: 'Return' }
    }
    actions = [...actions, defaults[newActionType]]
  }

  function remove(i: number) {
    actions = actions.filter((_, idx) => idx !== i)
  }

  function update(i: number, patch: Partial<ScanAction>) {
    actions = actions.map((a, idx) => (idx === i ? { ...a, ...patch } : a))
  }
</script>

<div class="settings">
  <section>
    <h2>Page load delay</h2>
    <p class="hint">Extra time (after page finishes loading) before content is captured. Useful for JavaScript-heavy pages.</p>
    <div class="delay-row">
      <input
        type="number"
        min="0"
        max="60"
        step="0.5"
        bind:value={delaySeconds}
      />
      <span class="unit">seconds</span>
    </div>
  </section>

  <section>
    <h2>Pre-scan actions</h2>
    <p class="hint">Actions replayed in order before capturing the page. Use to dismiss overlays, expand sections, or apply filters.</p>

    {#if actions.length > 0}
      <div class="action-list">
        {#each actions as action, i (i)}
          <div class="action-row">
            <span class="action-type">{ACTION_LABELS[action.type]}</span>

            {#if action.type === 'wait'}
              <input
                type="number" min="0" step="100" placeholder="ms"
                value={action.ms ?? 500}
                oninput={(e) => update(i, { ms: Number((e.target as HTMLInputElement).value) })}
              />
              <span class="unit">ms</span>
            {:else if action.type === 'click_selector'}
              <input
                type="text" placeholder="CSS selector, e.g. #load-more"
                value={action.selector ?? ''}
                oninput={(e) => update(i, { selector: (e.target as HTMLInputElement).value })}
              />
            {:else if action.type === 'click_text'}
              <input
                type="text" placeholder="Button/link text"
                value={action.text ?? ''}
                oninput={(e) => update(i, { text: (e.target as HTMLInputElement).value })}
              />
            {:else if action.type === 'type'}
              <input
                type="text" placeholder="CSS selector"
                value={action.selector ?? ''}
                oninput={(e) => update(i, { selector: (e.target as HTMLInputElement).value })}
              />
              <span class="unit">←</span>
              <input
                type="text" placeholder="Text to type"
                value={action.text ?? ''}
                oninput={(e) => update(i, { text: (e.target as HTMLInputElement).value })}
              />
            {:else if action.type === 'key'}
              <input
                type="text" placeholder="Key name, e.g. Return, Tab, Escape"
                value={action.key ?? 'Return'}
                oninput={(e) => update(i, { key: (e.target as HTMLInputElement).value })}
              />
            {/if}

            <button class="remove-btn" onclick={() => remove(i)} aria-label="Remove action">✕</button>
          </div>
        {/each}
      </div>
    {/if}

    <div class="add-row">
      <select bind:value={newActionType}>
        {#each Object.entries(ACTION_LABELS) as [val, label]}
          <option value={val}>{label}</option>
        {/each}
      </select>
      <button class="add-btn" onclick={addAction}>+ Add</button>
    </div>
  </section>

  <section>
    <h2>Watchers</h2>
    <p class="hint">Click elements on the live page to watch. When rules are set, only rule-triggered changes count as "detected" — noise is silenced.</p>

    {#if rules.length > 0}
      <div class="action-list">
        {#each rules as rule (rule.id)}
          <div class="action-row watcher-row">
            <div class="watcher-info">
              <span class="watcher-label">{rule.label || `<${rule.selector}>`}</span>
              <span class="watcher-meta">
                {rule.selector_type === 'xpath' ? 'XPath' : 'CSS'} · watches {rule.detect.map((d) => DETECT_LABELS[d] ?? d).join(', ')}
              </span>
              <code class="watcher-selector">{rule.selector}</code>
            </div>
            <button class="remove-btn" onclick={() => deleteRule(rule.id)} aria-label="Delete watcher">✕</button>
          </div>
        {/each}
      </div>
    {/if}

    {#if pickerActiveSiteId === site.id}
      <p class="picker-hint">Click an element on the page to watch it… (Esc to cancel)</p>
    {:else}
      <button class="add-btn" onclick={() => onAddWatcher(site.url)}>+ Add Watcher</button>
    {/if}
  </section>

  <div class="footer">
    <button class="save-btn" onclick={save} disabled={saving}>
      {#if saved}✓ Saved{:else if saving}Saving…{:else}Save settings{/if}
    </button>
  </div>
</div>

<style>
  .settings {
    flex: 1;
    overflow-y: auto;
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
    gap: 28px;
  }

  h2 {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-1);
    margin-bottom: 6px;
  }

  .hint {
    font-size: 12px;
    color: var(--text-2);
    margin-bottom: 10px;
    line-height: 1.5;
  }

  .delay-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .delay-row input {
    width: 80px;
  }

  .unit {
    font-size: 12px;
    color: var(--text-2);
  }

  .action-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 10px;
  }

  .action-row {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 7px 10px;
  }

  .action-type {
    font-size: 11px;
    font-weight: 600;
    color: var(--accent);
    white-space: nowrap;
    min-width: 120px;
    flex-shrink: 0;
  }

  .action-row input[type="text"],
  .action-row input[type="number"] {
    flex: 1;
    min-width: 0;
    font-size: 12px;
  }

  .remove-btn {
    background: transparent;
    color: var(--text-2);
    padding: 0 4px;
    font-size: 11px;
    flex-shrink: 0;
  }

  .remove-btn:hover {
    color: var(--red);
  }

  .add-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  select {
    background: var(--bg-2);
    color: var(--text-0);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 5px 8px;
    font-size: 12px;
    cursor: pointer;
  }

  .add-btn {
    background: var(--bg-3);
    color: var(--text-0);
    font-size: 12px;
    padding: 5px 12px;
  }

  .add-btn:hover { background: var(--bg-hover); }

  .footer {
    padding-top: 4px;
    border-top: 1px solid var(--border);
  }

  .save-btn {
    background: var(--accent);
    color: #000;
    font-weight: 600;
    font-size: 12px;
    padding: 6px 18px;
  }

  .save-btn:hover:not(:disabled) { opacity: 0.85; }
  .save-btn:disabled { opacity: 0.6; cursor: default; }

  .watcher-row { align-items: flex-start; }

  .watcher-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .watcher-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-0);
  }

  .watcher-meta {
    font-size: 11px;
    color: var(--text-2);
  }

  .watcher-selector {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-2);
    word-break: break-all;
  }

  .picker-hint {
    font-size: 12px;
    color: var(--accent);
    margin: 6px 0;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
</style>
