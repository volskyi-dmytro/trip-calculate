/** @vitest-environment jsdom */

import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { translate } from '../../i18n/common'
import fixtures from '../../../../fixtures/route-cost-v2.json'

let lang: 'en' | 'uk' = 'en'
const currencyLookup = vi.hoisted(() => vi.fn(async () => 55))
vi.mock('../../utils/currencyFuelPrice', () => ({ suggestFuelPrice: currencyLookup, convertFuelPrice: () => 55 }))
vi.mock('../../contexts/LanguageContext', () => ({
  useLanguage: () => ({
    language: lang,
    t: (k: string) => translate(lang, k),
    tn: (k: string) => translate(lang, k),
  }),
}))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('../car/CarPicker', () => ({ CarPicker: () => null }))
vi.mock('../receipt/ShareReceiptButton', () => ({ ShareReceiptButton: ({ payload }: { payload: unknown }) => <div data-testid="receipt-inputs" data-payload={JSON.stringify(payload)} /> }))

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
  it('keeps a usable local result for fractional passengers and ignores nonfinite price input', () => {
    const { container } = mount(<QuickCalculator prefill={{ distance: 100, consumption: 1, price: 1, passengers: 2, currency: 'EUR' }} />)
    const passengers = container.querySelector<HTMLInputElement>('#quick-passengers')!
    act(() => passengers.focus())
    type(passengers, '2.5')
    act(() => passengers.blur())
    expect(passengers.value).toBe('2')
    const price = container.querySelector<HTMLInputElement>('#quick-fuel-price')!
    act(() => price.focus())
    type(price, '1e999')
    act(() => price.blur())
    // QA F1: invalid text stays visible and flagged (no silent 0); the result resets, never stale.
    expect(price.value).toBe('1e999')
    expect(price.getAttribute('aria-invalid')).toBe('true')
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
    expect(container.querySelector('[aria-live="polite"]')!.textContent).toContain('0.00 EUR')
  })
  it('accepts a decimal comma in distance and recalculates (QA F1)', () => {
    const { container } = mount(<QuickCalculator prefill={{ distance: 0, consumption: 10, price: 10, passengers: 1, currency: 'EUR' }} />)
    const d = container.querySelector<HTMLInputElement>('#quick-distance')!
    act(() => d.focus())
    type(d, '10,5')
    act(() => d.blur())
    expect(d.value).toBe('10.5')
    expect(container.querySelector('[aria-live="polite"]')!.textContent).toContain('10.50 EUR')
  })
  it('normalizes typed decimals on blur without losing partial input', () => {
    const { container } = mount(<QuickCalculator prefill={{ distance: 100, consumption: 1, price: 1, passengers: 2, currency: 'EUR' }} />)
    const field = container.querySelector<HTMLInputElement>('#quick-fuel-price')!
    act(() => field.focus())
    type(field, '')
    expect(field.value).toBe('')
    type(field, '1.005')
    act(() => field.blur())
    expect(field.value).toBe('1.01')
    expect(container.querySelector('[aria-live="polite"]')!.textContent).toContain('0.51 EUR')
  })
  it.each(fixtures.cases)('matches fixture $rawDistanceKm km and $fuelPrice price in summary, scenario baseline and receipt', c => {
    const { container } = mount(<QuickCalculator prefill={{ distance: Number(c.rawDistanceKm), consumption: Number(c.fuelConsumption), price: Number(c.fuelPrice), passengers: c.people, currency: 'EUR' }} />)
    const figures = container.querySelector('[aria-live="polite"]')!.textContent
    expect(figures).toContain(`${c.totalCost} EUR`)
    expect(figures).toContain(`${c.costPerPerson} EUR`)
    expect(container.querySelector('details')!.textContent).toContain(`${c.totalCost} EUR · ${c.costPerPerson} EUR`)
    expect(JSON.parse(container.querySelector('[data-testid="receipt-inputs"]')!.getAttribute('data-payload')!)).toMatchObject({
      distanceKm: Number(c.distanceKm), fuelConsumption: Number(c.normalizedFuelConsumption), fuelPrice: Number(c.normalizedFuelPrice), people: c.people,
    })
    expect(container.querySelector<HTMLInputElement>('#quick-distance')!.value).toBe(String(Number(c.distanceKm)))
    expect(container.querySelector<HTMLInputElement>('#quick-consumption')!.value).toBe(String(Number(c.normalizedFuelConsumption)))
    expect(container.querySelector<HTMLInputElement>('#quick-fuel-price')!.value).toBe(String(Number(c.normalizedFuelPrice)))
  })
  it('preserves the established suggested-price conversion on an untouched currency change', async () => {
    currencyLookup.mockClear()
    const { container } = mount(<QuickCalculator prefill={{ distance: 100, consumption: 7.5, price: 1.75, currency: 'EUR' }} />)
    const select = container.querySelector<HTMLSelectElement>('#quick-currency')!
    await act(async () => { select.value = 'UAH'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(currencyLookup).toHaveBeenCalledExactlyOnceWith('UAH')
    expect(container.querySelector<HTMLInputElement>('#quick-fuel-price')!.value).toBe('55')
    expect(container.querySelector<HTMLInputElement>('#quick-consumption')!.value).toBe('7.5')
  })
  it('keeps a deliberately typed price on a currency change with zero network requests', async () => {
    currencyLookup.mockClear()
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    try {
      const { container } = mount(<QuickCalculator prefill={{ distance: 100, consumption: 7.5, price: 1.75, currency: 'EUR' }} />)
      type(container.querySelector<HTMLInputElement>('#quick-fuel-price')!, '1.76')
      const select = container.querySelector<HTMLSelectElement>('#quick-currency')!
      await act(async () => { select.value = 'UAH'; select.dispatchEvent(new Event('change', { bubbles: true })) })
      expect(container.querySelector<HTMLInputElement>('#quick-fuel-price')!.value).toBe('1.76')
      expect(container.querySelector<HTMLInputElement>('#quick-consumption')!.value).toBe('7.5')
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(currencyLookup).not.toHaveBeenCalled()
    } finally { vi.unstubAllGlobals() }
  })
  it('baseline equals the calculator figures, scenarios issue zero network requests, and edits do not change the baseline', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const xhrSpy = vi.spyOn(XMLHttpRequest.prototype, 'open')
    const beacon = vi.fn()
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true })

    const { container } = mount(<QuickCalculator example />)
    const perPerson = () => container.querySelector('[aria-live="polite"]')!.textContent
    const before = perPerson()
    expect(before).toContain('10.52 EUR')
    expect(before).toContain('42.08 EUR')

    const details = container.querySelector('details')!
    click(addButton(container))
    type(container.querySelector<HTMLInputElement>('details input[id$="consumption"]')!, '5')
    type(container.querySelector<HTMLInputElement>('details input[id$="passengers"]')!, '2')
    click(container.querySelector('button[aria-label="Remove scenario 1"]')!)
    click(addButton(container))

    // The scenario's baseline row is the calculator's own number.
    expect(details.textContent).toContain('42.08 EUR · 10.52 EUR')
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
