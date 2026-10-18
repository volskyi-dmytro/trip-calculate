import type { EstimateQuality } from './routingService'

export const ESTIMATE_MODEL_VERSION = 'trip-estimate/1'
export const ASSUMED_SPEED_KMH = 80

export interface TripStats {
  totalDistance: number
  fuelNeeded: number
  fuelCost: number
  costPerPerson: number
  segments: { from: string; to: string; distance: number }[]
  estimatedTime: number
  /** Quality of totalDistance/fuel/cost. Never 'road' unless a provider route backs it. */
  quality: EstimateQuality
  /** Where estimatedTime comes from. */
  durationBasis: 'provider' | 'assumed-speed' | 'none'
  /** Leg distances are never provider legs: a share of the routed total
   *  ('proportional') or plain straight-line legs ('straight-line'). */
  legBasis: 'proportional' | 'straight-line' | 'none'
  modelVersion: string
}

export interface RouteSettings {
  fuelConsumption: number
  fuelCostPerLiter: number
  passengerCount?: number
  currency?: string
}

export interface Waypoint {
  name: string
  lat: number
  lng: number
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  // Haversine formula
  const R = 6371 // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function reconcileRoundedSegments(distances: number[], totalDistance: number): number[] {
  if (distances.length === 0) return []

  const targetCents = Math.max(0, Math.round(totalDistance * 100))
  const exactCents = distances.map(distance => Math.max(0, distance) * 100)
  const allocatedCents = exactCents.map(Math.floor)
  let remaining = targetCents - allocatedCents.reduce((sum, cents) => sum + cents, 0)

  const byLargestRemainder = exactCents
    .map((cents, index) => ({ index, remainder: cents - Math.floor(cents) }))
    .sort((a, b) => b.remainder - a.remainder)

  for (let i = 0; remaining > 0; i++, remaining--) {
    allocatedCents[byLargestRemainder[i % byLargestRemainder.length].index]++
  }

  return allocatedCents.map(cents => cents / 100)
}

export function computeTripStats(
  waypoints: Waypoint[],
  routeSettings: RouteSettings,
  routeDistance: number,
  routeDuration: number,
  routeQuality?: EstimateQuality,
): TripStats {
  // No road distance means the figures can only be a straight-line estimate,
  // whatever the caller claims. An explicit 'unavailable' yields no figures at all.
  const quality: EstimateQuality =
    routeQuality === 'unavailable' ? 'unavailable' : routeDistance > 0 ? (routeQuality ?? 'road') : 'approximate'

  if (waypoints.length < 2 || quality === 'unavailable') {
    return {
      totalDistance: 0,
      fuelNeeded: 0,
      fuelCost: 0,
      costPerPerson: 0,
      segments: [],
      estimatedTime: 0,
      quality: 'unavailable',
      durationBasis: 'none',
      legBasis: 'none',
      modelVersion: ESTIMATE_MODEL_VERSION,
    }
  }

  let totalDistance = routeDistance

  const segments: { from: string; to: string; distance: number }[] = []

  // Use straight-line proportions to split the routed total between legs when
  // the routing API does not provide per-leg distances. This keeps the segment
  // display internally consistent while preserving each leg's relative weight.
  const haversineDistances = waypoints.slice(0, -1).map((from, index) => {
    const to = waypoints[index + 1]
    return calculateDistance(from.lat, from.lng, to.lat, to.lng)
  })
  const haversineTotal = haversineDistances.reduce((sum, distance) => sum + distance, 0)
  const routedScale = totalDistance > 0 && haversineTotal > 0 ? totalDistance / haversineTotal : 1
  const scaledDistances = haversineDistances.map(distance => distance * routedScale)
  const segmentDistances = totalDistance > 0
    ? reconcileRoundedSegments(scaledDistances, totalDistance)
    : scaledDistances

  for (let i = 0; i < waypoints.length - 1; i++) {
    segments.push({
      from: waypoints[i].name,
      to: waypoints[i + 1].name,
      distance: segmentDistances[i]
    })
  }

  // Outage: the straight-line sum is the (labelled) approximate distance
  if (totalDistance === 0 && segments.length > 0) {
    totalDistance = segments.reduce((sum, seg) => sum + seg.distance, 0)
  }

  const fuelNeeded = (totalDistance / 100) * routeSettings.fuelConsumption
  const fuelCost = fuelNeeded * routeSettings.fuelCostPerLiter
  const passengerCount = routeSettings.passengerCount || 1
  const costPerPerson = fuelCost / passengerCount

  const providerDuration = quality === 'road' && routeDuration > 0
  const estimatedTime = providerDuration ? routeDuration / 60 : totalDistance / ASSUMED_SPEED_KMH

  return {
    totalDistance,
    fuelNeeded,
    fuelCost,
    costPerPerson,
    segments,
    estimatedTime,
    quality,
    durationBasis: providerDuration ? 'provider' : 'assumed-speed',
    legBasis: routeDistance > 0 ? 'proportional' : 'straight-line',
    modelVersion: ESTIMATE_MODEL_VERSION,
  }
}

/** Provenance block for JSON export, so an outage estimate stays labelled outside the app. */
export function buildEstimateExport(
  waypoints: Waypoint[],
  settings: RouteSettings,
  routeDistance: number,
  routeDuration: number,
  estimate?: { quality: EstimateQuality; source: string; calculatedAt: string },
) {
  const stats = computeTripStats(waypoints, settings, routeDistance, routeDuration, estimate?.quality)
  return {
    quality: stats.quality,
    source: stats.quality === 'road' ? (estimate?.source ?? 'road-router') : stats.quality === 'approximate' ? 'straight-line' : 'none',
    calculatedAt: estimate?.calculatedAt ?? null,
    modelVersion: stats.modelVersion,
    distanceKm: stats.totalDistance,
    durationHours: stats.estimatedTime,
    durationBasis: stats.durationBasis,
    legBasis: stats.legBasis,
    fuelCost: stats.fuelCost,
  }
}
