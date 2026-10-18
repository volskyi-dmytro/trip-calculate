// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoutingResult } from '../../services/routingService'

// UX audit M1: guests plan manually without an account; AI and saving ask
// for sign-in, and the trip survives the Google round trip.
const f = vi.hoisted(() => ({
  user: null as null | { id: number; name: string; authenticated: boolean },
  login: vi.fn(),
  getRoute: vi.fn(), list: vi.fn(), create: vi.fn(), weather: vi.fn(),
}))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: f.user, loading: false, login: f.login }) }))
vi.mock('../../contexts/LanguageContext', () => ({ useLanguage: () => ({ language: 'en', t: (k: string) => k }) }))
vi.mock('../MapContainer', () => ({ MapContainer: () => null }))
vi.mock('../RoutePanel', () => ({ RoutePanel: () => null }))
vi.mock('../WeatherStrip', () => ({ WeatherStrip: () => null }))
vi.mock('../receipt/ShareReceiptModal', () => ({ ShareReceiptModal: () => null }))
vi.mock('../../services/routeService', () => ({ routeService: { getUserRoutes: f.list, getRoute: vi.fn(), updateRoute: vi.fn(), createRoute: f.create } }))
vi.mock('../../services/routingService', () => ({ routingService: { getRoute: f.getRoute } }))
vi.mock('../../services/carService', () => ({ carService: { list: async () => [] } }))
vi.mock('../../services/fuelPriceService', () => ({ getFuelSuggestion: async () => null, applyLiveFuelPrice: () => null }))
vi.mock('../../services/weatherService', () => ({ fetchCorridorWeather: f.weather }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

import { RoutePlanner } from '../RoutePlanner'
import { savePlannerDraft } from '../../utils/plannerDraft'
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root, container: HTMLDivElement
const road: RoutingResult = { totalDistance: 541, totalDuration: 400, geometry: [[50.45, 30.52], [49.84, 24.03]], segments: [],
  quality: 'road', source: 'osrm', calculatedAt: '2026-10-18T00:00:00Z' }
const prefill = '/en/route-planner?from=Kyiv&fromLat=50.45&fromLng=30.52&to=Lviv&toLat=49.84&toLng=24.03&passengers=3'
const button = (text: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === text)

async function mount(url: string) {
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  await act(async () => { root.render(<MemoryRouter initialEntries={[url]}><RoutePlanner /></MemoryRouter>) })
  await act(async () => { await new Promise(r => setTimeout(r, 0)) })
}

beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear(); sessionStorage.clear()
  f.user = null
  f.getRoute.mockResolvedValue(road); f.list.mockResolvedValue([]); f.weather.mockResolvedValue(null)
  f.create.mockResolvedValue({ id: 9, name: 'Kyiv → Lviv' })
})
afterEach(() => { act(() => root.unmount()); container.remove(); document.body.style.overflow = '' })

describe('RoutePlanner guest mode', () => {
  it('opens straight into the manual planner, with an AI sign-in prompt instead of the composer', async () => {
    await mount('/en/route-planner')
    expect(document.querySelector('#ai-prompt')).toBeNull()
    expect(button('Sign in to use AI')).toBeDefined()
    expect(button('Load route')).toBeUndefined()
    expect(f.list).not.toHaveBeenCalled()
  })

  it('loads a route from a city-page deep link and calculates it without an account', async () => {
    await mount(prefill)
    expect(f.getRoute).toHaveBeenCalled()
    expect(document.body.textContent).toContain('Kyiv → Lviv')
    expect(f.weather).not.toHaveBeenCalled() // weather endpoint needs an account
  })

  it('Save asks for sign-in and stashes the trip before leaving for Google', async () => {
    await mount(prefill)
    await act(async () => { button('Save trip')!.click() })
    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog.textContent).toContain('signInSheet.title.save')
    const continueLink = [...dialog.querySelectorAll('a')].find(a => a.textContent === 'signInSheet.continue')!
    expect(continueLink.getAttribute('href')).toContain('returnTo=%2Fen%2Froute-planner%3Fresume%3Dsave')
    await act(async () => { continueLink.click() })
    expect(f.login).toHaveBeenCalledWith('/en/route-planner?resume=save', 'planner_save')
    const draft = JSON.parse(sessionStorage.getItem('tc_planner_draft')!)
    expect(draft.waypoints.map((w: { name: string }) => w.name)).toEqual(['Kyiv', 'Lviv'])
  })
})

describe('RoutePlanner after sign-in (?resume=save)', () => {
  it('restores the guest trip and reopens the save dialog with a prefilled name', async () => {
    f.user = { id: 1, name: 'Test', authenticated: true }
    savePlannerDraft({
      waypoints: [
        { id: 'a', lat: 50.45, lng: 30.52, name: 'Kyiv, Ukraine' },
        { id: 'b', lat: 49.84, lng: 24.03, name: 'Lviv, Ukraine' },
      ],
      routeSettings: { fuelConsumption: 7, fuelCostPerLiter: 87, currency: 'UAH', passengerCount: 3, fuelType: 'petrol', fuelPriceTouched: false },
    })
    await mount('/en/route-planner?resume=save')
    const name = document.querySelector<HTMLInputElement>('#route-name')!
    expect(name).not.toBeNull()
    expect(name.value).toBe('Kyiv → Lviv')
    expect(sessionStorage.getItem('tc_planner_draft')).toBeNull()
  })

  it('shows an inline error under an emptied name instead of a far-away toast', async () => {
    f.user = { id: 1, name: 'Test', authenticated: true }
    await mount(prefill)
    await act(async () => { button('Save trip')!.click() })
    const name = document.querySelector<HTMLInputElement>('#route-name')!
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => { setter.call(name, ''); name.dispatchEvent(new Event('input', { bubbles: true })) })
    const dialogSave = [...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent?.trim() === 'Save trip')!
    await act(async () => { (dialogSave as HTMLButtonElement).click() })
    expect(f.create).not.toHaveBeenCalled()
    expect(name.getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById(name.getAttribute('aria-describedby')!)?.textContent).toContain('Give your trip a name')
  })
})
