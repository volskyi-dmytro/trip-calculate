/** @vitest-environment jsdom */

import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { translate } from '../../i18n/common'

let lang: 'en' | 'uk' = 'en'
vi.mock('../../contexts/LanguageContext', () => ({
  useLanguage: () => ({
    language: lang,
    t: (k: string) => translate(lang, k),
    tn: (k: string) => translate(lang, k),
  }),
}))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('../car/CarPicker', () => ({ CarPicker: () => null }))
vi.mock('../receipt/ShareReceiptButton', () => ({ ShareReceiptButton: () => null }))

const { ScenarioComparison } = await import('../calculator/ScenarioComparison')
const { QuickCalculator } = await import('../QuickCalculator')

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const c of cleanups.splice(0)) c()
  lang = 'en'
  vi.restoreAllMocks()
})

function mount(node: React.ReactNode) {
  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  act(() => root.render(node))
  cleanups.push(() => { act(() => root.unmount()); container.remove() })
  return { container, rerender: (n: React.ReactNode) => act(() => root.render(n)) }
}

function type(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const click = (el: Element) => act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
const byLabel = (c: HTMLElement, text: string) =>
  Array.from(c.querySelectorAll('label')).find((l) => l.textContent === text)!

const baseline = { distanceKm: 584, consumption: 7.5, price: 1.75, passengers: 4 }
const addButton = (c: HTMLElement) => Array.from(c.querySelectorAll('button')).find((b) => b.textContent === 'Add scenario')!

describe('ScenarioComparison', () => {
  it('shows the baseline and a blank scenario that equals it', () => {
    const { container } = mount(<ScenarioComparison baseline={baseline} currency="EUR" />)
    expect(container.textContent).toContain('76.65 EUR · 19.16 EUR')
    click(addButton(container))
    expect(container.textContent).toContain('Same as your estimate')
  })

  it('prices an edited scenario on the same distance and reports the delta', () => {
    const { container } = mount(<ScenarioComparison baseline={baseline} currency="EUR" />)
    click(addButton(container))
    type(container.querySelector<HTMLInputElement>('input[id$="consumption"]')!, '5')
    expect(container.textContent).toContain('51.10 EUR · 12.78 EUR')
    expect(container.textContent).toContain('−25.55 EUR')
  })

  it('guards invalid input without showing a fake result', () => {
    const { container } = mount(<ScenarioComparison baseline={baseline} currency="EUR" />)
    click(addButton(container))
    const price = container.querySelector<HTMLInputElement>('input[id$="price"]')!
    type(price, 'abc')
    expect(price.getAttribute('aria-invalid')).toBe('true')
    expect(container.textContent).toContain('Enter a valid number')
    expect(container.textContent).toContain('Fix the highlighted field')
    type(container.querySelector<HTMLInputElement>('input[id$="passengers"]')!, '2.5')
    expect(container.textContent).not.toContain('0.00 EUR')
  })

  it('moves focus to the new scenario on add and back to Add on remove', () => {
    const { container } = mount(<ScenarioComparison baseline={baseline} currency="EUR" />)
    click(addButton(container))
    expect(document.activeElement).toBe(container.querySelector('input[id$="consumption"]'))
    click(container.querySelector('button[aria-label="Remove scenario 1"]')!)
    expect(container.querySelector('fieldset')).toBeNull()
    expect(document.activeElement).toBe(addButton(container))
  })

  it('caps scenarios at three', () => {
    const { container } = mount(<ScenarioComparison baseline={baseline} currency="EUR" />)
    for (let i = 0; i < 4; i++) {
      const b = container.querySelector<HTMLButtonElement>('button[id$="-add"]')!
      if (!b.disabled) click(b)
    }
    expect(container.querySelectorAll('fieldset')).toHaveLength(3)
    expect(container.querySelector<HTMLButtonElement>('button[id$="-add"]')!.disabled).toBe(true)
  })

  it('follows baseline changes and never writes to the baseline object', () => {
    const frozen = Object.freeze({ ...baseline })
    const { container, rerender } = mount(<ScenarioComparison baseline={frozen} currency="EUR" />)
    click(addButton(container))
    type(container.querySelector<HTMLInputElement>('input[id$="price"]')!, '2')
    expect(frozen).toEqual(baseline)
    rerender(<ScenarioComparison baseline={{ ...baseline, distanceKm: 100 }} currency="EUR" />)
    // 100 km * 7.5 L/100 * 2 = 15.00 total, edit preserved across the baseline change
    expect(container.textContent).toContain('15.00 EUR · 3.75 EUR')
    expect(container.querySelector<HTMLInputElement>('input[id$="price"]')!.value).toBe('2')
  })

  it('preserves edits when the locale switches', () => {
    const { container, rerender } = mount(<ScenarioComparison baseline={baseline} currency="EUR" />)
    click(addButton(container))
    type(container.querySelector<HTMLInputElement>('input[id$="consumption"]')!, '5')
    lang = 'uk'
    rerender(<ScenarioComparison baseline={baseline} currency="EUR" />)
    expect(container.textContent).toContain('Сценарій 1')
    expect(container.querySelector<HTMLInputElement>('input[id$="consumption"]')!.value).toBe('5')
    expect(container.textContent).toContain('51.10 EUR')
  })
})

describe('QuickCalculator + scenarios', () => {
  it('baseline equals the calculator figures, scenarios issue zero network requests, and edits do not change the baseline', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const xhrSpy = vi.spyOn(XMLHttpRequest.prototype, 'open')
    const beacon = vi.fn()
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true })

    const { container } = mount(<QuickCalculator example />)
    const perPerson = () => container.querySelector('[aria-live="polite"]')!.textContent
    const before = perPerson()
    expect(before).toContain('19.16 EUR')
    expect(before).toContain('76.65 EUR')

    const details = container.querySelector('details')!
    click(addButton(container))
    type(container.querySelector<HTMLInputElement>('details input[id$="consumption"]')!, '5')
    type(container.querySelector<HTMLInputElement>('details input[id$="passengers"]')!, '2')
    click(container.querySelector('button[aria-label="Remove scenario 1"]')!)
    click(addButton(container))

    // The scenario's baseline row is the calculator's own number.
    expect(details.textContent).toContain('76.65 EUR · 19.16 EUR')
    expect(perPerson()).toBe(before)
    expect((container.querySelector('#quick-consumption') as HTMLInputElement).value).toBe('7.5')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(xhrSpy).not.toHaveBeenCalled()
    expect(beacon).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('keeps scenario edits when the example language switches', () => {
    function Host() {
      const [n, setN] = useState(0)
      return <><button id="sw" onClick={() => { lang = 'uk'; setN(n + 1) }} /><QuickCalculator example /></>
    }
    const { container } = mount(<Host />)
    click(addButton(container))
    type(container.querySelector<HTMLInputElement>('details input[id$="price"]')!, '3')
    click(container.querySelector('#sw')!)
    expect(container.querySelector<HTMLInputElement>('details input[id$="price"]')!.value).toBe('3')
    expect(byLabel(container, 'Відстань (км)')).toBeTruthy()
  })
})
