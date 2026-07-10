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

  // Calculate segment distances for display (still using Haversine as approximation for individual segments)
  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i]
    const to = waypoints[i + 1]
    const distance = calculateDistance(from.lat, from.lng, to.lat, to.lng)
    segments.push({
      from: from.name,
      to: to.name,
      distance
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
