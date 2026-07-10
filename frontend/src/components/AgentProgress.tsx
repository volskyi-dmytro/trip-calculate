import { Check, Loader2 } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext'
import { getTranslation, type Language } from '../i18n/routePlanner'
import type { AgentStage } from '../services/agentStreamService'

// Visible steps; the wire-level 'supervisor' stage counts toward 'route'
// so users see agents, not internals
const VISIBLE_STEPS = ['route', 'geocoding', 'fuel', 'compose'] as const
type VisibleStep = (typeof VISIBLE_STEPS)[number]

const STEP_ICONS: Record<VisibleStep, string> = {
  route: '🧭', geocoding: '📍', fuel: '⛽', compose: '✨',
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
        const state = done.has(step) ? 'done' : i === runningIdx ? 'running' : 'pending'
        return (
          <div key={step} className={`agent-progress-step agent-progress-${state}`}>
            <span className="agent-progress-icon" aria-hidden="true">
              {state === 'done' ? <Check className="w-3.5 h-3.5" />
                : state === 'running' ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : STEP_ICONS[step]}
            </span>
            <span>{t.progress[step]}</span>
          </div>
        )
      })}
      {degraded && <div className="agent-progress-degraded">{t.progress.stillWorking}</div>}
    </div>
  )
}
