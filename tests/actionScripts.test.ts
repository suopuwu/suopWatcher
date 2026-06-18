import { describe, it, expect } from 'vitest'
import { buildActionScript, buildFindElementScript } from '../src/shared/actionScripts'

// ---------------------------------------------------------------------------
// Helper: verify a string is syntactically valid JavaScript
// ---------------------------------------------------------------------------
function assertValidJS(script: string) {
    expect(() => new Function(script)).not.toThrow()
}

// ---------------------------------------------------------------------------
// buildActionScript
// ---------------------------------------------------------------------------
describe('buildActionScript', () => {
    it('returns a script for type action with a selector', () => {
        const result = buildActionScript({ type: 'type', selector: '#email', text: 'hello' })
        expect(result).not.toBeNull()
        expect(typeof result).toBe('string')
    })

    it('generated type script is valid JavaScript', () => {
        const result = buildActionScript({ type: 'type', selector: '#email', text: 'hello' })!
        assertValidJS(result)
    })

    it('type script contains the selector via JSON.stringify (safe injection)', () => {
        const result = buildActionScript({ type: 'type', selector: '#email', text: 'world' })!
        // JSON.stringify('#email') => '"#email"'
        expect(result).toContain('"#email"')
    })

    it('type script contains the text via JSON.stringify', () => {
        const result = buildActionScript({ type: 'type', selector: '#q', text: 'search term' })!
        expect(result).toContain('"search term"')
    })

    it('type script with special characters in selector is still valid JS', () => {
        const result = buildActionScript({ type: 'type', selector: 'input[name="q"]', text: 'test' })!
        assertValidJS(result)
        // JSON.stringify wraps in double-quotes and escapes internal quotes
        expect(result).toContain(JSON.stringify('input[name="q"]'))
    })

    it('type script with special characters in text is still valid JS', () => {
        const result = buildActionScript({ type: 'type', selector: '#x', text: "it's a \"quote\"" })!
        assertValidJS(result)
        expect(result).toContain(JSON.stringify("it's a \"quote\""))
    })

    it('type action with empty selector returns the no-op script', () => {
        const result = buildActionScript({ type: 'type', selector: '' })
        expect(result).toBe('(()=>{})()')
    })

    it('type action with undefined selector returns the no-op script', () => {
        const result = buildActionScript({ type: 'type' })
        expect(result).toBe('(()=>{})()')
    })

    it('no-op script is valid JavaScript', () => {
        const result = buildActionScript({ type: 'type', selector: '' })!
        assertValidJS(result)
    })

    it('type script without text defaults to empty string', () => {
        const result = buildActionScript({ type: 'type', selector: '#x' })!
        // JSON.stringify('') => '""'
        expect(result).toContain('""')
    })

    it('returns null for unknown action type', () => {
        expect(buildActionScript({ type: 'click' })).toBeNull()
        expect(buildActionScript({ type: 'hover' })).toBeNull()
        expect(buildActionScript({ type: '' })).toBeNull()
    })

    it('type script uses document.querySelector', () => {
        const result = buildActionScript({ type: 'type', selector: '#x', text: 'a' })!
        expect(result).toContain('document.querySelector')
    })

    it('type script dispatches input and change events', () => {
        const result = buildActionScript({ type: 'type', selector: '#x', text: 'a' })!
        expect(result).toContain("'input'")
        expect(result).toContain("'change'")
    })

    it('type script calls el.focus() and sets el.value', () => {
        const result = buildActionScript({ type: 'type', selector: '#x', text: 'a' })!
        expect(result).toContain('el.focus()')
        expect(result).toContain('el.value')
    })
})

// ---------------------------------------------------------------------------
// buildFindElementScript
// ---------------------------------------------------------------------------
describe('buildFindElementScript', () => {
    // --- click_selector ---

    it('returns a script for click_selector with a selector', () => {
        const result = buildFindElementScript({ type: 'click_selector', selector: '.btn' })
        expect(result).not.toBeNull()
        expect(typeof result).toBe('string')
    })

    it('click_selector script is valid JavaScript', () => {
        const result = buildFindElementScript({ type: 'click_selector', selector: '.btn' })!
        assertValidJS(result)
    })

    it('click_selector script contains the selector via JSON.stringify', () => {
        const result = buildFindElementScript({ type: 'click_selector', selector: '.btn' })!
        expect(result).toContain('".btn"')
    })

    it('click_selector with special characters in selector is valid JS', () => {
        const result = buildFindElementScript({ type: 'click_selector', selector: 'button[data-id="1"]' })!
        assertValidJS(result)
        expect(result).toContain(JSON.stringify('button[data-id="1"]'))
    })

    it('click_selector script returns center coordinates shape (getBoundingClientRect)', () => {
        const result = buildFindElementScript({ type: 'click_selector', selector: '.btn' })!
        expect(result).toContain('getBoundingClientRect')
        expect(result).toContain('r.left + r.width / 2')
        expect(result).toContain('r.top + r.height / 2')
        expect(result).toContain('return { x:')
        expect(result).toContain('y:')
    })

    it('click_selector with empty selector returns null', () => {
        expect(buildFindElementScript({ type: 'click_selector', selector: '' })).toBeNull()
    })

    it('click_selector with undefined selector returns null', () => {
        expect(buildFindElementScript({ type: 'click_selector' })).toBeNull()
    })

    it('click_selector script uses document.querySelector', () => {
        const result = buildFindElementScript({ type: 'click_selector', selector: '.x' })!
        expect(result).toContain('document.querySelector')
    })

    // --- click_text ---

    it('returns a script for click_text with text', () => {
        const result = buildFindElementScript({ type: 'click_text', text: 'Submit' })
        expect(result).not.toBeNull()
        expect(typeof result).toBe('string')
    })

    it('click_text script is valid JavaScript', () => {
        const result = buildFindElementScript({ type: 'click_text', text: 'Submit' })!
        assertValidJS(result)
    })

    it('click_text script contains the text via JSON.stringify', () => {
        const result = buildFindElementScript({ type: 'click_text', text: 'Submit' })!
        expect(result).toContain('"Submit"')
    })

    it('click_text with special characters in text is valid JS', () => {
        const result = buildFindElementScript({ type: 'click_text', text: "Don't click \"me\"" })!
        assertValidJS(result)
        expect(result).toContain(JSON.stringify("Don't click \"me\""))
    })

    it('click_text script searches a, button, [role="button"], input[type="submit"]', () => {
        const result = buildFindElementScript({ type: 'click_text', text: 'Go' })!
        expect(result).toContain('a,button,[role="button"],input[type="submit"]')
    })

    it('click_text script matches by textContent', () => {
        const result = buildFindElementScript({ type: 'click_text', text: 'Go' })!
        expect(result).toContain('textContent')
        expect(result).toContain('.trim()')
        expect(result).toContain('.includes(')
    })

    it('click_text script returns center coordinates shape', () => {
        const result = buildFindElementScript({ type: 'click_text', text: 'Go' })!
        expect(result).toContain('getBoundingClientRect')
        expect(result).toContain('r.left + r.width / 2')
        expect(result).toContain('r.top + r.height / 2')
        expect(result).toContain('return { x:')
    })

    it('click_text with empty text still returns a script (matches any element)', () => {
        const result = buildFindElementScript({ type: 'click_text', text: '' })
        // empty text: the impl does not short-circuit, it still builds a script
        expect(result).not.toBeNull()
        expect(typeof result).toBe('string')
    })

    it('click_text with empty text script is valid JavaScript', () => {
        const result = buildFindElementScript({ type: 'click_text', text: '' })!
        assertValidJS(result)
    })

    it('click_text with undefined text defaults to empty string in script', () => {
        const result = buildFindElementScript({ type: 'click_text' })!
        // JSON.stringify('') => '""'
        expect(result).toContain('""')
    })

    // --- unknown type ---

    it('returns null for unknown action type', () => {
        expect(buildFindElementScript({ type: 'type' })).toBeNull()
        expect(buildFindElementScript({ type: 'hover' })).toBeNull()
        expect(buildFindElementScript({ type: '' })).toBeNull()
    })
})
