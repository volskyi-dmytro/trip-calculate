/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BlockingErrorDialog } from '../BlockingErrorDialog'
import { routePlannerTranslations } from '../../i18n/routePlanner'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const cleanups: Array<() => void> = []
afterEach(() => { for (const c of cleanups.splice(0)) c() })

function render(onClose = vi.fn(), label = 'OK') {
  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  act(() => root.render(
    <BlockingErrorDialog
      error={{ title: 'No driving route', description: 'No road connects Lviv and Vancouver.' }}
      onClose={onClose}
      acknowledgeLabel={label}
    />,
  ))
  cleanups.push(() => { act(() => root.unmount()); container.remove() })
  return onClose
}

describe('BlockingErrorDialog', () => {
  it('stays on screen as an alert dialog until acknowledged', () => {
    const onClose = render()
    const dialog = document.querySelector('[role="alertdialog"]')!
    expect(dialog.textContent).toContain('No road connects Lviv and Vancouver.')
    expect(onClose).not.toHaveBeenCalled()

    act(() => [...dialog.querySelectorAll('button')].find(b => b.textContent === 'OK')!.click())
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders nothing without an error', () => {
    const container = document.body.appendChild(document.createElement('div'))
    const root = createRoot(container)
    act(() => root.render(<BlockingErrorDialog error={null} onClose={vi.fn()} acknowledgeLabel="OK" />))
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
    act(() => root.unmount())
  })

  it('has an acknowledge label in both languages', () => {
    expect(routePlannerTranslations.en.planner.acknowledge).toBe('OK')
    expect(routePlannerTranslations.uk.planner.acknowledge).toBe('Зрозуміло')
  })
})
