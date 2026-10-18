/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlaceCombobox } from '../PlaceCombobox'
import { geocodingService, type Place } from '../../services/geocodingService'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const place = (name: string, lat: number): Place => ({ lat, lng: 0, name, displayName: `${name}, Ukraine`, addressType: 'city' })
let root: Root, host: HTMLDivElement
const onPick = vi.fn(), onSubmit = vi.fn(), onChange = vi.fn()

function setValue(input: HTMLInputElement, v: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, v)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const key = (el: Element, k: string) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })) })
const input = () => host.querySelector('input')!

async function typeQuery(q: string) {
  render(q)
  await act(async () => { await vi.advanceTimersByTimeAsync(500) })
}
function render(value: string) {
  act(() => root.render(<PlaceCombobox value={value} onChange={onChange} onPick={onPick} onSubmit={onSubmit} language="en" label="Start" />))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(geocodingService, 'searchPlaces').mockResolvedValue([place('Ternopil', 1), place('Ternopil Oblast', 2)])
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  onPick.mockReset(); onSubmit.mockReset(); onChange.mockReset()
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('PlaceCombobox (QA F2)', () => {
  it('exposes combobox/listbox/option roles with suggestions', async () => {
    await typeQuery('Ternopil')
    expect(input().getAttribute('role')).toBe('combobox')
    expect(input().getAttribute('aria-expanded')).toBe('true')
    const opts = host.querySelectorAll('[role="listbox"] [role="option"]')
    expect(opts).toHaveLength(2)
    expect(opts[0].textContent).toContain('Ternopil')
  })

  it('renders the list on an opaque surface so the field below does not show through', async () => {
    await typeQuery('Ternopil')
    const list = host.querySelector<HTMLElement>('[role="listbox"]')!
    expect(list.style.background).toContain('var(--surface)')
    expect(list.className).not.toMatch(/bg-popover|bg-transparent/)
  })

  it('ArrowDown + Enter picks the highlighted suggestion, not the first hit', async () => {
    await typeQuery('Ternopil')
    key(input(), 'ArrowDown'); key(input(), 'ArrowDown'); key(input(), 'Enter')
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ternopil Oblast' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('Enter with nothing highlighted falls back to onSubmit; Escape closes', async () => {
    await typeQuery('Ternopil')
    key(input(), 'Escape')
    expect(host.querySelector('[role="listbox"]')).toBeNull()
    key(input(), 'Enter')
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('does not search below 3 characters', async () => {
    await typeQuery('Te')
    expect(geocodingService.searchPlaces).not.toHaveBeenCalled()
  })

  it('typing calls onChange', () => {
    render('')
    act(() => setValue(input(), 'Lv'))
    expect(onChange).toHaveBeenCalledWith('Lv')
  })
})
