// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoutingResult } from '../../services/routingService'

// QA F3: a route opened from the Load dialog must save as an update, with an explicit "Save as new".
const f = vi.hoisted(() => {
  const waypoints = [{ name: 'Kyiv', latitude: 50.45, longitude: 30.52 }, { name: 'Lviv', latitude: 49.84, longitude: 24.03 }]
  return {
    user: { id: 1, name: 'Test', authenticated: true },
    getRoute: vi.fn(), getSaved: vi.fn(), list: vi.fn(), update: vi.fn(), create: vi.fn(),
    route: { id: 7, name: 'Kyiv-Lviv', fuelConsumption: 10, fuelCostPerLiter: 60, currency: 'UAH', passengerCount: 2, waypoints,
      totalDistance: 100, updatedAt: '2026-10-18T10:00:00Z' },
  }
})
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: f.user }) }))
vi.mock('../../contexts/LanguageContext', () => ({ useLanguage: () => ({ language: 'en' }) }))
vi.mock('../MapContainer', () => ({ MapContainer: () => null }))
vi.mock('../RoutePanel', () => ({ RoutePanel: () => null }))
vi.mock('../WeatherStrip', () => ({ WeatherStrip: () => null }))
vi.mock('../receipt/ShareReceiptModal', () => ({ ShareReceiptModal: () => null }))
vi.mock('../../services/routeService', () => ({ routeService: { getUserRoutes: f.list, getRoute: f.getSaved, updateRoute: f.update, createRoute: f.create } }))
vi.mock('../../services/routingService', () => ({ routingService: { getRoute: f.getRoute } }))
vi.mock('../../services/carService', () => ({ carService: { list: async () => [] } }))
vi.mock('../../services/fuelPriceService', () => ({ getFuelSuggestion: async () => null, applyLiveFuelPrice: () => null }))
vi.mock('../../services/weatherService', () => ({ fetchCorridorWeather: async () => null }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

import { RoutePlanner } from '../RoutePlanner'
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root, container: HTMLDivElement
const road: RoutingResult = { totalDistance: 100, totalDuration: 60, geometry: [[50.45, 30.52], [49.84, 24.03]], segments: [],
  quality: 'road', source: 'osrm', calculatedAt: '2026-10-18T00:00:00Z' }
const button = (text: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === text)
const click = (text: string) => act(async () => { button(text)!.click() })

beforeEach(async () => {
  vi.resetAllMocks(); localStorage.clear()
  f.list.mockResolvedValue([f.route]); f.getSaved.mockResolvedValue(f.route); f.getRoute.mockResolvedValue(road)
  f.update.mockResolvedValue(f.route); f.create.mockResolvedValue({ ...f.route, id: 8 })
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  await act(async () => { root.render(<MemoryRouter initialEntries={['/en/route-planner?routeId=7']}><RoutePlanner /></MemoryRouter>) })
  // Leave the URL-driven edit session, then reopen the same record the way a user does: Load dialog.
  await click('New route'); await click('Load route'); await click('Load')
  f.update.mockClear(); f.create.mockClear()
})
afterEach(() => { act(() => root.unmount()); container.remove(); document.body.style.overflow = '' })

describe('RoutePlanner: save after Load dialog (F3)', () => {
  it('saves as an update of the loaded record, not a duplicate', async () => {
    await click('Update route'); await click('Update')
    expect(f.update).toHaveBeenCalledTimes(1)
    expect(f.update.mock.calls[0][0]).toBe(7)
    expect(f.create).not.toHaveBeenCalled()
  })

  it('offers an explicit Save as new that creates exactly one new record', async () => {
    await click('Update route')
    expect(button('Update')).toBeDefined()
    const saveAsNew = [...document.querySelectorAll('[role="dialog"] button')].find(b => /new/i.test(b.textContent ?? ''))!
    await act(async () => { (saveAsNew as HTMLButtonElement).click() })
    expect(f.create).toHaveBeenCalledTimes(1)
    expect(f.update).not.toHaveBeenCalled()
  })

  it('does not auto-retry the save after a 409 ROUTE_CHANGED', async () => {
    f.update.mockRejectedValue({ response: { status: 409, data: 'ROUTE_CHANGED' } })
    await click('Update route'); await click('Update')
    expect(f.update).toHaveBeenCalledTimes(1)
    expect(f.create).not.toHaveBeenCalled()
  })
})
