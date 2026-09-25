/** @vitest-environment jsdom */

import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../dialog'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

function Harness({ startOpen = true }: { startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen)
  return (
    <>
      <button id="opener" onClick={() => setOpen(true)}>open</button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Delete account</DialogTitle>
          <DialogDescription>This cannot be undone.</DialogDescription>
          <button id="first">Cancel</button>
          <button id="last">Delete</button>
        </DialogContent>
      </Dialog>
    </>
  )
}

function mount(startOpen = true) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(<Harness startOpen={startOpen} />))
  cleanups.push(() => {
    act(() => root.unmount())
    container.remove()
  })
  return container
}

const press = (key: string, shiftKey = false) =>
  act(() => {
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }))
  })

describe('Dialog', () => {
  it('is a labelled modal dialog', () => {
    const container = mount()
    const dialog = container.querySelector('[role="dialog"]')!
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    const title = document.getElementById(dialog.getAttribute('aria-labelledby')!)
    expect(title?.textContent).toBe('Delete account')
    const description = document.getElementById(dialog.getAttribute('aria-describedby')!)
    expect(description?.textContent).toBe('This cannot be undone.')
  })

  it('moves focus inside when it opens and back to the opener when it closes', () => {
    const container = mount(false)
    const opener = container.querySelector<HTMLButtonElement>('#opener')!
    opener.focus()
    act(() => opener.click())
    expect(document.activeElement?.id).toBe('first')

    press('Escape')
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('keeps Tab inside the dialog', () => {
    mount()
    document.getElementById('last')!.focus()
    press('Tab')
    expect(document.activeElement?.id).toBe('first')
    press('Tab', true)
    expect(document.activeElement?.id).toBe('last')
  })
})
