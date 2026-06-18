import { describe, it, expect } from 'vitest'
import { buildPickerScript, buildExtractionScript } from '../src/renderer/src/lib/elementPicker'
import type { WatchRule } from '../src/renderer/src/types'

// Helper: assert a string is syntactically valid JS by wrapping it in new Function.
function assertValidJS(code: string, label: string) {
  expect(() => new Function(code), `${label} must be syntactically valid JS`).not.toThrow()
}

// ─── buildPickerScript ───────────────────────────────────────────────────────

describe('buildPickerScript', () => {
  it('returns a string', () => {
    expect(typeof buildPickerScript()).toBe('string')
  })

  it('is syntactically valid JS', () => {
    assertValidJS(buildPickerScript(), 'buildPickerScript()')
  })

  it('sets __pickerActive', () => {
    expect(buildPickerScript()).toContain('__pickerActive')
  })

  it('sets __pickerResult', () => {
    expect(buildPickerScript()).toContain('__pickerResult')
  })

  it('sets __pickerCancel', () => {
    expect(buildPickerScript()).toContain('__pickerCancel')
  })

  it('applies hover CSS class __watcher-hover', () => {
    expect(buildPickerScript()).toContain('__watcher-hover')
  })

  it('defines getCssPath helper', () => {
    expect(buildPickerScript()).toContain('getCssPath')
  })

  it('defines getXPath helper', () => {
    expect(buildPickerScript()).toContain('getXPath')
  })

  it('defines getSimpleSelector helper', () => {
    expect(buildPickerScript()).toContain('getSimpleSelector')
  })

  it('is an IIFE (self-executing function)', () => {
    const script = buildPickerScript()
    expect(script.trim()).toMatch(/^\(function/)
    expect(script.trim()).toMatch(/\)\(\)\s*$/)
  })
})

// ─── buildExtractionScript — empty rules ────────────────────────────────────

describe('buildExtractionScript with empty rules', () => {
  it('returns exactly "({})" for an empty array', () => {
    expect(buildExtractionScript([])).toBe('({})')
  })
})

// ─── buildExtractionScript — CSS selector rule ──────────────────────────────

describe('buildExtractionScript with a css selector rule', () => {
  const cssRule: WatchRule = {
    id: 1,
    website_id: 10,
    label: 'Price',
    selector: '.price > span',
    selector_type: 'css',
    detect: ['content', 'exists'],
    created_at: 0,
  }

  it('returns a string', () => {
    expect(typeof buildExtractionScript([cssRule])).toBe('string')
  })

  it('is syntactically valid JS', () => {
    assertValidJS(buildExtractionScript([cssRule]), 'css rule script')
  })

  it('contains the selector', () => {
    expect(buildExtractionScript([cssRule])).toContain('.price > span')
  })

  it('uses document.querySelector for css selectors', () => {
    expect(buildExtractionScript([cssRule])).toContain('document.querySelector')
  })

  it('includes the rule id in the output', () => {
    expect(buildExtractionScript([cssRule])).toContain('states[1]')
  })

  it('does NOT use document.evaluate (xpath) for css selectors', () => {
    expect(buildExtractionScript([cssRule])).not.toContain('document.evaluate')
  })
})

// ─── buildExtractionScript — XPath rule ─────────────────────────────────────

describe('buildExtractionScript with an xpath rule', () => {
  const xpathRule: WatchRule = {
    id: 42,
    website_id: 10,
    label: 'Heading',
    selector: '//h1[@class="title"]',
    selector_type: 'xpath',
    detect: ['content'],
    created_at: 0,
  }

  it('returns a string', () => {
    expect(typeof buildExtractionScript([xpathRule])).toBe('string')
  })

  it('is syntactically valid JS', () => {
    assertValidJS(buildExtractionScript([xpathRule]), 'xpath rule script')
  })

  it('uses document.evaluate for xpath selectors', () => {
    expect(buildExtractionScript([xpathRule])).toContain('document.evaluate')
  })

  it('references XPathResult', () => {
    expect(buildExtractionScript([xpathRule])).toContain('XPathResult')
  })

  it('contains the xpath selector string', () => {
    // JSON.stringify escapes inner quotes, so selector appears as "//h1[@class=\"title\"]"
    expect(buildExtractionScript([xpathRule])).toContain('//h1[@class=')
  })

  it('includes the rule id in the output', () => {
    expect(buildExtractionScript([xpathRule])).toContain('states[42]')
  })

  it('does NOT use document.querySelector for xpath selectors', () => {
    expect(buildExtractionScript([xpathRule])).not.toContain('document.querySelector')
  })
})

// ─── buildExtractionScript — page / regex_count rule ────────────────────────

describe('buildExtractionScript with a page rule and regex_count detects', () => {
  // The types.ts WatchRule only declares 'css' | 'xpath' for selector_type,
  // but the implementation handles 'page'. Cast via `as any` to test it.
  const pageRule = {
    id: 7,
    website_id: 10,
    label: 'Count of errors',
    selector: '',
    selector_type: 'page' as any,
    detect: ['regex_count:error', 'regex_count:\\d+ items'],
    created_at: 0,
  } as WatchRule

  it('returns a string', () => {
    expect(typeof buildExtractionScript([pageRule])).toBe('string')
  })

  it('is syntactically valid JS', () => {
    assertValidJS(buildExtractionScript([pageRule]), 'page rule script')
  })

  it('reads fullText from document body', () => {
    expect(buildExtractionScript([pageRule])).toContain('fullText')
  })

  it('stores regex counts in regexCounts', () => {
    expect(buildExtractionScript([pageRule])).toContain('regexCounts')
  })

  it('embeds the regex patterns from the detect array', () => {
    const script = buildExtractionScript([pageRule])
    expect(script).toContain('error')
    expect(script).toContain('\\\\d+ items')
  })

  it('includes the rule id in the output', () => {
    expect(buildExtractionScript([pageRule])).toContain('states[7]')
  })

  it('does NOT use document.querySelector or document.evaluate', () => {
    const script = buildExtractionScript([pageRule])
    expect(script).not.toContain('document.querySelector')
    expect(script).not.toContain('document.evaluate')
  })
})

// ─── buildExtractionScript — multiple rules ──────────────────────────────────

describe('buildExtractionScript with multiple rules', () => {
  const rules: WatchRule[] = [
    {
      id: 100,
      website_id: 10,
      label: 'Rule A',
      selector: '#main',
      selector_type: 'css',
      detect: ['exists'],
      created_at: 0,
    },
    {
      id: 200,
      website_id: 10,
      label: 'Rule B',
      selector: '//div',
      selector_type: 'xpath',
      detect: ['content'],
      created_at: 0,
    },
    {
      id: 300,
      website_id: 10,
      label: 'Rule C',
      selector: '.item',
      selector_type: 'css',
      detect: ['count'],
      created_at: 0,
    },
  ]

  it('is syntactically valid JS', () => {
    assertValidJS(buildExtractionScript(rules), 'multi-rule script')
  })

  it('includes each rule id in the script', () => {
    const script = buildExtractionScript(rules)
    expect(script).toContain('states[100]')
    expect(script).toContain('states[200]')
    expect(script).toContain('states[300]')
  })

  it('contains both document.querySelector (css) and document.evaluate (xpath)', () => {
    const script = buildExtractionScript(rules)
    expect(script).toContain('document.querySelector')
    expect(script).toContain('document.evaluate')
  })

  it('wraps everything in a single outer IIFE returning states', () => {
    const script = buildExtractionScript(rules)
    expect(script).toContain('var states = {}')
    expect(script).toContain('return states')
  })
})
