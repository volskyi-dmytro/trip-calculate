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
vi.mock('../../services/geocodingService', () => ({
  geocodingService: { reverseGeocode: vi.fn(async () => 'Rivne, Soborna') },
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const settings: RouteSettings = {
  fuelConsumption: 7.5, fuelCostPerLiter: 58, currency: 'UAH',
  passengerCount: 2, fuelType: 'petrol', fuelPriceTouched: false,
}
const waypoints: Waypoint[] = [
  { id: 'a', lat: 50.45003, lng: 30.52414, name: 'Kyiv' },
  { id: 'b', lat: 50.6199, lng: 26.2516, name: '50.6199, 26.2516' },
  { id: 'c', lat: 49.84195, lng: 24.03159, name: 'Lviv' },
]

const mounted: Array<() => void> = []
afterEach(() => { for (const cleanup of mounted.splice(0)) cleanup() })

async function mount(onUpdateWaypointName = vi.fn()) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <RoutePanel
        waypoints={waypoints} routeSettings={settings}
        onUpdateWaypointName={onUpdateWaypointName} onRemoveWaypoint={vi.fn()}
        onReorderWaypoints={vi.fn()} onUpdateSettings={vi.fn()} onAddManually={vi.fn()}
        fuelSuggestion={null} onApplyFuelSuggestion={vi.fn()}
        weather={null} departureDate="2026-10-01" onDepartureDateChange={vi.fn()}
      />,
    )
  })
  mounted.push(() => { act(() => root.unmount()); container.remove() })
  return { container, onUpdateWaypointName }
}

describe('RoutePanel waypoint rows', () => {
  it('shows the place name as the primary text and coordinates as a caption', async () => {
    const { container } = await mount()
    const inputs = [...container.querySelectorAll<HTMLInputElement>('input[aria-label^="Waypoint"]')]
    expect(inputs.map(i => i.value)).toEqual(['Kyiv', 'Waypoint 2', 'Lviv'])
    expect(container.textContent).toContain('50.450, 30.524')
    expect(container.textContent).toContain('49.842, 24.032')
  })

  it('replaces a coordinate-only name with the reverse-geocoded place name', async () => {
    const { onUpdateWaypointName } = await mount()
    expect(onUpdateWaypointName).toHaveBeenCalledWith('b', 'Rivne, Soborna')
    expect(onUpdateWaypointName).toHaveBeenCalledTimes(1)
  })

  it('names the stop in each delete control and keeps it at least 44px', async () => {
    const { container } = await mount()
    const del = container.querySelector<HTMLButtonElement>('button[aria-label="deleteWaypoint 1: Kyiv"], button[aria-label$="1: Kyiv"]')!
    expect(del).not.toBeNull()
    expect(del.className).toMatch(/\bh-11\b/)
    expect(del.className).toMatch(/\bw-11\b/)
  })

  it('keeps the "Add manually" control at least 44px high', async () => {
    const { container } = await mount()
    const add = [...container.querySelectorAll('button')].find(b => b.textContent?.includes('Add manually'))!
    expect(add.className).toContain('min-h-11')
  })
})
