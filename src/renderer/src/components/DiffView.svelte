<script lang="ts">
  import type { DiffLine } from '../types'

  let { diff }: { diff: DiffLine[] } = $props()

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
</style>
