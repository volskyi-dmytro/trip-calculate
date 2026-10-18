import { AgentProgress } from './AgentProgress'
import type { AgentStage } from '../services/agentStreamService'

interface AgentActivitySlotProps {
  isProcessing: boolean
  doneStages: AgentStage[]
  degraded: boolean
}

/** Live agent progress above the AI input; renders nothing when idle (the result is TripSummaryCard). */
export function AgentActivitySlot({ isProcessing, doneStages, degraded }: AgentActivitySlotProps) {
  if (!isProcessing) return null
  return (
    <div className="mb-3">
      <AgentProgress doneStages={doneStages} degraded={degraded} />
    </div>
  )
}
