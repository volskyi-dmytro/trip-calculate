import { describe, expect, it } from 'vitest'
import { roundLegsToTotal } from '../tripSummary'
import { formatDistance } from '../../../lib/format'

// QA C10: the per-leg distances shown must add up to the total as displayed, around the
// 10 km switch between one-decimal and whole-km precision.
const shown = (km: number) => Number(formatDistance(km, 'en').replace(/[^\d.]/g, ''))
const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 10) / 10

describe('roundLegsToTotal around the 10 km boundary', () => {
  it.each([9.84, 9.94, 9.949, 9.95, 9.951, 9.96, 9.99, 10, 10.04, 10.05, 10.49, 10.5, 10.51])(
    'two legs of a %d km route add up to the displayed total',
    total => {
      const legs = roundLegsToTotal([total * 0.37, total * 0.63], total)
      expect(sum(legs)).toBe(shown(total))
    },
  )

  it('keeps legs non-negative and returns [] for no legs', () => {
    expect(roundLegsToTotal([], 5)).toEqual([])
    expect(roundLegsToTotal([0, 0], 0).every(l => l >= 0)).toBe(true)
  })
})
