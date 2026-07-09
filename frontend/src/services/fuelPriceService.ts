import type { RouteSettings, Waypoint } from '../components/RoutePlanner'

export type FuelType = 'petrol' | 'diesel' | 'lpg'

export interface FuelSuggestion {
  price: number
  currency: string
  stale: boolean
  fetchedAt: string
  source: string
}

export interface CountryPrice {
  pricePerLiter: number
  stale: boolean
  source: string
  fetchedAt: string
}

interface RoutePoint {
  lat: number
  lng: number
  countryCode?: string
}

const EARTH_RADIUS_KM = 6371

function haversineKm(a: RoutePoint, b: RoutePoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

/** Same weighting model as the agent's fuel tool: each leg's distance splits
 * 50/50 between endpoint countries; weights renormalize over priced countries. */
export function computeWeightedPrice(
  points: RoutePoint[],
  prices: Record<string, CountryPrice>,
): { price: number; stale: boolean } | null {
  const weights: Record<string, number> = {}
  for (let i = 0; i < points.length - 1; i++) {
    const dist = haversineKm(points[i], points[i + 1])
    for (const cc of [points[i].countryCode, points[i + 1].countryCode]) {
      if (cc) weights[cc] = (weights[cc] ?? 0) + dist / 2
    }
  }
  let totalW = 0
  let sum = 0
  let stale = false
  for (const [cc, w] of Object.entries(weights)) {
    const p = prices[cc]
    if (!p || p.pricePerLiter <= 0) continue
    totalW += w
    sum += p.pricePerLiter * w
    stale = stale || p.stale
  }
  if (totalW <= 0) return null
  return { price: Math.round((sum / totalW) * 100) / 100, stale }
}

/** The settings contract: a live suggestion applies ONLY while the user has
 * not touched the fuel price field. Returns the updated settings or null. */
export function applyLiveFuelPrice(
  settings: RouteSettings,
  suggestion: FuelSuggestion | null,
): RouteSettings | null {
  if (!suggestion || suggestion.price <= 0 || settings.fuelPriceTouched) return null
  return { ...settings, fuelCostPerLiter: suggestion.price }
}

// ── Country resolution (lazy, cached) ──────────────────────────────────────

const CC_CACHE_PREFIX = 'cc_'

async function countryForPoint(lat: number, lng: number): Promise<string | undefined> {
  const key = `${CC_CACHE_PREFIX}${lat.toFixed(2)}_${lng.toFixed(2)}`
  const cached = sessionStorage.getItem(key)
  if (cached) return cached === 'null' ? undefined : cached
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=3&addressdetails=1`,
    )
    if (!resp.ok) return undefined
    const data = await resp.json()
    const cc: string | undefined = data.address?.country_code?.toUpperCase()
    sessionStorage.setItem(key, cc ?? 'null')
    return cc
  } catch {
    return undefined
  }
}

/** Resolve country codes for waypoints that lack one (sequentially — polite
 * to Nominatim; cache makes repeats free). */
export async function ensureCountryCodes(waypoints: Waypoint[]): Promise<RoutePoint[]> {
  const points: RoutePoint[] = []
  for (const wp of waypoints) {
    let cc = wp.countryCode
    if (!cc) cc = await countryForPoint(wp.lat, wp.lng)
    points.push({ lat: wp.lat, lng: wp.lng, countryCode: cc })
  }
  return points
}

export async function getFuelSuggestion(
  waypoints: Waypoint[],
  fuelType: FuelType,
  currency: string,
): Promise<FuelSuggestion | null> {
  if (waypoints.length < 2) return null
  try {
    const points = await ensureCountryCodes(waypoints)
    const codes = [...new Set(points.map(p => p.countryCode).filter(Boolean))] as string[]
    if (codes.length === 0) return null
    const resp = await fetch(
      `/api/fuel-prices?countries=${codes.join(',')}&type=${fuelType}&currency=${encodeURIComponent(currency)}`,
      { credentials: 'include' },
    )
    if (!resp.ok) return null
    const data = await resp.json()
    const prices: Record<string, CountryPrice> = {}
    for (const row of data.prices ?? []) {
      prices[row.code] = row
    }
    const weighted = computeWeightedPrice(points, prices)
    if (!weighted) return null
    const rows = Object.values(prices)
    return {
      price: weighted.price,
      currency: data.currency,
      stale: weighted.stale,
      fetchedAt: rows.length ? rows.map(r => r.fetchedAt).sort()[0] : '',
      source: [...new Set(rows.map(r => r.source))].join(' + '),
    }
  } catch {
    return null
  }
}
