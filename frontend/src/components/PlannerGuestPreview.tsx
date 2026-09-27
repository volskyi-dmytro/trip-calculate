import { Chrome, Sparkles } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import { getTranslation, type Language } from '../i18n/routePlanner'
import { Button } from '@/components/ui/button'
import { MapContainer } from './MapContainer'
import { TripResultCard } from './TripResultCard'
import type { RouteSettings, Waypoint } from './RoutePlanner'
import '../styles/route-planner.css'

// A finished, static sample trip — guests get to see the planner's actual
// output instead of an empty 0 km / 0.00 calculator. No backend call is
// made: the AI endpoint stays authenticated-only, so these numbers are
// fixed rather than computed live.
const DEMO_WAYPOINTS: Waypoint[] = [
  { id: 'demo-start', lat: 49.8397, lng: 24.0297, name: 'Lviv, Ukraine' },
  { id: 'demo-end', lat: 50.0647, lng: 19.945, name: 'Kraków, Poland' },
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

const DEMO_SETTINGS: RouteSettings = {
  fuelConsumption: 7.5,
  fuelCostPerLiter: 55,
  currency: 'UAH',
  passengerCount: 2,
  fuelType: 'petrol',
  fuelPriceTouched: false,
}

const DEMO_DISTANCE_KM = 362
const DEMO_DURATION_MIN = 310 // 5h10m

export function PlannerGuestPreview() {
  const { login } = useAuth()
  const { language } = useLanguage()
  const t = getTranslation(language as Language)

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
          <h1 className="text-2xl md:text-3xl font-bold mt-3 text-slate-900 dark:text-white">
            {t.guestPreview.heading}
          </h1>
          <p className="text-sm md:text-base mt-2 max-w-2xl mx-auto text-slate-600 dark:text-slate-300">
            {t.guestPreview.subtitle}
          </p>
        </div>

        <div className="grid md:grid-cols-5 gap-6 items-start">
          <div className="md:col-span-2 flex flex-col gap-4">
            <TripResultCard
              waypoints={DEMO_WAYPOINTS}
              routeSettings={DEMO_SETTINGS}
              routeDistance={DEMO_DISTANCE_KM}
              routeDuration={DEMO_DURATION_MIN}
              fuelSuggestion={null}
              weather={null}
              onSaveRoute={login}
              onShareReceipt={login}
            />
            <Button onClick={login} className="w-full py-6 text-base font-semibold" size="lg">
              <Chrome className="w-5 h-5 mr-2" aria-hidden="true" />
              {t.guestPreview.cta}
            </Button>
          </div>

          <div
            className="md:col-span-3 rounded-xl overflow-hidden glass-panel"
            style={{ height: '420px' }}
          >
            <MapContainer
              waypoints={DEMO_WAYPOINTS}
              routeGeometry={DEMO_GEOMETRY}
              onAddWaypoint={() => login()}
              onUpdateWaypoint={() => login()}
              onDeleteWaypoint={() => login()}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
