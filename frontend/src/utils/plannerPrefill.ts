// Deep link into the planner with a route already filled in, e.g. from a
// city-route landing page: /en/route-planner?from=Kyiv&fromLat=..&to=Lviv&...
export interface PlannerPrefillPoint { name: string; lat: number; lng: number }
export interface PlannerPrefill { from: PlannerPrefillPoint; to: PlannerPrefillPoint; passengers?: number }

export function plannerPrefillQuery(p: PlannerPrefill): string {
  const q = new URLSearchParams({
    from: p.from.name,
    fromLat: p.from.lat.toFixed(5),
    fromLng: p.from.lng.toFixed(5),
    to: p.to.name,
    toLat: p.to.lat.toFixed(5),
    toLng: p.to.lng.toFixed(5),
  })
  if (p.passengers && p.passengers > 0) q.set('passengers', String(Math.trunc(p.passengers)))
  return `?${q.toString()}`
}

const coord = (v: string | null, limit: number): number | null => {
  if (v === null || v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null
}

/** Reads a prefill from planner search params; null when absent or malformed. */
export function parsePlannerPrefill(params: URLSearchParams): PlannerPrefill | null {
  const fromName = params.get('from')?.trim().slice(0, 120)
  const toName = params.get('to')?.trim().slice(0, 120)
  const fromLat = coord(params.get('fromLat'), 90)
  const fromLng = coord(params.get('fromLng'), 180)
  const toLat = coord(params.get('toLat'), 90)
  const toLng = coord(params.get('toLng'), 180)
  if (!fromName || !toName || fromLat === null || fromLng === null || toLat === null || toLng === null) return null
  const passengers = Number(params.get('passengers'))
  return {
    from: { name: fromName, lat: fromLat, lng: fromLng },
    to: { name: toName, lat: toLat, lng: toLng },
    passengers: Number.isInteger(passengers) && passengers >= 1 && passengers <= 10 ? passengers : undefined,
  }
}
