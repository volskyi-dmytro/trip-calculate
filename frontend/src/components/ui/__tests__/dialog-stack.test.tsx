/** @vitest-environment jsdom */

import { act, StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../dialog'
import { ConfirmDialog } from '../confirm-dialog'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  document.body.style.overflow = ''
})

function Harness({ showLoad = true, showConfirmation = true }: { showLoad?: boolean; showConfirmation?: boolean }) {
  const [loadOpen, setLoadOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  return (
    <>
      <button onClick={() => setLoadOpen(true)}>Open saved trips</button>
      {showLoad && <Dialog open={loadOpen} onOpenChange={setLoadOpen}>
        <DialogContent>
          <DialogTitle>Load saved trip</DialogTitle>
          <DialogDescription>Choose a trip to load.</DialogDescription>
          <button>Load trip</button>
          <button onClick={() => setDeleteOpen(true)}>Delete saved trip</button>
        </DialogContent>
      </Dialog>}
      {showConfirmation && <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete saved trip?"
        description="This cannot be undone."
        cancelLabel="Cancel"
        confirmLabel="Delete"
        onConfirm={() => {}}
      />}
    </>
  )
}

const button = (label: string) =>
  [...document.querySelectorAll('button')].find(b => b.textContent === label)!
const click = (label: string) => {
  button(label).focus()
  act(() => button(label).click())
}
const press = (key: string, shiftKey = false) => {
  const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true })
  act(() => { document.activeElement!.dispatchEvent(event) })
  return event
}

function mount() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(<StrictMode><Harness /></StrictMode>))
  const unmount = () => {
    act(() => root.unmount())
    container.remove()
  }
  cleanups.push(unmount)
  click('Open saved trips')
  click('Delete saved trip')
  return { root, unmount }
}

describe('Dialog keyboard stack', () => {
  it('unmounting the confirmation restores the underlying trap and keeps scroll locked', () => {
    const { root } = mount()
    act(() => root.render(<StrictMode><Harness showConfirmation={false} /></StrictMode>))
    expect(document.activeElement).toBe(button('Delete saved trip'))
    expect(document.body.style.overflow).toBe('hidden')
    press('Tab')
    expect(document.activeElement).toBe(button('Load trip'))
    press('Escape')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.body.style.overflow).toBe('')
  })

  it('unmounting a lower dialog does not steal focus from the confirmation', () => {
    const { root } = mount()
    act(() => root.render(<StrictMode><Harness showLoad={false} /></StrictMode>))
    expect(document.activeElement).toBe(button('Cancel'))
    expect(document.body.style.overflow).toBe('hidden')
    press('Tab', true)
    expect(document.activeElement).toBe(button('Delete'))
    press('Escape')
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
    expect(document.body.style.overflow).toBe('')
    expect(document.activeElement).toBe(button('Open saved trips'))
  })

  it('returns focus outside the stack when both dialog layers unmount together', () => {
    const { root } = mount()
    act(() => root.render(<StrictMode><Harness showLoad={false} showConfirmation={false} /></StrictMode>))
    expect(document.querySelector('[role="dialog"], [role="alertdialog"]')).toBeNull()
    expect(document.body.style.overflow).toBe('')
    expect(document.activeElement).toBe(button('Open saved trips'))
  })

  it('cleans up an open stack so a newly mounted StrictMode dialog owns the keyboard', () => {
    const { root } = mount()
    function InitiallyOpen() {
      const [open, setOpen] = useState(true)
      return <Dialog open={open} onOpenChange={setOpen}><button>Only action</button></Dialog>
    }
    // Replacing the entire open stack also exercises StrictMode effect replay.
    act(() => root.render(<StrictMode><InitiallyOpen /></StrictMode>))
    expect(document.activeElement).toBe(button('Only action'))
    expect(press('Tab').defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(button('Only action'))
    press('Escape')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.body.style.overflow).toBe('')
  })

  it('lets only the confirmation trap Tab, leaving native traversal between its actions intact', () => {
    mount()
    expect(document.activeElement).toBe(button('Cancel'))
    // jsdom has no native Tab navigation: verify the event is not cancelled,
    // then perform the browser default move before checking both wrap edges.
    expect(press('Tab').defaultPrevented).toBe(false)
    button('Delete').focus()
    expect(press('Tab').defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(button('Cancel'))
    expect(press('Tab', true).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(button('Delete'))
    expect(press('Tab', true).defaultPrevented).toBe(false)
    button('Cancel').focus()
  })

  it('Escape closes only the confirmation and restores focus to its underlying delete control', () => {
    document.body.style.overflow = 'auto'
    mount()
    press('Escape')
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(document.activeElement).toBe(button('Delete saved trip'))
    expect(document.body.style.overflow).toBe('hidden')
    press('Tab')
    expect(document.activeElement).toBe(button('Load trip'))
    press('Escape')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(button('Open saved trips'))
    expect(document.body.style.overflow).toBe('auto')
  })
})
