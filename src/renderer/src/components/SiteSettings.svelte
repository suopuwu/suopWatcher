<script lang="ts">
  import { onDestroy } from 'svelte'
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

  function detectLabel(d: string): string {
    if (d.startsWith('regex_count:')) return `regex count (/${d.slice(12)}/)`
    return DETECT_LABELS[d] ?? d
  }

  let showRegexForm = $state(false)
  let newRegexLabel = $state('')
  let newRegexPattern = $state('')
  let regexFormError = $state('')
  let savingRegex = $state(false)

  async function saveRegexWatcher() {
    regexFormError = ''
    if (!newRegexPattern.trim()) { regexFormError = 'Enter a regex pattern'; return }
    try { new RegExp(newRegexPattern) } catch { regexFormError = 'Invalid regex pattern'; return }
    savingRegex = true
    try {
      const label = newRegexLabel.trim() || `/${newRegexPattern}/`
      const newRule = await api.rules.add(site.id, label, '', 'page', ['regex_count:' + newRegexPattern])
      rules = [...rules, newRule]
      newRegexLabel = ''
      newRegexPattern = ''
      showRegexForm = false
    } finally {
      savingRegex = false
    }
  }

  let delaySeconds = $state((site.scan_delay ?? 0) / 1000)
  let actions = $state<ScanAction[]>(JSON.parse(site.actions || '[]'))
  let autoSaved = $state(false)
  let newActionType = $state<ScanAction['type']>('wait')

  const ACTION_LABELS: Record<ScanAction['type'], string> = {
    wait: 'Wait',
    click_selector: 'Click (CSS selector)',
    click_text: 'Click (by text)',
    type: 'Type text',
    key: 'Press key'
  }

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let initialized = false

  $effect(() => {
    const delay = delaySeconds
    const snap = $state.snapshot(actions) as ScanAction[]
    if (!initialized) { initialized = true; return }
    if (saveTimer !== null) clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      saveTimer = null
      await api.sites.update(site.id, Math.round(delay * 1000), snap)
      onSaved()
      autoSaved = true
      setTimeout(() => (autoSaved = false), 2000)
    }, 600)
  })

  onDestroy(() => { if (saveTimer !== null) clearTimeout(saveTimer) })

  function addAction() {
    const defaults: Record<ScanAction['type'], ScanAction> = {
      wait: { type: 'wait', ms: 1000 },
      click_selector: { type: 'click_selector', selector: '' },
      click_text: { type: 'click_text', text: '' },
      type: { type: 'type', selector: '', text: '' },
      key: { type: 'key', key: 'Return' }
    }
    actions.push(defaults[newActionType])
  }

  function remove(i: number) {
    actions.splice(i, 1)
  }

  function update(i: number, patch: Partial<ScanAction>) {
    Object.assign(actions[i], patch)
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
    <p class="hint">Watch specific elements or count regex matches on the whole page. When rules are set, only rule-triggered changes count as "detected".</p>

    {#if rules.length > 0}
      <div class="action-list">
        {#each rules as rule (rule.id)}
          <div class="action-row watcher-row">
            <div class="watcher-info">
              <span class="watcher-label">{rule.label || `<${rule.selector}>`}</span>
              <span class="watcher-meta">
                {rule.selector_type === 'page' ? 'Whole page' : rule.selector_type === 'xpath' ? 'XPath' : 'CSS'} · watches {rule.detect.map(detectLabel).join(', ')}
              </span>
              {#if rule.selector_type !== 'page'}
                <code class="watcher-selector">{rule.selector}</code>
              {/if}
            </div>
            <button class="remove-btn" onclick={() => deleteRule(rule.id)} aria-label="Delete watcher">✕</button>
          </div>
        {/each}
      </div>
    {/if}

    <div class="add-row">
      {#if pickerActiveSiteId === site.id}
        <p class="picker-hint">Click an element on the page to watch it… (Esc to cancel)</p>
      {:else}
        <button class="add-btn" onclick={() => onAddWatcher(site.url)}>+ Element watcher</button>
      {/if}
      <button class="add-btn" onclick={() => { showRegexForm = !showRegexForm; regexFormError = '' }}>+ Regex watcher</button>
    </div>

    {#if showRegexForm}
      <div class="regex-form">
        <input
          class="regex-input"
          type="text"
          placeholder="Label (optional)"
          bind:value={newRegexLabel}
        />
        <input
          class="regex-input"
          type="text"
          placeholder="Regex pattern, e.g. \d+ items"
          bind:value={newRegexPattern}
          oninput={() => (regexFormError = '')}
        />
        {#if regexFormError}<span class="regex-error">{regexFormError}</span>{/if}
        <div class="regex-form-actions">
          <button class="add-btn" onclick={saveRegexWatcher} disabled={savingRegex}>
            {savingRegex ? 'Saving…' : 'Save'}
          </button>
          <button class="add-btn" onclick={() => { showRegexForm = false; regexFormError = '' }} disabled={savingRegex}>Cancel</button>
        </div>
      </div>
    {/if}
  </section>

  {#if autoSaved}
    <p class="autosave-status">✓ Saved</p>
  {/if}
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

  .autosave-status {
    font-size: 11px;
    color: var(--accent);
    text-align: right;
    padding: 4px 0;
    animation: fadeOut 2s ease forwards;
  }

  @keyframes fadeOut {
    0%, 60% { opacity: 1; }
    100% { opacity: 0; }
  }

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

  .regex-form {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 8px;
    padding: 10px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .regex-input {
    width: 100%;
    padding: 5px 8px;
    background: var(--bg-0);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text-0);
    font-size: 12px;
    box-sizing: border-box;
  }

  .regex-input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .regex-error {
    font-size: 11px;
    color: var(--red);
  }

  .regex-form-actions {
    display: flex;
    gap: 6px;
  }
</style>
