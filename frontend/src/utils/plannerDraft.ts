import type { RouteSettings, Waypoint } from '../components/RoutePlanner'

// A guest's trip, kept across the Google sign-in round trip so it can be
// restored (and the save dialog reopened) when they come back signed in.
// sessionStorage: same tab only, gone when the tab closes.
const KEY = 'tc_planner_draft'
const MAX_AGE_MS = 60 * 60 * 1000

export interface PlannerDraft {
  waypoints: Waypoint[]
  routeSettings: RouteSettings
  departureDate?: string
  savedAt: number
}

export function savePlannerDraft(draft: Omit<PlannerDraft, 'savedAt'>): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...draft, savedAt: Date.now() }))
  } catch { /* storage blocked: the trip just won't be restored */ }
}

/** Reads and removes the draft; null when there is none, it is stale or malformed. */
export function takePlannerDraft(): PlannerDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    sessionStorage.removeItem(KEY)
    const d = JSON.parse(raw) as PlannerDraft
    if (!Array.isArray(d.waypoints) || d.waypoints.length === 0 || !d.routeSettings) return null
    if (Date.now() - d.savedAt > MAX_AGE_MS) return null
    const valid = d.waypoints.every(w =>
      typeof w.id === 'string' && typeof w.name === 'string'
      && Number.isFinite(w.lat) && Number.isFinite(w.lng))
    return valid ? d : null
  } catch {
    return null
  }
}

export function clearPlannerDraft(): void {
  try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
}

/** "Kyiv → Lviv" from the first and last stop, for the save dialog's default name. */
export function defaultTripName(waypoints: Array<{ name: string }>, fallback = ''): string {
  if (waypoints.length < 2) return fallback
  const short = (n: string) => n.split(',')[0].trim()
  const from = short(waypoints[0].name)
  const to = short(waypoints[waypoints.length - 1].name)
  return from && to ? `${from} → ${to}` : fallback
}
