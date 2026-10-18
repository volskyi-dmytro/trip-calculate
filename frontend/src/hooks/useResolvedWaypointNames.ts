import { useEffect } from 'react'
import { geocodingService } from '../services/geocodingService'
import { isCoordinateLikeName } from '../utils/waypointName'

interface Named { id: string; lat: number; lng: number; name: string }

// Cached by rounded coordinate so a repeat never hits Nominatim twice (its
// usage policy allows ~1 request/second); failures stay cached too.
const cache = new Map<string, Promise<string | null>>()

// One request at a time, >=1 s between request starts, shared by every hook instance.
const SPACING_MS = 1000
let queue: Promise<unknown> = Promise.resolve()
let lastStart = 0
function spaced<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastStart + SPACING_MS - Date.now()
    if (wait > 0) await new Promise(r => setTimeout(r, wait))
    lastStart = Date.now()
    return fn()
  })
  queue = run.catch(() => undefined)
  return run
}

function resolve(lat: number, lng: number): Promise<string | null> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`
  let hit = cache.get(key)
  if (!hit) {
    hit = spaced(() => geocodingService.reverseGeocode(lat, lng))
      .then(label => (isCoordinateLikeName(label) || label === 'Unknown Location' ? null : label))
      .catch(() => null)
    cache.set(key, hit)
  }
  return hit
}

/** Replaces coordinate-only waypoint names with a reverse-geocoded place name (audit F8). */
export function useResolvedWaypointNames(waypoints: Named[], rename: (id: string, name: string) => void) {
  const pending = waypoints.filter(w => isCoordinateLikeName(w.name)).map(w => `${w.id}|${w.lat}|${w.lng}`).join(';')
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      for (const entry of pending ? pending.split(';') : []) {
        const [id, lat, lng] = entry.split('|')
        const label = await resolve(Number(lat), Number(lng))
        if (cancelled) return
        if (label) rename(id, label)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [pending, rename])
}
