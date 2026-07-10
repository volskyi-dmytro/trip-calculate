/** Per-leg Waze deep links. Waze accepts a single destination per link, so a
 * multi-stop route exports as one navigate-to link per leg (spec decision:
 * honest to how Waze works; final-destination-only silently drops stops). */
export interface WazeLeg {
  label: string
  url: string
}

export function wazeLegLinks(
  waypoints: { name: string; lat: number; lng: number }[],
): WazeLeg[] {
  const legs: WazeLeg[] = []
  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i]
    const to = waypoints[i + 1]
    if (!Number.isFinite(to.lat) || !Number.isFinite(to.lng)) continue
    legs.push({
      label: `${from.name.split(',')[0]} → ${to.name.split(',')[0]}`,
      url: `https://waze.com/ul?ll=${to.lat},${to.lng}&navigate=yes`,
    })
  }
  return legs
}
