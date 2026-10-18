import { computeTripStats } from '../../services/tripStats'
import type { EstimateQuality } from '../../services/routingService'
import { formatDistance, formatDuration, formatLiters, formatMoney } from '../../lib/format'
import { displayWaypointName } from '../../utils/waypointName'
import type { getTranslation } from '../../i18n/routePlanner'
import type { RouteSettings, Waypoint } from '../RoutePlanner'

type T = ReturnType<typeof getTranslation>

const shortName = (name: string) => name.split(',')[0].trim()

/** Largest-remainder rounding to whole km so the displayed legs add up to the displayed total. */
export function roundLegsToTotal(legs: number[], total: number): number[] {
  if (legs.length === 0) return []
  const target = Math.max(0, Math.round(total))
  const floors = legs.map(l => Math.max(0, Math.floor(l)))
  let remaining = target - floors.reduce((a, b) => a + b, 0)
  const order = legs
    .map((l, i) => ({ i, r: l - Math.floor(l) }))
    .sort((a, b) => b.r - a.r)
  for (let k = 0; remaining > 0; k++, remaining--) floors[order[k % order.length].i]++
  return floors
}

/** Every string the result UI shows, computed once so card, peek line and live-region message cannot disagree. */
export function summarizeTrip(input: {
  waypoints: Waypoint[]
  routeSettings: RouteSettings
  routeDistance: number
  routeDuration: number
  routeQuality?: EstimateQuality
  language: string
  t: T
}) {
  const { waypoints, routeSettings, routeDistance, routeDuration, routeQuality, language, t } = input
  const stats = computeTripStats(waypoints, routeSettings, routeDistance, routeDuration, routeQuality)
  const approx = stats.quality === 'approximate'
  const pending = routeDistance === 0 && !approx // road distance not resolved yet
  const people = routeSettings.passengerCount || 1
  const money = (v: number) => formatMoney(v, routeSettings.currency, language)
  const prefix = approx ? '≈ ' : ''
  const names = waypoints.map((wp, i) => shortName(displayWaypointName(wp.name, `${t.planner.waypoint} ${i + 1}`)))
  const origin = names[0] ?? ''
  const destination = names[names.length - 1] ?? ''

  // Per-person is the headline only when it differs from the total; with one
  // passenger the total is the headline, so no figure appears twice.
  const headline = people > 1
    ? { value: money(stats.costPerPerson), label: t.resultCard.perPerson }
    : { value: money(stats.fuelCost), label: t.resultCard.totalCost }
  const secondary = people > 1
    ? t.resultCard.totalWithPassengers.replace('{total}', money(stats.fuelCost)).replace('{count}', String(people))
    : null

  const distance = pending ? t.resultCard.pendingRoute : prefix + formatDistance(stats.totalDistance, language)
  const duration = pending ? '—' : prefix + formatDuration(stats.estimatedTime * 60, language)
  const fuel = formatLiters(stats.fuelNeeded, language)

  const announcement = t.resultCard.announce
    .replace('{from}', origin).replace('{to}', destination)
    .replace('{distance}', distance).replace('{cost}', headline.value).replace('{label}', headline.label)
    + (approx ? `. ${t.routeSummary.qualityApproximate}` : '')

  const legs = roundLegsToTotal(stats.segments.map(s => s.distance), stats.totalDistance)

  return { stats, approx, pending, people, money, origin, destination, headline, secondary, distance, duration, fuel, announcement, legs }
}
