import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, MessageSquareQuote } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext'
import { getTranslation, type Language } from '../i18n/routePlanner'
import { Button } from '@/components/ui/button'
import { MapContainer } from './MapContainer'
import { TripResultCard } from './TripResultCard'
import { SignInSheet } from './auth/SignInSheet'
import { getFuelSuggestion } from '../services/fuelPriceService'
import { withLocalePrefix } from '../utils/locale'
import { track } from '../lib/analytics'
import type { RouteSettings, Waypoint } from './RoutePlanner'
import '../styles/route-planner.css'

// A finished, static sample trip — guests see the planner's actual output
// for the one-sentence request shown above it. No AI call is made (the AI
// endpoint stays authenticated-only); only the fuel price is fetched live
// from the public country-average endpoint so the numbers look like today's.
const DEMO_WAYPOINTS: Waypoint[] = [
  { id: 'demo-start', lat: 49.8397, lng: 24.0297, name: 'Lviv, Ukraine', countryCode: 'UA' },
  { id: 'demo-end', lat: 50.0647, lng: 19.945, name: 'Kraków, Poland', countryCode: 'PL' },
]

// Rough Lviv → Krakovets border → Rzeszów → Kraków path, [lat, lng] to match
// the OSRM/MapContainer geometry convention.
const DEMO_GEOMETRY: Array<[number, number]> = [
  [49.8397, 24.0297],
  [49.92, 23.65],
  [49.9987, 23.1859],
  [50.0412, 21.9991],
  [50.03, 21.0],
  [50.0647, 19.945],
]

// Fallback when the live price can't be fetched: a rounded mid-October 2026
// UA/PL blend in UAH, labelled "example price" on the card.
const FALLBACK_PRICE_UAH = 80

const DEMO_SETTINGS: RouteSettings = {
  fuelConsumption: 7.5,
  fuelCostPerLiter: FALLBACK_PRICE_UAH,
  currency: 'UAH',
  passengerCount: 2,
  fuelType: 'petrol',
  fuelPriceTouched: false,
}

const DEMO_DISTANCE_KM = 362
const DEMO_DURATION_MIN = 310 // 5h10m

export function PlannerGuestPreview() {
  const { language } = useLanguage()
  const t = getTranslation(language as Language)
  const [settings, setSettings] = useState<RouteSettings>(DEMO_SETTINGS)
  const [livePrice, setLivePrice] = useState(false)
  const [signInOpen, setSignInOpen] = useState(false)
  const plannerPath = withLocalePrefix('/route-planner', language)

  useEffect(() => {
    let cancelled = false
    getFuelSuggestion(DEMO_WAYPOINTS, 'petrol', 'UAH').then((suggestion) => {
      if (cancelled || !suggestion || suggestion.price <= 0) return
      setSettings((prev) => ({ ...prev, fuelCostPerLiter: suggestion.price }))
      setLivePrice(true)
    })
    return () => { cancelled = true }
  }, [])

  const askSignIn = (source: string) => {
    track('cta_click', { location: 'sample', label: source })
    setSignInOpen(true)
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-6">
          <span
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full"
            style={{ background: 'var(--accent-soft)', color: 'var(--nav-accent)' }}
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            {t.guestPreview.badge}
          </span>
          <h1 className="text-2xl md:text-3xl font-bold mt-3 text-content">
            {t.guestPreview.heading}
          </h1>
          {/* The sentence this trip was "planned" from — proves the AI claim */}
          <figure className="mt-4 inline-flex items-start gap-2 text-left rounded-xl px-4 py-3 glass-panel max-w-xl">
            <MessageSquareQuote className="w-5 h-5 mt-0.5 flex-shrink-0" aria-hidden="true" style={{ color: 'var(--accent)' }} />
            <div>
              <figcaption className="text-xs font-semibold text-caption">{t.guestPreview.promptLabel}</figcaption>
              <blockquote className="text-base font-medium text-content">“{t.guestPreview.prompt}”</blockquote>
            </div>
          </figure>
          <p className="text-sm md:text-base mt-3 max-w-2xl mx-auto text-secondary">
            {t.guestPreview.subtitle}
          </p>
        </div>

        <div className="grid md:grid-cols-5 gap-6 items-start">
          <div className="md:col-span-2 flex flex-col gap-4">
            <TripResultCard
              waypoints={DEMO_WAYPOINTS}
              routeSettings={settings}
              routeDistance={DEMO_DISTANCE_KM}
              routeDuration={DEMO_DURATION_MIN}
              fuelSuggestion={null}
              weather={null}
              onSaveRoute={() => askSignIn('sample_save')}
              onShareReceipt={() => askSignIn('sample_share')}
            />
            {!livePrice && (
              <p className="text-xs text-caption -mt-2">* {t.guestPreview.examplePrice}</p>
            )}
            <p className="text-sm text-secondary">{t.guestPreview.routeVia}</p>
            <Button onClick={() => askSignIn('sample_cta')} className="w-full py-6 text-base font-semibold" size="lg">
              {t.guestPreview.cta}
            </Button>
            <Link
              to={plannerPath}
              className="inline-flex min-h-11 items-center justify-center text-sm font-medium hover:underline"
              style={{ color: 'var(--accent)' }}
              onClick={() => track('cta_click', { location: 'sample', label: 'manual_planner' })}
            >
              {t.guestPreview.manualCta}
            </Link>
          </div>

          <div
            className="md:col-span-3 rounded-xl overflow-hidden glass-panel"
            style={{ height: '420px' }}
          >
            <MapContainer
              waypoints={DEMO_WAYPOINTS}
              routeGeometry={DEMO_GEOMETRY}
              onAddWaypoint={() => askSignIn('sample_map')}
              onUpdateWaypoint={() => askSignIn('sample_map')}
              onDeleteWaypoint={() => askSignIn('sample_map')}
            />
          </div>
        </div>
      </div>
      <SignInSheet
        open={signInOpen}
        onOpenChange={setSignInOpen}
        reason="ai"
        returnTo={plannerPath}
        source="sample"
      />
    </div>
  )
}
