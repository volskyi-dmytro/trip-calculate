import { Navigation, Save, Share2 } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext'
import { getTranslation, type Language } from '../i18n/routePlanner'
import { computeTripStats } from '../services/tripStats'
import { wazeLegLinks } from '../services/wazeExport'
import type { FuelSuggestion } from '../services/fuelPriceService'
import type { RouteSettings, Waypoint } from './RoutePlanner'
import { WeatherStrip } from './WeatherStrip'
import type { WeatherData } from '../types/weather'
import { displayWaypointName } from '../utils/waypointName'

interface TripResultCardProps {
  waypoints: Waypoint[]
  routeSettings: RouteSettings
  routeDistance: number
  routeDuration: number
  fuelSuggestion: FuelSuggestion | null
  weather: WeatherData | null
  onSaveRoute: () => void
  onShareReceipt: () => void
  /** Applies the live suggestion — offered only while the price used in the
   * calculation isn't already the live one (see routeSettings.fuelPriceTouched). */
  onApplyLivePrice?: () => void
}

export function TripResultCard({
  waypoints, routeSettings, routeDistance, routeDuration,
  fuelSuggestion, weather, onSaveRoute, onShareReceipt, onApplyLivePrice,
}: TripResultCardProps) {
  const { language } = useLanguage()
  const t = getTranslation(language as Language)
  const stats = computeTripStats(waypoints, routeSettings, routeDistance, routeDuration)
  // A geocoder (ours or the AI's) can fall back to raw coordinates as a
  // waypoint's name — swap in a "Waypoint N" label everywhere a name is
  // shown, including inside the Waze leg labels built below.
  const displayWaypoints = waypoints.map((wp, i) => ({
    ...wp,
    name: displayWaypointName(wp.name, `${t.planner.waypoint} ${i + 1}`),
  }))
  const legs = wazeLegLinks(displayWaypoints)
  const pending = routeDistance === 0   // road distance not resolved yet
  // The "live price" badge must only claim the price used IS the live one —
  // routeSettings.fuelPriceTouched means it was overridden (chat/manual/car).
  const usingLivePrice = Boolean(fuelSuggestion) && !routeSettings.fuelPriceTouched

  return (
    <div className="trip-result-card glass-panel">
      <div className="trip-result-title">✨ {t.resultCard.title}</div>

      <div className="trip-result-stops" aria-label={t.resultCard.stops}>
        {displayWaypoints.map((wp, i) => (
          <span key={wp.id} className="trip-result-stop">
            {i > 0 && <span aria-hidden="true"> → </span>}
            {wp.name.split(',')[0]}
          </span>
        ))}
      </div>

      <dl className="trip-result-figures">
        <div>
          <dt>{t.resultCard.distance}</dt>
          <dd>{pending ? t.resultCard.pendingRoute : `${stats.totalDistance.toFixed(0)} km`}</dd>
        </div>
        <div>
          <dt>{t.resultCard.duration}</dt>
          <dd>{pending ? '—' : `${Math.floor(stats.estimatedTime)}h ${Math.round((stats.estimatedTime % 1) * 60)}m`}</dd>
        </div>
        <div>
          <dt>
            {t.resultCard.fuelCost}
            {usingLivePrice && (
              <span className="trip-result-live"> · ⛽ {t.resultCard.livePrice}</span>
            )}
            {!usingLivePrice && fuelSuggestion && onApplyLivePrice && (
              <button
                type="button"
                className="fuel-chip fuel-chip-action trip-result-live-action"
                onClick={onApplyLivePrice}
              >
                ⛽ {t.fuel.applyLive}
              </button>
            )}
          </dt>
          <dd>{stats.fuelCost.toFixed(2)} {routeSettings.currency}</dd>
        </div>
        <div>
          <dt>{t.resultCard.perPerson}</dt>
          <dd>{stats.costPerPerson.toFixed(2)} {routeSettings.currency}</dd>
        </div>
      </dl>

      <WeatherStrip weather={weather} />

      {legs.length > 0 && (
        <div className="trip-result-waze">
          {legs.map(leg => (
            <a key={leg.url} href={leg.url} target="_blank" rel="noopener noreferrer"
               className="trip-result-waze-link">
              <Navigation className="w-3.5 h-3.5" aria-hidden="true" />
              {t.resultCard.navigate}: {leg.label}
            </a>
          ))}
        </div>
      )}

      <div className="trip-result-actions">
        <button type="button" onClick={onSaveRoute} className="trip-result-action">
          <Save className="w-3.5 h-3.5" aria-hidden="true" /> {t.resultCard.save}
        </button>
        <button type="button" onClick={onShareReceipt} className="trip-result-action">
          <Share2 className="w-3.5 h-3.5" aria-hidden="true" /> {t.resultCard.share}
        </button>
      </div>
    </div>
  )
}
