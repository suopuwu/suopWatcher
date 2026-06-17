<script lang="ts">
  import type { ElementDescriptor } from '../types'

  let {
    descriptor,
    siteId,
    onSave,
    onCancel
  }: {
    descriptor: ElementDescriptor
    siteId: number
    onSave: (label: string, selector: string, selector_type: string, detect: string[]) => Promise<void>
    onCancel: () => void
  } = $props()

  type SelectorType = 'id' | 'simple' | 'css' | 'xpath'

  const hasId = !!descriptor.id
  let selectorType = $state<SelectorType>(hasId ? 'id' : 'simple')
  let detectContent = $state(true)
  let detectExists = $state(false)
  let detectCount = $state(false)
  let label = $state(descriptor.text.slice(0, 40) || `<${descriptor.tag}>`)
  let saving = $state(false)

  const selector = $derived<string>(
    selectorType === 'id' ? `#${descriptor.id}` :
    selectorType === 'simple' ? descriptor.simpleSelector :
    selectorType === 'css' ? descriptor.cssPath :
    descriptor.xpath
  )

  async function save() {
    const detect: string[] = []
    if (detectContent) detect.push('content')
    if (detectExists) detect.push('exists')
    if (detectCount) detect.push('count')
    if (detect.length === 0) return
    saving = true
    try {
      await onSave(label.trim() || `<${descriptor.tag}>`, selector, selectorType === 'xpath' ? 'xpath' : 'css', detect)
    } finally {
      saving = false
    }
  }
</script>

<div class="overlay" role="dialog" aria-modal="true">
  <div class="popup">
    <h2>Watch Element</h2>

    <div class="preview">
      <span class="tag">&lt;{descriptor.tag}&gt;</span>
      {#if descriptor.text}
        <span class="preview-text">{descriptor.text.slice(0, 80)}{descriptor.text.length > 80 ? '…' : ''}</span>
      {/if}
    </div>

    <p class="field-label">Label</p>
    <input class="text-input" bind:value={label} placeholder="e.g. Job Listings" maxlength="80" />

    <p class="field-label">How to identify this element</p>
    <div class="radio-group">
      {#if hasId}
        <label class="radio-row">
          <input type="radio" bind:group={selectorType} value="id" />
          <span>By ID</span>
          <code class="selector-preview">#{descriptor.id}</code>
        </label>
      {/if}
      <label class="radio-row">
        <input type="radio" bind:group={selectorType} value="simple" />
        <span>Simple</span>
        <code class="selector-preview">{descriptor.simpleSelector}</code>
      </label>
      <label class="radio-row">
        <input type="radio" bind:group={selectorType} value="css" />
        <span>Full CSS path</span>
        <code class="selector-preview">{descriptor.cssPath}</code>
      </label>
      <label class="radio-row">
        <input type="radio" bind:group={selectorType} value="xpath" />
        <span>XPath</span>
        <code class="selector-preview">{descriptor.xpath}</code>
      </label>
    </div>

    <p class="field-label">What counts as a change</p>
    <div class="check-group">
      <label class="check-row">
        <input type="checkbox" bind:checked={detectContent} />
        <span>Text content changes</span>
      </label>
      <label class="check-row">
        <input type="checkbox" bind:checked={detectExists} />
        <span>Element appears or disappears</span>
      </label>
      <label class="check-row">
        <input type="checkbox" bind:checked={detectCount} />
        <span>Number of children changes</span>
      </label>
    </div>

    <div class="actions">
      <button class="btn-cancel" onclick={onCancel} disabled={saving}>Cancel</button>
      <button
        class="btn-save"
        onclick={save}
        disabled={saving || (!detectContent && !detectExists && !detectCount)}
      >{saving ? 'Saving…' : 'Save Watcher'}</button>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 400;
  }

  .popup {
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 20px;
    width: 420px;
    max-width: 90vw;
    max-height: 80vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  h2 {
    font-size: 14px;
    font-weight: 600;
    margin: 0 0 4px;
    color: var(--text-0);
  }

  .preview {
    background: var(--bg-0);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 8px 10px;
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
  }

  .tag {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--accent);
    flex-shrink: 0;
  }

  .preview-text {
    font-size: 11px;
    color: var(--text-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .field-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-2);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-top: 4px;
  }

  .text-input {
    width: 100%;
    padding: 6px 8px;
    background: var(--bg-0);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text-0);
    font-size: 12px;
    box-sizing: border-box;
  }

  .text-input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .radio-group, .check-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .radio-row, .check-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 12px;
    color: var(--text-0);
    cursor: pointer;
  }

  .selector-preview {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-2);
    background: var(--bg-0);
    padding: 1px 5px;
    border-radius: 3px;
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex-shrink: 1;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 6px;
  }

  .btn-cancel {
    background: var(--bg-3);
    color: var(--text-1);
    font-size: 12px;
    padding: 6px 14px;
    border-radius: var(--radius);
  }

  .btn-cancel:hover:not(:disabled) { background: var(--bg-hover); }

  .btn-save {
    background: var(--accent);
    color: #000;
    font-size: 12px;
    font-weight: 600;
    padding: 6px 14px;
    border-radius: var(--radius);
  }

  .btn-save:hover:not(:disabled) { opacity: 0.85; }
  .btn-save:disabled, .btn-cancel:disabled { opacity: 0.5; cursor: default; }
</style>
