export function buildActionScript(action: {
    type: string
    selector?: string
    text?: string
}): string | null {
    switch (action.type) {
        case 'click_selector':
            return `(() => { const el = document.querySelector(${JSON.stringify(action.selector ?? '')}); if (el) el.click() })()`
        case 'click_text':
            return `(() => {
  const t = ${JSON.stringify(action.text ?? '')}
  const el = [...document.querySelectorAll('a,button,[role="button"],input[type="submit"]')]
    .find(e => e.textContent.trim().includes(t))
  if (el) el.click()
})()`
        case 'type':
            return `(() => {
  const el = document.querySelector(${JSON.stringify(action.selector ?? '')})
  if (el) {
    el.focus(); el.value = ${JSON.stringify(action.text ?? '')}
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }
})()`
        default:
            return null
    }
}
