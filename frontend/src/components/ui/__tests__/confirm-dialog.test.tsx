/** @vitest-environment jsdom */

import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from '../confirm-dialog'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

function mount(onConfirm: () => void) {
  function Harness() {
    const [open, setOpen] = useState(true)
    return (
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete receipt?"
        description="The link will stop working."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={onConfirm}
      />
    )
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(<Harness />))
  cleanups.push(() => {
    act(() => root.unmount())
    container.remove()
  })
}

const button = (label: string) =>
  [...document.querySelectorAll('button')].find(b => b.textContent === label)!

describe('ConfirmDialog', () => {
  it('is an alertdialog named by its title and focuses the safe action first', () => {
    mount(vi.fn())
    const dialog = document.querySelector('[role="alertdialog"]')!
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe('Delete receipt?')
    expect(document.activeElement).toBe(button('Cancel'))
  })

  it('confirms and closes', () => {
    const onConfirm = vi.fn()
    mount(onConfirm)
    act(() => button('Delete').click())
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
  })

  it('cancels without confirming', () => {
    const onConfirm = vi.fn()
    mount(onConfirm)
    act(() => button('Cancel').click())
    expect(onConfirm).not.toHaveBeenCalled()
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
  })
})