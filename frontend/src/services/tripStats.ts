export interface TripStats {
  totalDistance: number
  fuelNeeded: number
  fuelCost: number
  costPerPerson: number
  segments: { from: string; to: string; distance: number }[]
  estimatedTime: number
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
): TripStats {
  if (waypoints.length < 2) {
    return {
      totalDistance: 0,
      fuelNeeded: 0,
      fuelCost: 0,
      costPerPerson: 0,
      segments: [],
      estimatedTime: 0
    }
  }

  // Use actual road distance from OSRM routing service if available
  // Otherwise fall back to calculating straight-line Haversine distance
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

  // If OSRM routing failed (distance = 0), fall back to sum of Haversine distances
  if (totalDistance === 0 && segments.length > 0) {
    totalDistance = segments.reduce((sum, seg) => sum + seg.distance, 0)
    console.warn('⚠️ Using Haversine fallback distance:', totalDistance.toFixed(2), 'km')
  }

  const fuelNeeded = (totalDistance / 100) * routeSettings.fuelConsumption
  const fuelCost = fuelNeeded * routeSettings.fuelCostPerLiter
  const passengerCount = routeSettings.passengerCount || 1
  const costPerPerson = fuelCost / passengerCount

  // Use OSRM duration if available, otherwise estimate at 80 km/h
  const estimatedTime = routeDuration > 0 ? routeDuration / 60 : totalDistance / 80

  return {
    totalDistance,
    fuelNeeded,
    fuelCost,
    costPerPerson,
    segments,
    estimatedTime
  }
}
