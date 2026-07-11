import { Navigation, Save, Share2 } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext'
import { getTranslation, type Language } from '../i18n/routePlanner'
import { computeTripStats } from '../services/tripStats'
import { wazeLegLinks } from '../services/wazeExport'
import type { FuelSuggestion } from '../services/fuelPriceService'
import type { RouteSettings, Waypoint } from './RoutePlanner'

interface TripResultCardProps {
  waypoints: Waypoint[]
  routeSettings: RouteSettings
  routeDistance: number
  routeDuration: number
  fuelSuggestion: FuelSuggestion | null
  onSaveRoute: () => void
  onShareReceipt: () => void
}

export function TripResultCard({
  waypoints, routeSettings, routeDistance, routeDuration,
  fuelSuggestion, onSaveRoute, onShareReceipt,
}: TripResultCardProps) {
  const { language } = useLanguage()
  const t = getTranslation(language as Language)
  const stats = computeTripStats(waypoints, routeSettings, routeDistance, routeDuration)
  const legs = wazeLegLinks(waypoints)
  const pending = routeDistance === 0   // road distance not resolved yet

  return (
    <div className="trip-result-card glass-panel">
      <div className="trip-result-title">✨ {t.resultCard.title}</div>

      <div className="trip-result-stops" aria-label={t.resultCard.stops}>
        {waypoints.map((wp, i) => (
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
            {fuelSuggestion && <span className="trip-result-live"> · ⛽ {t.resultCard.livePrice}</span>}
          </dt>
          <dd>{stats.fuelCost.toFixed(2)} {routeSettings.currency}</dd>
        </div>
        <div>
          <dt>{t.resultCard.perPerson}</dt>
          <dd>{stats.costPerPerson.toFixed(2)} {routeSettings.currency}</dd>
        </div>
      </dl>

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
