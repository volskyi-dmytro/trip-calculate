import { useEffect } from 'react'
import { geocodingService } from '../services/geocodingService'
import { isCoordinateLikeName } from '../utils/waypointName'

interface Named { id: string; lat: number; lng: number; name: string }

// Cached by rounded coordinate so a repeat never hits Nominatim twice (its
// usage policy allows ~1 request/second); failures stay cached too.
const cache = new Map<string, Promise<string | null>>()

function resolve(lat: number, lng: number, language: string): Promise<string | null> {
  const key = `${language}:${lat.toFixed(4)},${lng.toFixed(4)}`
  let hit = cache.get(key)
  if (!hit) {
    hit = geocodingService.reverseGeocode(lat, lng, language)
      .then(label => (isCoordinateLikeName(label) || label === 'Unknown Location' ? null : label))
      .catch(() => null)
    cache.set(key, hit)
  }
  return hit
}

/** Replaces coordinate-only waypoint names with a reverse-geocoded place name (audit F8). */
export function useResolvedWaypointNames(waypoints: Named[], rename: (id: string, name: string) => void, language = 'en') {
  const pending = waypoints.filter(w => isCoordinateLikeName(w.name)).map(w => `${w.id}|${w.lat}|${w.lng}`).join(';')
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      for (const entry of pending ? pending.split(';') : []) {
        const [id, lat, lng] = entry.split('|')
        const label = await resolve(Number(lat), Number(lng), language)
        if (cancelled) return
        if (label) rename(id, label)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [pending, rename, language])
}
