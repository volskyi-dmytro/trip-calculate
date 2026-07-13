import { describe, expect, it } from 'vitest'
import { resolveRouteCalculation } from '../aiResultCard'

describe('resolveRouteCalculation', () => {
  it('ignores an out-of-order routing response', () => {
    expect(resolveRouteCalculation(1, 2, 'ai-route', 'ai-route', 542.9)).toEqual({
      apply: false,
      revealAiResult: false,
    })
  })

  it('reveals a matching pending AI route after its latest road calculation completes', () => {
    expect(resolveRouteCalculation(2, 2, 'ai-route', 'ai-route', 542.9)).toEqual({
      apply: true,
      revealAiResult: true,
    })
  })

  it('does not reveal an AI result for a different route or a failed calculation', () => {
    expect(resolveRouteCalculation(2, 2, 'ai-route', 'manual-route', 542.9).revealAiResult).toBe(false)
    expect(resolveRouteCalculation(2, 2, 'ai-route', 'ai-route', 0).revealAiResult).toBe(false)
  })
})
