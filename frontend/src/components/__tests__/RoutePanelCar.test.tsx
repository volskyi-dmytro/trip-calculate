/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RoutePanel } from '../RoutePanel'
import type { RouteSettings } from '../RoutePlanner'
import type { GarageCar } from '../../types/Car'

vi.mock('../../contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', t: (key: string) => key }),
}))
vi.mock('../WeatherStrip', () => ({ WeatherStrip: () => null }))
vi.mock('../car/CarPicker', () => ({
  CarPicker: ({ open }: { open: boolean }) => (open ? <div data-testid="car-picker" /> : null),
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const doblo: GarageCar = {
  id: 5, name: 'Fiat Doblo', makeModel: 'Fiat Doblo 1.9 JTD', fuelType: 'diesel',
  fuelConsumption: 6, isDefault: true, source: 'catalog',
}
const settings: RouteSettings = {
  fuelConsumption: 6, fuelCostPerLiter: 98, currency: 'UAH',
  passengerCount: 2, fuelType: 'diesel', fuelPriceTouched: false,
}

const cleanups: Array<() => void> = []
afterEach(() => { for (const c of cleanups.splice(0)) c() })

function render(onSelectCar = vi.fn()) {
  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  const draw = () => act(() => root.render(
    <RoutePanel
      waypoints={[]} routeSettings={settings}
      onUpdateWaypointName={vi.fn()} onRemoveWaypoint={vi.fn()}
      onReorderWaypoints={vi.fn()} onUpdateSettings={vi.fn()}
      fuelSuggestion={null} onApplyFuelSuggestion={vi.fn()}
      weather={null} departureDate="2026-10-01" onDepartureDateChange={vi.fn()}
      garageCars={[doblo]} onSelectCar={onSelectCar}
    />,
  ))
  draw()
  cleanups.push(() => { act(() => root.unmount()); container.remove() })
  return { container, redraw: draw }
}

describe('RoutePanel car choice', () => {
  it('keeps "Custom" selected after a re-render (BUG-4)', () => {
    const { container, redraw } = render()
    const select = () => container.querySelector<HTMLSelectElement>('select')!
    expect(select().value).toBe('5')

    act(() => {
      select().value = 'custom'
      select().dispatchEvent(new Event('change', { bubbles: true }))
    })
    redraw()

    expect(select().value).toBe('custom')
  })

  it('offers the full car picker in route settings (BUG-3)', () => {
    const { container } = render()
    const button = [...container.querySelectorAll('button')].find(b => b.textContent === 'carPicker.title')!
    act(() => button.click())
    expect(container.querySelector('[data-testid="car-picker"]')).not.toBeNull()
  })
})
