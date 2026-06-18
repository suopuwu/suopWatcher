import type { ScanAction } from '../types'
import { buildActionScript, buildFindElementScript } from '../../../shared/actionScripts'

type WebviewLike = {
    executeJavaScript(code: string): Promise<unknown>
    sendInputEvent(event: { type: string; keyCode?: string; x?: number; y?: number; button?: string; clickCount?: number }): void
}

export async function executeWebviewAction(wv: WebviewLike, action: ScanAction): Promise<void> {
    switch (action.type) {
        case 'wait':
            await new Promise((r) => setTimeout(r, action.ms ?? 500))
            break
        case 'click_selector':
        case 'click_text': {
            const script = buildFindElementScript(action)
            if (script) {
                const rect = await wv.executeJavaScript(script) as { x: number; y: number } | null
                if (rect) {
                    wv.sendInputEvent({ type: 'mouseDown', x: Math.round(rect.x), y: Math.round(rect.y), button: 'left', clickCount: 1 })
                    wv.sendInputEvent({ type: 'mouseUp', x: Math.round(rect.x), y: Math.round(rect.y), button: 'left', clickCount: 1 })
                }
            }
            await new Promise((r) => setTimeout(r, 300))
            break
        }
        case 'type': {
            const script = buildActionScript(action)
            if (script) await wv.executeJavaScript(script)
            break
        }
        case 'key':
            wv.sendInputEvent({ type: 'keyDown', keyCode: action.key ?? 'Return' })
            wv.sendInputEvent({ type: 'keyUp', keyCode: action.key ?? 'Return' })
            await new Promise((r) => setTimeout(r, 200))
            break
    }
}
