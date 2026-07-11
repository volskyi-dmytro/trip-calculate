import { X } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext'
import { getTranslation, type Language } from '../i18n/routePlanner'
import { AgentProgress } from './AgentProgress'
import { TripResultCard } from './TripResultCard'
import type { AgentStage } from '../services/agentStreamService'
import type { RouteSettings, Waypoint } from './RoutePlanner'
import type { FuelSuggestion } from '../services/fuelPriceService'

interface AgentActivitySlotProps {
  isProcessing: boolean
  doneStages: AgentStage[]
  degraded: boolean
  // Whether a successful AI result is currently active (undismissed) —
  // the slot shows nothing when false, even if a card was shown before.
  showResult: boolean
  onDismiss: () => void
  waypoints: Waypoint[]
  routeSettings: RouteSettings
  routeDistance: number
  routeDuration: number
  fuelSuggestion: FuelSuggestion | null
  onSaveRoute: () => void
  onShareReceipt: () => void
}

/**
 * Latest-result concierge slot: rendered directly above the AI input in
 * both the desktop sidebar and mobile sheet. Shows the live progress
 * steps while a request is in flight, then the most recent successful
 * result as a dismissible card. Only ever shows the latest request/result
 * — there is no scroll-back history (see task-7-report.md for why).
 */
export function AgentActivitySlot({
  isProcessing,
  doneStages,
  degraded,
  showResult,
  onDismiss,
  waypoints,
  routeSettings,
  routeDistance,
  routeDuration,
  fuelSuggestion,
  onSaveRoute,
  onShareReceipt,
}: AgentActivitySlotProps) {
  const { language } = useLanguage()
  const t = getTranslation(language as Language)

  if (isProcessing) {
    return (
      <div className="mb-3">
        <AgentProgress doneStages={doneStages} degraded={degraded} />
      </div>
    )
  }

  if (!showResult) return null

  return (
    <div className="relative mb-3">
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t.resultCard.dismiss}
        className="absolute top-2 right-2 z-10 h-6 w-6 flex items-center justify-center rounded-full transition-colors"
        style={{ color: 'var(--nav-text-secondary)', background: 'var(--nav-bg-input)' }}
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <TripResultCard
        waypoints={waypoints}
        routeSettings={routeSettings}
        routeDistance={routeDistance}
        routeDuration={routeDuration}
        fuelSuggestion={fuelSuggestion}
        onSaveRoute={onSaveRoute}
        onShareReceipt={onShareReceipt}
      />
    </div>
  )
}
