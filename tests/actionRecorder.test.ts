import { describe, it, expect } from 'vitest'
import { buildRecorderScript } from '../src/renderer/src/lib/actionRecorder'

describe('buildRecorderScript', () => {
  it('returns a non-empty string', () => {
    const script = buildRecorderScript()
    expect(typeof script).toBe('string')
    expect(script.length).toBeGreaterThan(0)
  })

  it('produces valid JavaScript syntax (parseable by new Function)', () => {
    const script = buildRecorderScript()
    expect(() => new Function(script)).not.toThrow()
  })

  describe('expected patterns are present', () => {
    it('contains __recorderActive', () => {
      expect(buildRecorderScript()).toContain('__recorderActive')
    })

    it('contains __recordedActions', () => {
      expect(buildRecorderScript()).toContain('__recordedActions')
    })

    it('contains click_text action type', () => {
      expect(buildRecorderScript()).toContain('click_text')
    })

    it('contains click_selector action type', () => {
      expect(buildRecorderScript()).toContain('click_selector')
    })

    it('listens for focusin events', () => {
      expect(buildRecorderScript()).toContain('focusin')
    })

    it('listens for focusout events', () => {
      expect(buildRecorderScript()).toContain('focusout')
    })

    it('listens for click events', () => {
      expect(buildRecorderScript()).toContain("'click'")
    })

    it('records a type action on focusout', () => {
      expect(buildRecorderScript()).toContain("type: 'type'")
    })
  })

  describe('double-injection guard', () => {
    it('checks __recorderActive at the very start of the IIFE body', () => {
      const script = buildRecorderScript()
      // The guard must appear before window.__recorderActive is set to true
      const guardIndex = script.indexOf('if (window.__recorderActive) return')
      const setIndex = script.indexOf('window.__recorderActive = true')
      expect(guardIndex).toBeGreaterThan(-1)
      expect(setIndex).toBeGreaterThan(-1)
      expect(guardIndex).toBeLessThan(setIndex)
    })

    it('the IIFE is self-contained (starts with (function() { and ends with })()', () => {
      const script = buildRecorderScript().trim()
      expect(script.startsWith('(function()')).toBe(true)
      expect(script.endsWith(')()') || script.endsWith(')()')).toBe(true)
    })
  })

  describe('getSelector helper logic', () => {
    it('contains an id-based shortcut (#id)', () => {
      const script = buildRecorderScript()
      // The helper returns '#' + el.id when id is present
      expect(script).toContain("'#' + el.id")
    })

    it('contains classList usage for class-based selectors', () => {
      expect(buildRecorderScript()).toContain('classList')
    })

    it('contains nth-of-type for disambiguating siblings', () => {
      expect(buildRecorderScript()).toContain('nth-of-type')
    })

    it('walks up to an ancestor with an id (parts.unshift + #id break)', () => {
      const script = buildRecorderScript()
      // The while-loop ancestor id check
      expect(script).toContain("'#' + node.id")
    })

    it('joins selector parts with " > " separator', () => {
      expect(buildRecorderScript()).toContain("' > '")
    })
  })

  describe('behavioural smoke-test via jsdom-like eval', () => {
    // Run the script in a minimal simulated browser context so we can verify
    // the recording logic end-to-end without a real browser.

    function makeContext() {
      const listeners: Record<string, Function[]> = {}
      const recordedActions: object[] = []

      const mockEl = (overrides: Partial<{
        tagName: string; id: string; type: string; role: string | null;
        textContent: string; value: string; isContentEditable: boolean;
        classList: { list: string[]; add(c: string): void; remove(c: string): void };
        nodeType: number; parentNode: null; children: never[];
        getAttribute(name: string): string | null;
      }> = {}) => {
        const cls = { list: [] as string[], add(c: string) { this.list.push(c) }, remove(c: string) { this.list = this.list.filter(x => x !== c) } }
        return {
          tagName: 'DIV', id: '', type: '', role: null, textContent: '', value: '',
          isContentEditable: false, classList: cls, nodeType: 1, parentNode: null,
          children: [] as never[],
          getAttribute(name: string) { return name === 'role' ? this.role : null },
          ...overrides,
        }
      }

      const window: Record<string, unknown> = {
        __recorderActive: false,
        __recordedActions: recordedActions,
      }

      const document = {
        createElement: (_tag: string) => ({ textContent: '', appendChild: () => {} }),
        head: { appendChild: () => {} },
        addEventListener(event: string, fn: Function) {
          if (!listeners[event]) listeners[event] = []
          listeners[event].push(fn)
        },
      }

      // CSS.escape is referenced by the script
      const CSS = { escape: (s: string) => s }

      const setTimeout = (_fn: Function, _ms: number) => {}

      return { window, document, CSS, setTimeout, listeners, recordedActions, mockEl }
    }

    function evalScript(ctx: ReturnType<typeof makeContext>) {
      const script = buildRecorderScript()
      // Wrap in a function that has the context vars in scope
      // eslint-disable-next-line no-new-func
      const fn = new Function('window', 'document', 'CSS', 'setTimeout', script)
      fn(ctx.window, ctx.document, ctx.CSS, ctx.setTimeout)
    }

    it('sets __recorderActive = true after injection', () => {
      const ctx = makeContext()
      evalScript(ctx)
      expect(ctx.window.__recorderActive).toBe(true)
    })

    it('initialises __recordedActions as an empty array', () => {
      const ctx = makeContext()
      evalScript(ctx)
      expect(Array.isArray(ctx.window.__recordedActions)).toBe(true)
      expect((ctx.window.__recordedActions as unknown[]).length).toBe(0)
    })

    it('does nothing on second injection (double-injection guard)', () => {
      const ctx = makeContext()
      // Simulate already-injected state
      ctx.window.__recorderActive = true
      ctx.window.__recordedActions = ['already there'] as unknown[]
      evalScript(ctx)
      // __recordedActions must not be reset
      expect(ctx.window.__recordedActions).toEqual(['already there'])
      // No new listeners added
      expect(Object.keys(ctx.listeners).length).toBe(0)
    })

    it('records click_text for a button element with text', () => {
      const ctx = makeContext()
      evalScript(ctx)

      const btn = ctx.mockEl({ tagName: 'BUTTON', textContent: 'Submit' })
      ctx.listeners['click']?.[0]?.({ target: btn })

      const actions = ctx.window.__recordedActions as { type: string; text?: string }[]
      expect(actions).toHaveLength(1)
      expect(actions[0].type).toBe('click_text')
      expect(actions[0].text).toBe('Submit')
    })

    it('records click_selector for a non-clickable element', () => {
      const ctx = makeContext()
      evalScript(ctx)

      const div = ctx.mockEl({ tagName: 'DIV', textContent: 'some text', id: 'myDiv' })
      ctx.listeners['click']?.[0]?.({ target: div })

      const actions = ctx.window.__recordedActions as { type: string; selector?: string }[]
      expect(actions).toHaveLength(1)
      expect(actions[0].type).toBe('click_selector')
      expect(actions[0].selector).toBe('#myDiv')
    })

    it('records type action on focusout when value changed', () => {
      const ctx = makeContext()
      evalScript(ctx)

      const input = ctx.mockEl({ tagName: 'INPUT', type: 'text', value: 'hello', id: 'myInput' })
      // focusin — capture initial value
      ctx.listeners['focusin']?.[0]?.({ target: input })
      // change value
      input.value = 'hello world'
      // focusout — should record type action
      ctx.listeners['focusout']?.[0]?.({ target: input })

      const actions = ctx.window.__recordedActions as { type: string; text?: string; selector?: string }[]
      expect(actions).toHaveLength(1)
      expect(actions[0].type).toBe('type')
      expect(actions[0].text).toBe('hello world')
      expect(actions[0].selector).toBe('#myInput')
    })

    it('does not record type action when value did not change', () => {
      const ctx = makeContext()
      evalScript(ctx)

      const input = ctx.mockEl({ tagName: 'INPUT', type: 'text', value: 'same', id: 'inp' })
      ctx.listeners['focusin']?.[0]?.({ target: input })
      ctx.listeners['focusout']?.[0]?.({ target: input })

      expect((ctx.window.__recordedActions as unknown[]).length).toBe(0)
    })

    it('does not record click for editable elements (INPUT)', () => {
      const ctx = makeContext()
      evalScript(ctx)

      const input = ctx.mockEl({ tagName: 'INPUT', type: 'text', textContent: 'ignored' })
      ctx.listeners['click']?.[0]?.({ target: input })

      expect((ctx.window.__recordedActions as unknown[]).length).toBe(0)
    })
  })
})
