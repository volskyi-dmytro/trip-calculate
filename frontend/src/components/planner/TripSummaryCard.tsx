import { useId, useState, type Ref } from 'react'
import { ChevronDown, Clock, Fuel, Navigation, Route as RouteIcon, Save, Share2 } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import { getTranslation, type Language } from '../../i18n/routePlanner'
import { wazeLegLinks } from '../../services/wazeExport'
import type { EstimateQuality } from '../../services/routingService'
import type { FuelSuggestion } from '../../services/fuelPriceService'
import type { WeatherData } from '../../types/weather'
import { displayWaypointName } from '../../utils/waypointName'
import { formatDistance } from '../../lib/format'
import type { RouteSettings, Waypoint } from '../RoutePlanner'
import { WeatherStrip } from '../WeatherStrip'
import { summarizeTrip } from './tripSummary'

export interface TripSummaryCardProps {
  waypoints: Waypoint[]
  routeSettings: RouteSettings
  routeDistance: number
  routeDuration: number
  routeQuality?: EstimateQuality
  estimatePending?: boolean
  fuelSuggestion: FuelSuggestion | null
  weather: WeatherData | null
  onSaveRoute: () => void
  onShareReceipt: () => void
  /** Offered only while the price used isn't already the live one. */
  onApplyLivePrice?: () => void
  /** Overrides the save label (e.g. "Update route" in edit mode). */
  saveLabel?: string
  /** Lets the planner move focus here when a new AI result arrives. */
  headingRef?: Ref<HTMLHeadingElement>
}

/** The single place a trip result is shown: per-person cost first, once; the arithmetic lives in a closed disclosure. */
export function TripSummaryCard({
  waypoints, routeSettings, routeDistance, routeDuration, routeQuality,
  fuelSuggestion, weather, onSaveRoute, onShareReceipt, onApplyLivePrice, saveLabel, headingRef, estimatePending = false,
}: TripSummaryCardProps) {
  const { language } = useLanguage()
  const t = getTranslation(language as Language)
  const [open, setOpen] = useState(false)
  const uid = useId()
  const s = summarizeTrip({ waypoints, routeSettings, routeDistance, routeDuration, routeQuality, language, t })
  // A public receipt carries no quality flag, so only a road route may be shared.
  const canShare = !estimatePending && s.stats.quality === 'road'
  const displayWaypoints = waypoints.map((wp, i) => ({
    ...wp,
    name: displayWaypointName(wp.name, `${t.planner.waypoint} ${i + 1}`),
  }))
  const legs = wazeLegLinks(displayWaypoints)
  // The "live price" badge must only claim the price used IS the live one.
  const usingLivePrice = Boolean(fuelSuggestion) && !routeSettings.fuelPriceTouched
  const noteId = `${uid}-note`
  const detailsId = `${uid}-details`

  return (
    <section className="trip-summary glass-panel" aria-labelledby={`${uid}-title`}>
      <h2 id={`${uid}-title`} ref={headingRef} tabIndex={-1} className="trip-summary-title">
        {s.origin} → {s.destination}
      </h2>

      {s.approx && <p id={noteId} className="trip-summary-note">{t.routeSummary.qualityApproximate}</p>}

      <div>
        <p className="trip-summary-headline">
          <span className="trip-summary-figure">{s.headline.value}</span>
          <span className="trip-summary-figure-label">{s.headline.label}</span>
        </p>
        {s.secondary && <p className="trip-summary-secondary">{s.secondary}</p>}
      </div>

      <ul className="trip-summary-chips">
        <li className="trip-summary-chip">
          <RouteIcon className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">{t.resultCard.distance}: </span>{s.distance}
        </li>
        <li className="trip-summary-chip">
          <Clock className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">{t.resultCard.duration}: </span>{s.duration}
        </li>
        <li className="trip-summary-chip">
          <Fuel className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">{t.routeSummary.fuelNeeded}: </span>{s.fuel}
        </li>
      </ul>

      <WeatherStrip weather={weather} />

      <p className="trip-summary-price">
        <Fuel className="h-4 w-4" aria-hidden="true" />
        {t.resultCard.fuelPrice.replace('{price}', `${s.money(routeSettings.fuelCostPerLiter)}/L`)}
        {usingLivePrice && <> · {t.resultCard.livePrice}</>}
        {!usingLivePrice && fuelSuggestion && onApplyLivePrice && (
          <button type="button" className="fuel-chip fuel-chip-action" onClick={onApplyLivePrice}>
            {t.fuel.applyLive}
          </button>
        )}
      </p>

      <div className="trip-summary-actions">
        <button type="button" onClick={onSaveRoute} disabled={estimatePending || s.stats.quality === 'unavailable'} className="trip-summary-btn trip-summary-btn-primary">
          <Save className="h-4 w-4" aria-hidden="true" /> {saveLabel ?? t.resultCard.save}
        </button>
        <button type="button" onClick={onShareReceipt} className="trip-summary-btn"
                disabled={!canShare} aria-describedby={canShare ? undefined : noteId}>
          <Share2 className="h-4 w-4" aria-hidden="true" /> {t.resultCard.share}
        </button>
      </div>

      {legs.map(leg => (
        <a key={leg.url} href={leg.url} target="_blank" rel="noopener noreferrer" className="trip-summary-btn">
          <Navigation className="h-4 w-4" aria-hidden="true" />
          {t.resultCard.navigate}{legs.length > 1 ? `: ${leg.label}` : ''}
        </a>
      ))}

      <div>
        <button type="button" className="trip-summary-disclosure" aria-expanded={open} aria-controls={detailsId}
                onClick={() => setOpen(o => !o)}>
          <span>{t.resultCard.howCalculated}</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        <div id={detailsId} hidden={!open}>
          {open && (
            <>
              <dl className="trip-summary-rows">
                <div><dt>{t.costBreakdown.fuelConsumption}</dt><dd>{routeSettings.fuelConsumption} {t.routeSettings.consumptionUnit}</dd></div>
                <div><dt>{t.costBreakdown.fuelPrice}</dt><dd>{s.money(routeSettings.fuelCostPerLiter)}/L</dd></div>
                <div><dt>{t.costBreakdown.fuelNeeded}</dt><dd>{s.fuel}</dd></div>
                <div><dt>{t.costBreakdown.totalCost}</dt><dd>{s.money(s.stats.fuelCost)}</dd></div>
              </dl>
              {!s.pending && s.stats.segments.length > 0 && (
                <>
                  <h3 className="trip-summary-subtitle">{t.routeSegments.title}</h3>
                  {s.stats.legBasis === 'proportional' && <p className="trip-summary-secondary">{t.routeSummary.legsNote}</p>}
                  <ol className="trip-summary-rows">
                    {s.stats.segments.map((seg, i) => (
                      <li key={i}>
                        <span>
                          {displayWaypointName(seg.from, `${t.planner.waypoint} ${i + 1}`).split(',')[0]} →{' '}
                          {displayWaypointName(seg.to, `${t.planner.waypoint} ${i + 2}`).split(',')[0]}
                        </span>
                        <span>{formatDistance(s.legs[i], language)}</span>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
