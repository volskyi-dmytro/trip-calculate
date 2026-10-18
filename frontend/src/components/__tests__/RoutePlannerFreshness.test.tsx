// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Waypoint } from '../RoutePlanner'
import type { RoutingResult } from '../../services/routingService'

const f = vi.hoisted(() => ({
  getRoute: vi.fn(), getSaved: vi.fn(), list: vi.fn(), update: vi.fn(), create: vi.fn(),
  user: { id: 1, name: 'Test', authenticated: true },
  route: { id: 1, name: 'Test route', fuelConsumption: 10, fuelCostPerLiter: 60, currency: 'UAH', passengerCount: 2,
    waypoints: [{ name: 'Kyiv', latitude: 50.45, longitude: 30.52 }, { name: 'Lviv', latitude: 49.84, longitude: 24.03 }] },
}))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: f.user }) }))
vi.mock('../../contexts/LanguageContext', () => ({ useLanguage: () => ({ language: 'en' }) }))
vi.mock('../MapContainer', () => ({ MapContainer: () => null }))
vi.mock('../RoutePanel', () => ({ RoutePanel: ({ waypoints, onReorderWaypoints }: { waypoints: Waypoint[]; onReorderWaypoints: (v: Waypoint[]) => void }) =>
  <button data-testid="edit-shape" onClick={() => onReorderWaypoints([waypoints[0], { ...waypoints[1], name: 'Honolulu', lat: 21.3, lng: -157.8 }])}>Edit destination</button>,
}))
vi.mock('../WeatherStrip', () => ({ WeatherStrip: () => null }))
vi.mock('../receipt/ShareReceiptModal', () => ({ ShareReceiptModal: () => <div data-testid="receipt-payload" /> }))
vi.mock('../../services/routeService', () => ({ routeService: { getUserRoutes: f.list, getRoute: f.getSaved, updateRoute: f.update, createRoute: f.create } }))
vi.mock('../../services/routingService', () => ({ routingService: { getRoute: f.getRoute } }))
vi.mock('../../services/carService', () => ({ carService: { list: async () => [] } }))
vi.mock('../../services/fuelPriceService', () => ({ getFuelSuggestion: async () => null, applyLiveFuelPrice: () => null }))
vi.mock('../../services/weatherService', () => ({ fetchCorridorWeather: async () => null }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

import { RoutePlanner } from '../RoutePlanner'
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root
let container: HTMLDivElement
const result = (over: Partial<RoutingResult> = {}): RoutingResult => ({ totalDistance: 100, totalDuration: 60,
  geometry: [[50.45, 30.52], [49.84, 24.03]], segments: [], quality: 'road', source: 'osrm', calculatedAt: '2026-10-18T00:00:00Z', ...over })
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}
async function mount() {
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  await act(async () => { root.render(<MemoryRouter initialEntries={['/en/route-planner?routeId=1']}><RoutePlanner /></MemoryRouter>) })
}
const button = (text: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === text)!
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); f.list.mockResolvedValue([]); f.getSaved.mockResolvedValue(f.route)
})
afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); document.body.style.overflow = '' })

describe('RoutePlanner input/result freshness', () => {
  it('invalidates old road provenance and disables save/share/export until the edited shape resolves', async () => {
    const replacement = deferred<RoutingResult>()
    f.getRoute.mockResolvedValueOnce(result()).mockReturnValueOnce(replacement.promise)
    await mount()
    expect(button('Share receipt').disabled).toBe(false)
    expect(container.textContent).toContain('100 km')
    await act(async () => { (container.querySelector('[data-testid="edit-shape"]') as HTMLButtonElement).click() })
    expect(button('Share receipt').disabled).toBe(true)
    expect(button('Update route').disabled).toBe(true)
    expect(button('Export JSON').disabled).toBe(true)
    expect(container.textContent).not.toContain('100 km')
    expect(container.querySelector('[data-testid="receipt-payload"]')).toBeNull()
    await act(async () => { replacement.resolve(result({ totalDistance: 200 })) })
    expect(button('Share receipt').disabled).toBe(false)
    expect(container.textContent).toContain('200 km')
  })
  it('does not label an unresolved initial calculation as an approximate estimate', async () => {
    f.getRoute.mockReturnValue(deferred<RoutingResult>().promise)
    await mount()
    expect(button('Share receipt').disabled).toBe(true)
    expect(button('Update route').disabled).toBe(true)
    expect(button('Export JSON').disabled).toBe(true)
    expect(container.textContent).not.toContain('≈')
    expect(container.querySelector('[data-testid="receipt-payload"]')).toBeNull()
  })
  it('does not expose a receipt after edited waypoints resolve to no route', async () => {
    const replacement = deferred<RoutingResult>()
    f.getRoute.mockResolvedValueOnce(result()).mockReturnValueOnce(replacement.promise)
    await mount()
    await act(async () => { (container.querySelector('[data-testid="edit-shape"]') as HTMLButtonElement).click() })
    await act(async () => { replacement.resolve(result({ quality: 'unavailable', totalDistance: 0, totalDuration: 0, geometry: [], noRoute: true })) })
    expect(container.querySelector('[data-testid="receipt-payload"]')).toBeNull()
    expect(container.textContent).not.toContain('100 km')
    expect(button('Export JSON').disabled).toBe(true)
    expect(f.update).not.toHaveBeenCalled()
    expect(f.create).not.toHaveBeenCalled()
  })
  it('ignores an older routing response after a newer shape has completed', async () => {
    const old = deferred<RoutingResult>()
    f.getRoute.mockReturnValueOnce(old.promise).mockResolvedValueOnce(result({ totalDistance: 200 }))
    await mount()
    await act(async () => { (container.querySelector('[data-testid="edit-shape"]') as HTMLButtonElement).click() })
    expect(container.textContent).toContain('200 km')
    await act(async () => { old.resolve(result({ totalDistance: 100 })) })
    expect(container.textContent).toContain('200 km')
    expect(container.textContent).not.toContain('100 km')
    expect(button('Share receipt').disabled).toBe(false)
  })
})
