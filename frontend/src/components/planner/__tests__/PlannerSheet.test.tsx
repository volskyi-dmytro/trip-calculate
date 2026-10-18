/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlannerSheet, type SheetSnap } from '../PlannerSheet'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const labels = { region: 'Route details', expand: 'Expand', collapse: 'Collapse', full: 'Full height', half: 'Half height' }
const mounted: Array<() => void> = []
afterEach(() => { for (const cleanup of mounted.splice(0)) cleanup() })

function mount(snap: SheetSnap, onSnapChange = vi.fn()) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      <PlannerSheet snap={snap} onSnapChange={onSnapChange} labels={labels} peek={<p>peek</p>} footer={<p>footer</p>}>
        <button type="button">inside</button>
      </PlannerSheet>,
    )
  })
  mounted.push(() => { act(() => root.unmount()); container.remove() })
  return { container, onSnapChange }
}

describe('PlannerSheet', () => {
  it('is a labelled region whose trigger exposes aria-expanded and aria-controls', () => {
    const { container } = mount('half')
    const region = container.querySelector('[role="region"]')!
    expect(region.getAttribute('aria-label')).toBe('Route details')
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-expanded]')!
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(document.getElementById(trigger.getAttribute('aria-controls')!)).not.toBeNull()
    expect(trigger.className).toContain('min-h-11')
  })

  it('shows only the peek content when collapsed', () => {
    const { container } = mount('peek')
    expect(container.textContent).toContain('peek')
    expect(container.textContent).not.toContain('inside')
    expect(container.querySelector('button[aria-expanded]')!.getAttribute('aria-expanded')).toBe('false')
  })

  it('collapses on Escape from inside the sheet and returns focus to the trigger', () => {
    const { container, onSnapChange } = mount('half')
    const inner = [...container.querySelectorAll('button')].find(b => b.textContent === 'inside')!
    inner.focus()
    act(() => { inner.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(onSnapChange).toHaveBeenCalledWith('peek')
    expect(document.activeElement).toBe(container.querySelector('button[aria-expanded]'))
  })

  it('ignores Escape when already collapsed or when the key came from outside (portaled dialog)', () => {
    const collapsed = mount('peek')
    act(() => { collapsed.container.querySelector('p')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(collapsed.onSnapChange).not.toHaveBeenCalled()
  })

  it('offers a 44px full/half toggle only when expanded', () => {
    const { container, onSnapChange } = mount('half')
    const toggle = container.querySelector<HTMLButtonElement>('button[aria-label="Full height"]')!
    expect(toggle.className).toContain('h-11')
    act(() => toggle.click())
    expect(onSnapChange).toHaveBeenCalledWith('full')
  })
})
