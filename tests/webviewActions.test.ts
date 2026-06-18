import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { executeWebviewAction } from '../src/renderer/src/lib/webviewActions'
import type { ScanAction } from '../src/renderer/src/types'

// ---------------------------------------------------------------------------
// WebviewLike mock factory
// ---------------------------------------------------------------------------
function makeWv() {
    return {
        executeJavaScript: vi.fn<[string], Promise<unknown>>(),
        sendInputEvent: vi.fn<
            [{ type: string; keyCode?: string; x?: number; y?: number; button?: string; clickCount?: number }],
            void
        >(),
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run `executeWebviewAction` while advancing fake timers so that every
 * internal `setTimeout` resolves without hanging the test.
 */
async function runAction(wv: ReturnType<typeof makeWv>, action: ScanAction) {
    const promise = executeWebviewAction(wv, action)
    // Advance all pending timers (may be called multiple times in a single action)
    await vi.runAllTimersAsync()
    await promise
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------
beforeEach(() => {
    vi.useFakeTimers()
})

afterEach(() => {
    vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// wait
// ---------------------------------------------------------------------------
describe('wait action', () => {
    it('awaits the specified ms', async () => {
        const wv = makeWv()
        const advance = vi.spyOn(globalThis, 'setTimeout')
        await runAction(wv, { type: 'wait', ms: 1200 })
        const calls = advance.mock.calls.map((c) => c[1])
        expect(calls).toContain(1200)
    })

    it('defaults to 500 ms when ms is undefined', async () => {
        const wv = makeWv()
        const advance = vi.spyOn(globalThis, 'setTimeout')
        await runAction(wv, { type: 'wait' })
        const calls = advance.mock.calls.map((c) => c[1])
        expect(calls).toContain(500)
    })
})

// ---------------------------------------------------------------------------
// click_selector
// ---------------------------------------------------------------------------
describe('click_selector action', () => {
    it('calls executeJavaScript with a non-empty script', async () => {
        const wv = makeWv()
        wv.executeJavaScript.mockResolvedValue(null)
        await runAction(wv, { type: 'click_selector', selector: '#btn' })
        expect(wv.executeJavaScript).toHaveBeenCalledOnce()
        const script = wv.executeJavaScript.mock.calls[0][0]
        expect(typeof script).toBe('string')
        expect(script.length).toBeGreaterThan(0)
    })

    it('sends mouseDown and mouseUp with rounded coordinates when rect is returned', async () => {
        const wv = makeWv()
        // Simulate fractional coordinates — the implementation uses Math.round
        wv.executeJavaScript.mockResolvedValue({ x: 42.6, y: 99.1 })
        await runAction(wv, { type: 'click_selector', selector: '#btn' })

        expect(wv.sendInputEvent).toHaveBeenCalledTimes(2)

        const [downCall, upCall] = wv.sendInputEvent.mock.calls
        expect(downCall[0]).toMatchObject({
            type: 'mouseDown',
            x: 43,
            y: 99,
            button: 'left',
            clickCount: 1,
        })
        expect(upCall[0]).toMatchObject({
            type: 'mouseUp',
            x: 43,
            y: 99,
            button: 'left',
            clickCount: 1,
        })
    })

    it('does NOT call sendInputEvent when executeJavaScript returns null', async () => {
        const wv = makeWv()
        wv.executeJavaScript.mockResolvedValue(null)
        await runAction(wv, { type: 'click_selector', selector: '#btn' })
        expect(wv.sendInputEvent).not.toHaveBeenCalled()
    })

    it('still waits 300 ms even when executeJavaScript returns null', async () => {
        const wv = makeWv()
        wv.executeJavaScript.mockResolvedValue(null)
        const advance = vi.spyOn(globalThis, 'setTimeout')
        await runAction(wv, { type: 'click_selector', selector: '#btn' })
        const delays = advance.mock.calls.map((c) => c[1])
        expect(delays).toContain(300)
    })

    it('does NOT call executeJavaScript when selector is empty', async () => {
        const wv = makeWv()
        // buildFindElementScript returns null for empty selector → script guard skips executeJavaScript
        await runAction(wv, { type: 'click_selector', selector: '' })
        expect(wv.executeJavaScript).not.toHaveBeenCalled()
    })

    it('does NOT call sendInputEvent when selector is empty', async () => {
        const wv = makeWv()
        await runAction(wv, { type: 'click_selector', selector: '' })
        expect(wv.sendInputEvent).not.toHaveBeenCalled()
    })

    it('still waits 300 ms when selector is empty', async () => {
        const wv = makeWv()
        const advance = vi.spyOn(globalThis, 'setTimeout')
        await runAction(wv, { type: 'click_selector', selector: '' })
        const delays = advance.mock.calls.map((c) => c[1])
        expect(delays).toContain(300)
    })
})

// ---------------------------------------------------------------------------
// click_text
// ---------------------------------------------------------------------------
describe('click_text action', () => {
    it('calls executeJavaScript with a non-empty script', async () => {
        const wv = makeWv()
        wv.executeJavaScript.mockResolvedValue(null)
        await runAction(wv, { type: 'click_text', text: 'Submit' })
        expect(wv.executeJavaScript).toHaveBeenCalledOnce()
        const script = wv.executeJavaScript.mock.calls[0][0]
        expect(typeof script).toBe('string')
        expect(script.length).toBeGreaterThan(0)
    })

    it('fires sendInputEvent when executeJavaScript returns a rect', async () => {
        const wv = makeWv()
        wv.executeJavaScript.mockResolvedValue({ x: 100, y: 200 })
        await runAction(wv, { type: 'click_text', text: 'Submit' })
        expect(wv.sendInputEvent).toHaveBeenCalledTimes(2)
        expect(wv.sendInputEvent.mock.calls[0][0].type).toBe('mouseDown')
        expect(wv.sendInputEvent.mock.calls[1][0].type).toBe('mouseUp')
    })

    it('does NOT call sendInputEvent when executeJavaScript returns null', async () => {
        const wv = makeWv()
        wv.executeJavaScript.mockResolvedValue(null)
        await runAction(wv, { type: 'click_text', text: 'Submit' })
        expect(wv.sendInputEvent).not.toHaveBeenCalled()
    })
})

// ---------------------------------------------------------------------------
// type
// ---------------------------------------------------------------------------
describe('type action', () => {
    it('calls executeJavaScript with the type script when selector is provided', async () => {
        const wv = makeWv()
        wv.executeJavaScript.mockResolvedValue(undefined)
        await runAction(wv, { type: 'type', selector: '#email', text: 'hello@example.com' })
        expect(wv.executeJavaScript).toHaveBeenCalledOnce()
        const script = wv.executeJavaScript.mock.calls[0][0]
        expect(typeof script).toBe('string')
        expect(script).toContain('#email')
    })

    it('calls executeJavaScript with no-op script when selector is empty', async () => {
        const wv = makeWv()
        wv.executeJavaScript.mockResolvedValue(undefined)
        await runAction(wv, { type: 'type', selector: '' })
        // buildActionScript returns '(()=>{})()'  for empty selector — it is truthy, so executeJavaScript IS called
        expect(wv.executeJavaScript).toHaveBeenCalledOnce()
        expect(wv.executeJavaScript.mock.calls[0][0]).toBe('(()=>{})()')
    })
})

// ---------------------------------------------------------------------------
// key
// ---------------------------------------------------------------------------
describe('key action', () => {
    it('fires keyDown then keyUp', async () => {
        const wv = makeWv()
        await runAction(wv, { type: 'key', key: 'Tab' })
        expect(wv.sendInputEvent).toHaveBeenCalledTimes(2)
        expect(wv.sendInputEvent.mock.calls[0][0].type).toBe('keyDown')
        expect(wv.sendInputEvent.mock.calls[1][0].type).toBe('keyUp')
    })

    it('defaults to Return when key is undefined', async () => {
        const wv = makeWv()
        await runAction(wv, { type: 'key' })
        expect(wv.sendInputEvent.mock.calls[0][0].keyCode).toBe('Return')
        expect(wv.sendInputEvent.mock.calls[1][0].keyCode).toBe('Return')
    })

    it('uses the specified key code', async () => {
        const wv = makeWv()
        await runAction(wv, { type: 'key', key: 'Escape' })
        expect(wv.sendInputEvent.mock.calls[0][0].keyCode).toBe('Escape')
        expect(wv.sendInputEvent.mock.calls[1][0].keyCode).toBe('Escape')
    })

    it('waits 200 ms after firing key events', async () => {
        const wv = makeWv()
        const advance = vi.spyOn(globalThis, 'setTimeout')
        await runAction(wv, { type: 'key', key: 'Tab' })
        const delays = advance.mock.calls.map((c) => c[1])
        expect(delays).toContain(200)
    })
})
