export function buildActionScript(action: {
    type: string
    selector?: string
    text?: string
}): string | null {
    if (action.type !== 'type') return null
    const sel = action.selector ?? ''
    if (!sel) return '(()=>{})()'
    return `(() => { try {
  const el = document.querySelector(${JSON.stringify(sel)})
  if (el) {
    el.focus(); el.value = ${JSON.stringify(action.text ?? '')}
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }
} catch(e) {} })()`
}

// Returns a script that evaluates to {x, y} (element center) or null if not found.
// Used by callers that then fire sendInputEvent for a trusted mouse click.
export function buildFindElementScript(action: {
    type: string
    selector?: string
    text?: string
}): string | null {
    if (action.type === 'click_selector') {
        const sel = action.selector ?? ''
        if (!sel) return null
        return `(() => { try {
  const el = document.querySelector(${JSON.stringify(sel)})
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
} catch(e) { return null } })()`
    }
    if (action.type === 'click_text') {
        const t = action.text ?? ''
        return `(() => {
  const t = ${JSON.stringify(t)}
  const el = [...document.querySelectorAll('a,button,[role="button"],input[type="submit"]')]
    .find(e => (e.textContent ?? '').trim().includes(t))
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
})()`
    }
    return null
}
