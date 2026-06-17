<script lang="ts">
  import type { DiffLine, RuleChange } from '../types'

  let { diff, ruleChanges = [] }: { diff: DiffLine[]; ruleChanges?: RuleChange[] } = $props()

  const DETECT_LABELS: Record<string, string> = {
    content: 'content changed',
    exists: 'appeared/disappeared',
    count: 'child count changed'
  }

  function triggerLabel(trigger: string): string {
    if (trigger.startsWith('attr:')) return `attr "${trigger.slice(5)}" changed`
    return DETECT_LABELS[trigger] ?? trigger
  }

  type FlatLine = { type: 'added' | 'removed' | 'unchanged'; text: string }

  const lines = $derived<FlatLine[]>(
    diff.flatMap((chunk) =>
      chunk.value
        .split('\n')
        .filter((_, i, arr) => !(i === arr.length - 1 && arr[i] === ''))
        .map((text) => ({ type: chunk.type, text }))
    )
  )

  const changedLines = $derived(lines.filter((l) => l.type !== 'unchanged').length)
</script>

<div class="diff-wrap">
  {#if ruleChanges.length > 0}
    <div class="rule-banner">
      <span class="rule-banner-title">Rules triggered</span>
      {#each ruleChanges as rc}
        <div class="rule-change">
          <span class="rule-name">{rc.rule.label || rc.rule.selector}</span>
          <span class="rule-triggers">{rc.triggers.map(triggerLabel).join(', ')}</span>
        </div>
      {/each}
    </div>
  {/if}

  {#if changedLines === 0}
    <p class="no-changes">No changes detected between the last two scans.</p>
  {:else}
    <div class="diff-stats">
      <span class="added">+{lines.filter((l) => l.type === 'added').length} lines</span>
      <span class="removed">−{lines.filter((l) => l.type === 'removed').length} lines</span>
    </div>
    <div class="diff">
      {#each lines as line, i (i)}
        {#if line.type !== 'unchanged'}
          <div class="line {line.type}">
            <span class="gutter">{line.type === 'added' ? '+' : '−'}</span>
            <span class="content">{line.text || ' '}</span>
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .diff-wrap {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  .no-changes {
    color: var(--text-2);
    padding: 32px;
    text-align: center;
  }

  .diff-stats {
    display: flex;
    gap: 12px;
    margin-bottom: 12px;
    font-size: 12px;
  }

  .added { color: var(--green); }
  .removed { color: var(--red); }

  .diff {
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.6;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .line {
    display: flex;
    gap: 0;
  }

  .line.added {
    background: var(--green-dim);
  }

  .line.removed {
    background: var(--red-dim);
  }

  .gutter {
    width: 24px;
    flex-shrink: 0;
    text-align: center;
    padding: 0 4px;
    color: var(--text-2);
    user-select: none;
    border-right: 1px solid var(--border);
  }

  .line.added .gutter { color: var(--green); }
  .line.removed .gutter { color: var(--red); }

  .content {
    padding: 0 10px;
    white-space: pre-wrap;
    word-break: break-all;
    flex: 1;
    user-select: text;
  }

  .rule-banner {
    background: var(--accent-dim, rgba(249, 115, 22, 0.12));
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    padding: 10px 12px;
    margin-bottom: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .rule-banner-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--accent);
    margin-bottom: 2px;
  }

  .rule-change {
    display: flex;
    gap: 8px;
    align-items: baseline;
    font-size: 12px;
  }

  .rule-name {
    font-weight: 600;
    color: var(--text-0);
  }

  .rule-triggers {
    color: var(--text-2);
  }
</style>
