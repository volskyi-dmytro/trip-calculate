import type { APIRequestContext, Page } from '@playwright/test'

export const KYIV_LVIV = {
  name: 'QA-LOCAL-A', fuelConsumption: 8, fuelCostPerLiter: 50, currency: 'UAH', passengerCount: 2, fuelType: 'petrol',
  waypoints: [
    { positionOrder: 0, name: 'Kyiv', latitude: 50.45, longitude: 30.52 },
    { positionOrder: 1, name: 'Lviv', latitude: 49.84, longitude: 24.03 },
  ],
}

/** Seeds a saved route through the real API (server recalculates distance; local OSRM/Mapbox call). */
export async function seedRoute(request: APIRequestContext, over: Record<string, unknown> = {}, user = 'dev') {
  // The server fail-fasts concurrent/rapid saves with 429 ROUTE_SAVE_BUSY; back off like a user would.
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await request.post('/api/routes', { data: { ...KYIV_LVIV, ...over }, headers: { 'X-Dev-User': user } })
    if (res.ok()) return res.json()
    if (res.status() !== 429) throw new Error(`seed failed ${res.status()}`)
    await new Promise(r => setTimeout(r, 1500))
  }
  throw new Error('seed kept returning 429') as Promise<{ id: number; name: string; createdAt: string; updatedAt: string; passengerCount: number }>
}

export async function openPlannerManual(page: Page, path = '/en/route-planner') {
  await page.goto(path)
  await page.getByRole('button', { name: /set it up manually|налаштуйте вручну/i }).click()
}

/** Canned Nominatim so tests never hit the public service (1 req/s policy). */
export async function mockNominatim(page: Page, rows: Record<string, unknown>[]) {
  await page.route('**/nominatim.openstreetmap.org/**', route => route.fulfill({ json: route.request().url().includes('/reverse') ? { address: { city: 'Mock City' } } : rows }))
}

const PLACES: Record<string, { lat: string; lon: string; name: string }> = {
  kyiv: { lat: '50.45', lon: '30.52', name: 'Kyiv' },
  lviv: { lat: '49.84', lon: '24.03', name: 'Lviv' },
  zhytomyr: { lat: '50.25', lon: '28.66', name: 'Zhytomyr' },
  rivne: { lat: '50.62', lon: '26.25', name: 'Rivne' },
}

/** Nominatim stub that answers by query text, so multi-stop flows are deterministic. */
export async function mockPlaces(page: Page) {
  await page.route('**/nominatim.openstreetmap.org/**', route => {
    const url = new URL(route.request().url())
    if (url.pathname.includes('reverse')) {
      const lat = url.searchParams.get('lat')
      const hit = Object.values(PLACES).find(p => Math.abs(Number(p.lat) - Number(lat)) < 0.01)
      return route.fulfill({ json: { address: { city: hit?.name ?? 'Mock City' } } })
    }
    const q = (url.searchParams.get('q') ?? '').toLowerCase()
    const p = PLACES[q]
    return route.fulfill({ json: p ? [{ ...p, addresstype: 'city', display_name: `${p.name}, Ukraine` }] : [] })
  })
}

/** Local road-route stub: distance from call order, so tests can prove which response is shown. */
export function roadResult(km: number) {
  return { quality: 'road', provider: 'osrm', totalDistance: km, totalDuration: km * 1.1, segments: [], geometry: [[50.45, 30.52], [49.84, 24.03]] }
}
