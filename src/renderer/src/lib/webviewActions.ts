import type { ScanAction } from '../types'
import { buildActionScript } from '../../../shared/actionScripts'

type WebviewLike = {
    executeJavaScript(code: string): Promise<unknown>
    sendInputEvent(event: { type: string; keyCode?: string }): void
}

export async function executeWebviewAction(wv: WebviewLike, action: ScanAction): Promise<void> {
    switch (action.type) {
        case 'wait':
            await new Promise((r) => setTimeout(r, action.ms ?? 500))
            break
        case 'click_selector':
        case 'click_text':
            await wv.executeJavaScript(buildActionScript(action)!)
            await new Promise((r) => setTimeout(r, 300))
            break
        case 'type':
            await wv.executeJavaScript(buildActionScript(action)!)
            break
        case 'key':
            wv.sendInputEvent({ type: 'keyDown', keyCode: action.key ?? 'Return' })
            wv.sendInputEvent({ type: 'keyUp', keyCode: action.key ?? 'Return' })
            await new Promise((r) => setTimeout(r, 200))
            break
    }
}
