import { Check, Compass, CloudSun, Fuel, Loader2, MapPin, Sparkles, type LucideIcon } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext'
import { getTranslation, type Language } from '../i18n/routePlanner'
import type { AgentStage } from '../services/agentStreamService'

// Visible steps; the wire-level 'supervisor' stage counts toward 'route'
// so users see agents, not internals
const VISIBLE_STEPS = ['route', 'geocoding', 'fuel', 'weather', 'compose'] as const
type VisibleStep = (typeof VISIBLE_STEPS)[number]

const STEP_ICONS: Record<VisibleStep, LucideIcon> = {
  route: Compass, geocoding: MapPin, fuel: Fuel, weather: CloudSun, compose: Sparkles,
}

export function AgentProgress({ doneStages, degraded }: {
  doneStages: AgentStage[]
  degraded: boolean
}) {
  const { language } = useLanguage()
  const t = getTranslation(language as Language)
  const done = new Set<VisibleStep>(
    doneStages.filter((s): s is VisibleStep => s !== 'supervisor'),
  )
  const runningIdx = VISIBLE_STEPS.findIndex(s => !done.has(s))

  return (
    <div className="agent-progress" role="status" aria-live="polite">
      {VISIBLE_STEPS.map((step, i) => {
        const StepIcon = STEP_ICONS[step]
        const state = done.has(step) ? 'done' : i === runningIdx ? 'running' : 'pending'
        return (
          <div key={step} className={`agent-progress-step agent-progress-${state}`}>
            <span className="agent-progress-icon" aria-hidden="true">
              {state === 'done' ? <Check className="w-3.5 h-3.5" />
                : state === 'running' ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <StepIcon className="w-3.5 h-3.5" />}
            </span>
            <span>
              {t.progress[step]}
              {/* state in text, not colour or icon alone */}
              <span className="sr-only"> ({state === 'done' ? t.progress.stateDone : state === 'running' ? t.progress.stateRunning : t.progress.statePending})</span>
            </span>
          </div>
        )
      })}
      {/* reserves the result card's space so the layout does not jump when it arrives */}
      <div className="agent-progress-skeleton animate-pulse" aria-hidden="true">
        <div className="h-4 w-2/3 rounded bg-muted" />
        <div className="h-3 w-full rounded bg-muted" />
        <div className="h-3 w-1/2 rounded bg-muted" />
      </div>
      {degraded && <div className="agent-progress-degraded">{t.progress.stillWorking}</div>}
    </div>
  )
}
