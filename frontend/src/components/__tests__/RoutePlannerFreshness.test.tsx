// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Waypoint } from '../RoutePlanner'
import type { RoutingResult } from '../../services/routingService'
import { getTranslation } from '../../i18n/routePlanner'
import fixtures from '../../../../fixtures/route-cost-v2.json'

const f = vi.hoisted(() => ({
  language: 'en', error: vi.fn(),
  getRoute: vi.fn(), getSaved: vi.fn(), list: vi.fn(), update: vi.fn(), create: vi.fn(),
  user: { id: 1, name: 'Test', authenticated: true },
  route: { id: 1, name: 'Test route', fuelConsumption: 10, fuelCostPerLiter: 60, currency: 'UAH', passengerCount: 2,
    waypoints: [{ name: 'Kyiv', latitude: 50.45, longitude: 30.52 }, { name: 'Lviv', latitude: 49.84, longitude: 24.03 }] },
}))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: f.user }) }))
vi.mock('../../contexts/LanguageContext', () => ({ useLanguage: () => ({ language: f.language }) }))
vi.mock('../MapContainer', () => ({ MapContainer: () => null }))
vi.mock('../RoutePanel', () => ({ RoutePanel: ({ waypoints, onReorderWaypoints }: { waypoints: Waypoint[]; onReorderWaypoints: (v: Waypoint[]) => void }) =>
  <button data-testid="edit-shape" onClick={() => onReorderWaypoints([waypoints[0], { ...waypoints[1], name: 'Honolulu', lat: 21.3, lng: -157.8 }])}>Edit destination</button>,
}))
vi.mock('../WeatherStrip', () => ({ WeatherStrip: () => null }))
vi.mock('../receipt/ShareReceiptModal', () => ({ ShareReceiptModal: ({ isOpen, payload }: { isOpen: boolean; payload: unknown }) => <div data-testid="receipt-payload" data-open={isOpen} data-payload={JSON.stringify(payload)} /> }))
vi.mock('../../services/routeService', () => ({ routeService: { getUserRoutes: f.list, getRoute: f.getSaved, updateRoute: f.update, createRoute: f.create } }))
vi.mock('../../services/routingService', () => ({ routingService: { getRoute: f.getRoute } }))
vi.mock('../../services/carService', () => ({ carService: { list: async () => [] } }))
vi.mock('../../services/fuelPriceService', () => ({ getFuelSuggestion: async () => null, applyLiveFuelPrice: () => null }))
vi.mock('../../services/weatherService', () => ({ fetchCorridorWeather: async () => null }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: f.error, warning: vi.fn() } }))

import { RoutePlanner } from '../RoutePlanner'
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root
let container: HTMLDivElement
const result = (over: Partial<RoutingResult> = {}): RoutingResult => ({ totalDistance: 100, totalDuration: 60,
  geometry: [[50.45, 30.52], [49.84, 24.03]], segments: [], quality: 'road', source: 'osrm', calculatedAt: '2026-10-18T00:00:00Z', ...over })
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((r, j) => { resolve = r; reject = j })
  return { promise, resolve, reject }
}
async function mount() {
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  await act(async () => { root.render(<MemoryRouter initialEntries={['/en/route-planner?routeId=1']}><RoutePlanner /></MemoryRouter>) })
}
const button = (text: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === text)!
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear(); f.language = 'en'; f.list.mockResolvedValue([]); f.getSaved.mockResolvedValue(f.route)
})
afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); document.body.style.overflow = '' })

describe('RoutePlanner input/result freshness', () => {
  it('does not duplicate an in-flight save on repeated submit events', async () => {
    const save = deferred<unknown>()
    f.getRoute.mockResolvedValue(result())
    f.update.mockReturnValue(save.promise)
    await mount()
    await act(async () => { button('Update route').click() })
    const submit = button('Update')
    await act(async () => { submit.click(); submit.click() })
    expect(f.update).toHaveBeenCalledTimes(1)
    await act(async () => { save.resolve(f.route) })
    expect(f.getRoute).toHaveBeenCalledTimes(1)
  })
  it('does not discard a newer shape when an older save reports a stale snapshot', async () => {
    const save = deferred<unknown>()
    const edited = deferred<RoutingResult>()
    f.getRoute.mockResolvedValueOnce(result()).mockReturnValueOnce(edited.promise)
    f.update.mockReturnValue(save.promise)
    await mount()
    await act(async () => { button('Update route').click() })
    await act(async () => { button('Update').click() })
    await act(async () => { (container.querySelector('[data-testid="edit-shape"]') as HTMLButtonElement).click() })
    await act(async () => { edited.resolve(result({ totalDistance: 200 })) })
    await act(async () => { save.reject({ response: { status: 409, data: 'ROUTE_SNAPSHOT_STALE' } }) })
    expect(f.getRoute).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain('200 km')
    expect(button('Update route').disabled).toBe(false)
    expect(f.update).toHaveBeenCalledTimes(1)
  })
  it('ignores a conflict refresh response overtaken by another waypoint edit', async () => {
    const refresh = deferred<RoutingResult>()
    f.getRoute.mockResolvedValueOnce(result()).mockReturnValueOnce(refresh.promise).mockResolvedValueOnce(result({ totalDistance: 300 }))
    f.update.mockRejectedValue({ response: { status: 409, data: 'ROUTE_SNAPSHOT_STALE' } })
    await mount()
    await act(async () => { button('Update route').click() })
    await act(async () => { button('Update').click() })
    await act(async () => { (container.querySelector('[data-testid="edit-shape"]') as HTMLButtonElement).click() })
    await act(async () => { refresh.resolve(result({ totalDistance: 200 })) })
    expect(container.textContent).toContain('300 km')
    expect(container.textContent).not.toContain('200 km')
    expect(f.getRoute).toHaveBeenCalledTimes(3)
    expect(f.update).toHaveBeenCalledTimes(1)
  })
  it('keeps actions unavailable when the one conflict refresh finds no road', async () => {
    f.getRoute.mockResolvedValueOnce(result()).mockResolvedValueOnce(result({ quality: 'unavailable', totalDistance: 0, noRoute: true, geometry: [] }))
    f.update.mockRejectedValue({ response: { status: 409, data: 'ROUTE_SNAPSHOT_STALE' } })
    await mount()
    await act(async () => { button('Update route').click() })
    await act(async () => { button('Update').click() })
    expect(button('Export JSON').disabled).toBe(true)
    expect(container.querySelector('[data-testid="receipt-payload"]')).toBeNull()
    expect(document.querySelector('#route-name')).toBeNull()
    expect(f.getRoute).toHaveBeenCalledTimes(2)
    expect(f.update).toHaveBeenCalledTimes(1)
  })
  it.each([
    ['en', 409, 'ROUTE_CHANGED', 'This saved route changed elsewhere. Reload it and review before saving again.'],
    ['uk', 409, 'ROUTE_CHANGED', 'Цей збережений маршрут змінено в іншому місці. Завантажте його знову та перевірте перед збереженням.'],
    ['en', 429, 'ROUTE_SAVE_BUSY', 'Route saving is busy. Please wait and try saving again.'],
    ['uk', 429, 'ROUTE_SAVE_BUSY', 'Збереження маршрутів перевантажено. Зачекайте та спробуйте зберегти знову.'],
    ['en', 409, 'OTHER_CONFLICT', 'Failed to save route'],
    ['en', 429, 'OTHER_LIMIT', 'Failed to save route'],
    ['en', 500, 'ROUTE_SNAPSHOT_STALE', 'Failed to save route'],
  ] as const)('handles %s %s %s without refreshing or retrying', async (language, status, data, message) => {
    f.language = language
    const t = getTranslation(language)
    f.getRoute.mockResolvedValue(result())
    f.update.mockRejectedValue({ response: { status, data } })
    await mount()
    await act(async () => { button(t.planner.updateRoute).click() })
    await act(async () => { button(t.planner.update).click() })
    expect(f.error).toHaveBeenCalledWith(message)
    expect(f.getRoute).toHaveBeenCalledTimes(1)
    expect(f.update).toHaveBeenCalledTimes(1)
    expect(f.create).not.toHaveBeenCalled()
  })
  it.each(fixtures.cases)('saves and shares normalized fixture values for $rawDistanceKm km / $fuelPrice price', async c => {
    f.getSaved.mockResolvedValue({ ...f.route, fuelConsumption: Number(c.fuelConsumption), fuelCostPerLiter: Number(c.fuelPrice), passengerCount: c.people })
    f.getRoute.mockResolvedValue(result({ totalDistance: Number(c.rawDistanceKm) }))
    f.update.mockResolvedValue(f.route)
    await mount()
    expect(JSON.parse(container.querySelector('[data-testid="receipt-payload"]')!.getAttribute('data-payload')!)).toMatchObject({
      distanceKm: Number(c.distanceKm), fuelConsumption: Number(c.normalizedFuelConsumption), fuelPrice: Number(c.normalizedFuelPrice), people: c.people,
    })
    expect(JSON.parse(localStorage.getItem('tripCalculate_routeSettings')!)).toMatchObject({
      fuelConsumption: Number(c.normalizedFuelConsumption), fuelCostPerLiter: Number(c.normalizedFuelPrice), currency: 'UAH',
    })
    await act(async () => { button('Update route').click() })
    await act(async () => { button('Update').click() })
    expect(f.update.mock.calls[0][1]).toMatchObject({
      snapshot: { distanceKm: Number(c.distanceKm), quality: 'road' },
      fuelConsumption: Number(c.normalizedFuelConsumption), fuelCostPerLiter: Number(c.normalizedFuelPrice),
    })
    expect(f.getRoute).toHaveBeenCalledTimes(1)
  })
  it.each(['en', 'uk'] as const)('refreshes a stale save exactly once in %s, requiring review and a manual re-save', async language => {
    f.language = language
    const t = getTranslation(language)
    const save = deferred<unknown>()
    const refreshed = deferred<RoutingResult>()
    f.getRoute.mockResolvedValueOnce(result({ totalDistance: 188.694 })).mockReturnValueOnce(refreshed.promise)
    f.update.mockReturnValueOnce(save.promise).mockResolvedValueOnce(f.route)
    await mount()
    await act(async () => { button(t.resultCard.share).click() })
    expect(container.querySelector('[data-testid="receipt-payload"]')?.getAttribute('data-open')).toBe('true')
    await act(async () => { button(t.planner.updateRoute).click() })
    await act(async () => { button(t.planner.update).click() })
    expect(f.update).toHaveBeenCalledTimes(1)
    expect(f.update.mock.calls[0][1].snapshot).toEqual({ distanceKm: 188.69, quality: 'road' })
    await act(async () => { save.reject({ response: { status: 409, data: 'ROUTE_SNAPSHOT_STALE' } }) })
    expect(f.getRoute).toHaveBeenCalledTimes(2)
    expect(button(t.planner.updateRoute).disabled).toBe(true)
    expect(button(t.resultCard.share).disabled).toBe(true)
    expect(button(t.buttons.exportJson).disabled).toBe(true)
    expect(document.querySelector('#route-name')).toBeNull()
    expect(container.querySelector('[data-testid="receipt-payload"]')).toBeNull()
    expect(f.error).toHaveBeenCalledWith(language === 'en'
      ? 'The route estimate changed. Refreshing it now; review the updated result and save again.'
      : 'Оцінка маршруту змінилася. Оновлюємо її; перевірте оновлений результат і збережіть знову.')
    await act(async () => { refreshed.resolve(result({ totalDistance: 188.695 })) })
    expect(button(t.planner.updateRoute).disabled).toBe(false)
    expect(container.querySelector('[data-testid="receipt-payload"]')?.getAttribute('data-open')).toBe('false')
    expect(f.update).toHaveBeenCalledTimes(1)
    expect(f.create).not.toHaveBeenCalled()
    await act(async () => { button(t.planner.updateRoute).click() })
    await act(async () => { button(t.planner.update).click() })
    expect(f.update).toHaveBeenCalledTimes(2)
    expect(f.update.mock.calls[1][1].snapshot).toEqual({ distanceKm: 188.7, quality: 'road' })
    expect(f.getRoute).toHaveBeenCalledTimes(2)
  })
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
