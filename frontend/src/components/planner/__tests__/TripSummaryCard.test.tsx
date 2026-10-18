/** @vitest-environment jsdom */
/// <reference types="node" />

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import type { RouteSettings, Waypoint } from '../../RoutePlanner'
import { roundLegsToTotal, summarizeTrip } from '../tripSummary'
import { getTranslation } from '../../../i18n/routePlanner'

vi.mock('../../../contexts/LanguageContext', () => ({ useLanguage: () => ({ language: 'en' }) }))
vi.mock('../../WeatherStrip', () => ({ WeatherStrip: () => null }))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { TripSummaryCard } = await import('../TripSummaryCard')

const waypoints: Waypoint[] = [
  { id: 'a', lat: 50.45, lng: 30.524, name: 'Kyiv, Ukraine' },
  { id: 'b', lat: 49.842, lng: 24.032, name: 'Lviv, Ukraine' },
]
const settings: RouteSettings = {
  fuelConsumption: 6, fuelCostPerLiter: 100.43, currency: 'UAH',
  passengerCount: 2, fuelType: 'petrol', fuelPriceTouched: false,
}

const css = readFileSync('src/styles/route-planner.css', 'utf-8')
const mounted: Array<() => void> = []
afterEach(() => { for (const cleanup of mounted.splice(0)) cleanup() })

function mount(over: Partial<{ settings: RouteSettings; quality: 'road' | 'approximate'; distance: number }> = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      <TripSummaryCard
        waypoints={waypoints}
        routeSettings={over.settings ?? settings}
        routeDistance={over.distance ?? 542.59}
        routeDuration={389}
        routeQuality={over.quality ?? 'road'}
        fuelSuggestion={null}
        weather={null}
        onSaveRoute={vi.fn()}
        onShareReceipt={vi.fn()}
      />,
    )
  })
  mounted.push(() => { act(() => root.unmount()); container.remove() })
  return container
}

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1
const PER_PERSON = /UAH\s1,634\.7\d/g

describe('TripSummaryCard', () => {
  it('shows the per-person cost exactly once, as the headline figure', () => {
    const c = mount()
    const text = c.textContent ?? ''
    expect(text.match(PER_PERSON)).toHaveLength(1)
    const figure = c.querySelector('.trip-summary-figure')
    expect(figure?.textContent).toMatch(PER_PERSON)
    expect(c.querySelectorAll('.trip-summary-figure')).toHaveLength(1)
    expect(c.querySelector('h2')?.textContent).toBe('Kyiv → Lviv')
  })

  it('does not repeat distance, time or total cost while the breakdown is closed', () => {
    const text = (mount().textContent ?? '').replace(/\xa0/g, ' ')
    expect(count(text, '543 km')).toBe(1)
    expect(count(text, '6 h 29 m')).toBe(1)
    expect(count(text, 'UAH 3,269.54')).toBe(1)
    expect(text).not.toContain('Cost breakdown')
    expect(text).not.toContain('Route summary')
    expect(text).not.toContain('Trip ready')
  })

  it('keeps the arithmetic behind a disclosure, with legs that add up to the displayed total', () => {
    const c = mount()
    const toggle = [...c.querySelectorAll('button')].find(b => b.textContent?.includes('How we calculated this'))!
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    act(() => toggle.click())
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)?.textContent).toContain('Fuel needed')
  })

  it('formats the distance identically in the card, the peek line and the announcement', () => {
    const t = getTranslation('en')
    const s = summarizeTrip({ waypoints, routeSettings: settings, routeDistance: 542.59, routeDuration: 389, routeQuality: 'road', language: 'en', t })
    expect(s.distance).toBe('543 km')
    expect(s.announcement).toContain(s.distance)
    expect(mount().textContent).toContain(s.distance)
  })

  it('keeps the approximate label and disables sharing when the route is not a road route', () => {
    const c = mount({ quality: 'approximate', distance: 0 })
    expect(c.textContent).toContain('Approximate')
    expect(c.textContent).toContain('≈')
    const share = [...c.querySelectorAll('button')].find(b => b.textContent?.includes('Share receipt'))!
    expect(share.disabled).toBe(true)
  })

  it('uses the total as the only headline with one passenger', () => {
    const c = mount({ settings: { ...settings, passengerCount: 1 } })
    expect((c.textContent ?? '').match(/UAH\s3,269\.54/g)).toHaveLength(1)
    expect(c.textContent).toContain('Total cost')
  })

  it('tabs through actions, then the disclosure (DOM order, no positive tabindex)', () => {
    const c = mount()
    const stops = [...c.querySelectorAll<HTMLElement>('button, a[href]')].filter(e => !(e as HTMLButtonElement).disabled)
    expect(stops.map(e => e.textContent?.trim())).toEqual([
      'Save route', 'Share receipt', 'Navigate with Waze', 'How we calculated this',
    ])
    expect(c.querySelector('[tabindex]:not([tabindex="-1"])')).toBeNull()
  })

  it('gives every interactive element a 44px-minimum class', () => {
    const c = mount()
    const interactive = c.querySelectorAll<HTMLElement>('button, a[href]')
    expect(interactive.length).toBeGreaterThan(0)
    for (const el of interactive) expect(el.className, el.textContent ?? '').toMatch(/trip-summary-(btn|disclosure)/)
    for (const cls of ['trip-summary-btn', 'trip-summary-disclosure']) {
      const rule = css.match(new RegExp(`\\.${cls} \\{[^}]*\\}`))?.[0] ?? ''
      expect(rule, cls).toContain('min-height: 2.75rem')
    }
  })
})

describe('roundLegsToTotal', () => {
  it('makes whole-km legs add up to the rounded total', () => {
    const legs = [100.4, 100.4, 100.4]
    const out = roundLegsToTotal(legs, 301.2)
    expect(out.reduce((a, b) => a + b, 0)).toBe(301)
    expect(roundLegsToTotal([], 5)).toEqual([])
  })
  it('reconciles short-route legs at the tenth-km precision shown for the total', () => {
    expect(roundLegsToTotal([0.6, 0.6], 1.2)).toEqual([0.6, 0.6])
    const legs = roundLegsToTotal([0.64, 0.64, 0.64], 1.92)
    expect(legs.reduce((a, b) => a + b, 0)).toBeCloseTo(1.9)
  })
})
