import { describe, it, expect, vi } from 'vitest'

vi.mock('../src/main/db', () => ({
    getDb: () => ({
        prepare: () => ({
            get: () => undefined,
            all: () => [],
            run: () => {},
        }),
    }),
}))

import { resolveUrl, mimeFromUrl, extractText, ruleTriggered } from '../src/main/scanner'
import type { DbWatchRule, RuleState } from '../src/main/scanner'

// ─── resolveUrl ───────────────────────────────────────────────────────────────

describe('resolveUrl', () => {
    const base = 'https://example.com/page/'

    it('returns null for empty string', () => {
        expect(resolveUrl('', base)).toBeNull()
    })

    it('returns null for data: href', () => {
        expect(resolveUrl('data:text/plain;base64,aGVsbG8=', base)).toBeNull()
    })

    it('returns null for blob: href', () => {
        expect(resolveUrl('blob:https://example.com/abc-123', base)).toBeNull()
    })

    it('returns null for #anchor href', () => {
        expect(resolveUrl('#section', base)).toBeNull()
    })

    it('returns null for javascript: href', () => {
        expect(resolveUrl('javascript:void(0)', base)).toBeNull()
    })

    it('resolves relative URL against base', () => {
        expect(resolveUrl('about.html', base)).toBe('https://example.com/page/about.html')
    })

    it('returns absolute http URL (normalized)', () => {
        expect(resolveUrl('http://other.com/path', base)).toBe('http://other.com/path')
    })

    it('returns absolute https URL', () => {
        expect(resolveUrl('https://other.com/path', base)).toBe('https://other.com/path')
    })

    it('returns null for ftp: protocol', () => {
        expect(resolveUrl('ftp://files.example.com/file.txt', base)).toBeNull()
    })
})

// ─── mimeFromUrl ──────────────────────────────────────────────────────────────

describe('mimeFromUrl', () => {
    it('.png → image/png', () => {
        expect(mimeFromUrl('https://example.com/image.png')).toBe('image/png')
    })

    it('.jpg → image/jpeg', () => {
        expect(mimeFromUrl('https://example.com/photo.jpg')).toBe('image/jpeg')
    })

    it('.jpeg → image/jpeg', () => {
        expect(mimeFromUrl('https://example.com/photo.jpeg')).toBe('image/jpeg')
    })

    it('.gif → image/gif', () => {
        expect(mimeFromUrl('https://example.com/anim.gif')).toBe('image/gif')
    })

    it('.svg → image/svg+xml', () => {
        expect(mimeFromUrl('https://example.com/icon.svg')).toBe('image/svg+xml')
    })

    it('.webp → image/webp', () => {
        expect(mimeFromUrl('https://example.com/image.webp')).toBe('image/webp')
    })

    it('.ico → image/x-icon', () => {
        expect(mimeFromUrl('https://example.com/favicon.ico')).toBe('image/x-icon')
    })

    it('.woff → font/woff', () => {
        expect(mimeFromUrl('https://example.com/font.woff')).toBe('font/woff')
    })

    it('.woff2 → font/woff2', () => {
        expect(mimeFromUrl('https://example.com/font.woff2')).toBe('font/woff2')
    })

    it('unknown extension → application/octet-stream', () => {
        expect(mimeFromUrl('https://example.com/archive.xyz')).toBe('application/octet-stream')
    })

    it('URL with query string — extension extracted before ?', () => {
        expect(mimeFromUrl('https://example.com/image.png?v=123&size=large')).toBe('image/png')
    })
})

// ─── extractText ──────────────────────────────────────────────────────────────

describe('extractText', () => {
    it('removes <script> blocks', () => {
        const html = '<html><body><p>Hello</p><script>alert("xss")</script></body></html>'
        expect(extractText(html)).not.toContain('alert')
        expect(extractText(html)).toContain('Hello')
    })

    it('removes <style> blocks', () => {
        const html = '<html><head><style>body { color: red; }</style></head><body><p>Text</p></body></html>'
        expect(extractText(html)).not.toContain('color')
        expect(extractText(html)).toContain('Text')
    })

    it('removes HTML comments', () => {
        const html = '<p>Visible<!-- hidden comment -->text</p>'
        expect(extractText(html)).not.toContain('hidden comment')
        expect(extractText(html)).toContain('Visible')
    })

    it('converts block tags to newlines', () => {
        const html = '<div>First</div><div>Second</div>'
        const result = extractText(html)
        // Each block tag becomes a newline, so they should appear on separate lines
        const lines = result.split('\n')
        expect(lines).toContain('First')
        expect(lines).toContain('Second')
    })

    it('converts <p> to newline', () => {
        const html = '<p>Para one</p><p>Para two</p>'
        const result = extractText(html)
        const lines = result.split('\n')
        expect(lines).toContain('Para one')
        expect(lines).toContain('Para two')
    })

    it('converts <br> to newline', () => {
        const html = 'Line one<br>Line two'
        const result = extractText(html)
        const lines = result.split('\n')
        expect(lines).toContain('Line one')
        expect(lines).toContain('Line two')
    })

    it('strips remaining inline tags', () => {
        const html = '<p>Hello <strong>world</strong></p>'
        const result = extractText(html)
        expect(result).not.toContain('<strong>')
        expect(result).not.toContain('</strong>')
        expect(result).toContain('Hello')
        expect(result).toContain('world')
    })

    it('decodes &nbsp;', () => {
        const html = '<p>Hello&nbsp;World</p>'
        expect(extractText(html)).toContain('Hello World')
    })

    it('decodes &amp;', () => {
        const html = '<p>A &amp; B</p>'
        expect(extractText(html)).toContain('A & B')
    })

    it('decodes &lt;', () => {
        const html = '<p>1 &lt; 2</p>'
        expect(extractText(html)).toContain('1 < 2')
    })

    it('decodes &gt;', () => {
        const html = '<p>2 &gt; 1</p>'
        expect(extractText(html)).toContain('2 > 1')
    })

    it('decodes &quot;', () => {
        const html = '<p>Say &quot;hello&quot;</p>'
        expect(extractText(html)).toContain('Say "hello"')
    })

    it('collapses horizontal whitespace', () => {
        const html = '<p>too    many   spaces</p>'
        expect(extractText(html)).toContain('too many spaces')
    })

    it('filters empty lines', () => {
        const html = '<div></div><div>Content</div><div></div>'
        const result = extractText(html)
        const lines = result.split('\n')
        expect(lines.every((l) => l.length > 0)).toBe(true)
    })

    it('trims each line', () => {
        const html = '<div>  leading and trailing  </div>'
        const result = extractText(html)
        const lines = result.split('\n')
        lines.forEach((l) => {
            expect(l).toBe(l.trim())
        })
    })
})

// ─── ruleTriggered ────────────────────────────────────────────────────────────

function makeState(overrides: Partial<RuleState> = {}): RuleState {
    return {
        exists: true,
        text: 'hello',
        childCount: 3,
        attrs: { class: 'foo' },
        regexCounts: {},
        ...overrides,
    }
}

function makeRule(detects: string[]): DbWatchRule {
    return { id: 1, detect: JSON.stringify(detects) }
}

describe('ruleTriggered', () => {
    it('returns false when prev is undefined', () => {
        expect(ruleTriggered(makeRule(['exists']), undefined, makeState())).toBe(false)
    })

    it('returns false when curr is undefined', () => {
        expect(ruleTriggered(makeRule(['exists']), makeState(), undefined)).toBe(false)
    })

    describe('exists detect', () => {
        it('returns true when exists changes true→false', () => {
            const prev = makeState({ exists: true })
            const curr = makeState({ exists: false })
            expect(ruleTriggered(makeRule(['exists']), prev, curr)).toBe(true)
        })

        it('returns true when exists changes false→true', () => {
            const prev = makeState({ exists: false })
            const curr = makeState({ exists: true })
            expect(ruleTriggered(makeRule(['exists']), prev, curr)).toBe(true)
        })

        it('returns false when exists stays the same', () => {
            const prev = makeState({ exists: true })
            const curr = makeState({ exists: true })
            expect(ruleTriggered(makeRule(['exists']), prev, curr)).toBe(false)
        })
    })

    describe('content detect', () => {
        it('returns true when text changes', () => {
            const prev = makeState({ text: 'before' })
            const curr = makeState({ text: 'after' })
            expect(ruleTriggered(makeRule(['content']), prev, curr)).toBe(true)
        })

        it('returns false when text stays the same', () => {
            const prev = makeState({ text: 'same' })
            const curr = makeState({ text: 'same' })
            expect(ruleTriggered(makeRule(['content']), prev, curr)).toBe(false)
        })
    })

    describe('count detect', () => {
        it('returns true when childCount changes', () => {
            const prev = makeState({ childCount: 2 })
            const curr = makeState({ childCount: 5 })
            expect(ruleTriggered(makeRule(['count']), prev, curr)).toBe(true)
        })

        it('returns false when childCount stays the same', () => {
            const prev = makeState({ childCount: 3 })
            const curr = makeState({ childCount: 3 })
            expect(ruleTriggered(makeRule(['count']), prev, curr)).toBe(false)
        })
    })

    describe('attr: detect', () => {
        it('returns true when the specified attr changes', () => {
            const prev = makeState({ attrs: { class: 'foo' } })
            const curr = makeState({ attrs: { class: 'bar' } })
            expect(ruleTriggered(makeRule(['attr:class']), prev, curr)).toBe(true)
        })

        it('returns false when the specified attr stays the same', () => {
            const prev = makeState({ attrs: { class: 'foo' } })
            const curr = makeState({ attrs: { class: 'foo' } })
            expect(ruleTriggered(makeRule(['attr:class']), prev, curr)).toBe(false)
        })

        it('returns true when attr goes from missing to present', () => {
            const prev = makeState({ attrs: {} })
            const curr = makeState({ attrs: { class: 'new' } })
            expect(ruleTriggered(makeRule(['attr:class']), prev, curr)).toBe(true)
        })
    })

    describe('regex_count: detect', () => {
        it('returns true when regexCounts[pattern] changes', () => {
            const prev = makeState({ regexCounts: { foo: 2 } })
            const curr = makeState({ regexCounts: { foo: 5 } })
            expect(ruleTriggered(makeRule(['regex_count:foo']), prev, curr)).toBe(true)
        })

        it('returns false when regexCounts[pattern] stays the same', () => {
            const prev = makeState({ regexCounts: { foo: 3 } })
            const curr = makeState({ regexCounts: { foo: 3 } })
            expect(ruleTriggered(makeRule(['regex_count:foo']), prev, curr)).toBe(false)
        })

        it('returns true when pattern count goes from missing (0) to present', () => {
            const prev = makeState({ regexCounts: {} })
            const curr = makeState({ regexCounts: { foo: 1 } })
            expect(ruleTriggered(makeRule(['regex_count:foo']), prev, curr)).toBe(true)
        })
    })

    describe('multiple detects', () => {
        it('triggers if ANY detect fires', () => {
            const prev = makeState({ text: 'before', childCount: 2 })
            const curr = makeState({ text: 'before', childCount: 5 }) // only count changed
            expect(ruleTriggered(makeRule(['content', 'count']), prev, curr)).toBe(true)
        })

        it('does not trigger if no detect fires', () => {
            const prev = makeState({ text: 'same', childCount: 3 })
            const curr = makeState({ text: 'same', childCount: 3 })
            expect(ruleTriggered(makeRule(['content', 'count']), prev, curr)).toBe(false)
        })
    })

    describe('unknown detect key', () => {
        it('returns false for unknown detect key', () => {
            const prev = makeState()
            const curr = makeState({ text: 'different' }) // text changed but detect is unknown
            expect(ruleTriggered(makeRule(['unknown_key']), prev, curr)).toBe(false)
        })
    })
})
