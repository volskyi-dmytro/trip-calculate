/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RoutePanel } from '../RoutePanel'
import type { RouteSettings, Waypoint } from '../RoutePlanner'

vi.mock('../../contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', t: (key: string) => key }),
}))
vi.mock('../WeatherStrip', () => ({ WeatherStrip: () => null }))
vi.mock('../car/CarPicker', () => ({ CarPicker: () => null }))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true

const valid: RouteSettings = {
  fuelConsumption: 7.5, fuelCostPerLiter: 58, currency: 'UAH',
  passengerCount: 2, fuelType: 'petrol', fuelPriceTouched: false,
}

const mounted: Array<() => void> = []
afterEach(() => { for (const cleanup of mounted.splice(0)) cleanup() })

function render(settings: RouteSettings, waypoints: Waypoint[] = []) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const draw = (s: RouteSettings, w: Waypoint[]) => act(() => {
    root.render(
      <RoutePanel
        waypoints={w} routeSettings={s}
        onUpdateWaypointName={vi.fn()} onRemoveWaypoint={vi.fn()}
        onReorderWaypoints={vi.fn()} onUpdateSettings={vi.fn()}
        fuelSuggestion={null} onApplyFuelSuggestion={vi.fn()}
        weather={null} departureDate="2026-10-01" onDepartureDateChange={vi.fn()}
      />,
    )
  })
  draw(settings, waypoints)
  mounted.push(() => { act(() => root.unmount()); container.remove() })
  const toggle = () => container.querySelector<HTMLButtonElement>('[aria-controls="route-settings-fields"]')!
  const fields = () => container.querySelector<HTMLElement>('#route-settings-fields')!
  return { container, toggle, fields, redraw: draw }
}

describe('RoutePanel settings disclosure', () => {
  it('starts collapsed with a truthful summary when defaults are valid', () => {
    const { toggle, fields } = render(valid)
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    expect(fields().hidden).toBe(true)
    expect(toggle().textContent).toContain('7.5 L/100 km · Passengers: 2')
  })

  it('keeps field values when collapsed and re-expanded', () => {
    const { toggle, fields } = render(valid)
    act(() => toggle().click())
    expect(fields().hidden).toBe(false)
    const consumption = () => fields().querySelector<HTMLInputElement>('#fuel-consumption')!
    expect(consumption().value).toBe('7.5')
    act(() => toggle().click())
    act(() => toggle().click())
    expect(consumption().value).toBe('7.5')
  })

  it('opens itself and explains when a required value is missing', () => {
    const { toggle, fields, redraw } = render(valid)
    expect(fields().hidden).toBe(true)
    redraw({ ...valid, fuelCostPerLiter: 0 }, [])
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
    expect(fields().textContent).toContain('Enter fuel consumption and price to see costs.')
  })
})

describe('RoutePanel waypoint empty state', () => {
  it('shows the illustration only while there are no waypoints', () => {
    const { container, redraw } = render(valid)
    const art = () => container.querySelector('img[src="/images/planner-v1/waypoints-empty.webp"]')
    expect(art()?.getAttribute('alt')).toBe('')
    expect(container.textContent).toContain('Add your first stop')

    redraw(valid, [{ id: '1', name: 'Kyiv', lat: 50.45, lng: 30.52 }])
    expect(art()).toBeNull()
    expect(container.querySelector('input[aria-label^="Waypoint 1"]')).not.toBeNull()
  })
})
