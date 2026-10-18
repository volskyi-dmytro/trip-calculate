import { describe, expect, it } from 'vitest'
import {
  compareScenarios, computeCost, formatAmount, formatDelta, MAX_SCENARIOS, parseOverride,
  type CostInputs,
} from '../costScenarios'

const base: CostInputs = { distanceKm: 584, consumption: 7.5, price: 1.75, passengers: 4 }

describe('computeCost', () => {
  it('matches the calculator formula exactly (76.65 total, 19.16 per person)', () => {
    const r = computeCost(base)!
    // route-cost/2 returns rounded decimal money, not a binary product's tail.
    // The shared route-cost-v2 fixture suite exercises the same contract.
    expect(r.total).toBe(76.65)
    expect(r.perPerson).toBe(19.16)
    expect(formatAmount(r.total, 'EUR')).toBe('76.65 EUR')
    expect(formatAmount(r.perPerson, 'EUR')).toBe('19.16 EUR')
  })
  it('allows a zero distance', () => {
    expect(computeCost({ ...base, distanceKm: 0 })).toEqual({ total: 0, perPerson: 0 })
  })
  it.each([
    { consumption: -1 }, { price: NaN }, { price: Infinity }, { passengers: 0 }, { passengers: 2.5 }, { distanceKm: -5 },
  ])('rejects invalid input %j', (bad) => {
    expect(computeCost({ ...base, ...bad })).toBeNull()
  })
})

describe('parseOverride', () => {
  it('treats blank as inherit and accepts decimal commas', () => {
    expect(parseOverride('  ')).toBeUndefined()
    expect(parseOverride('1,75')).toBe(1.75)
    expect(parseOverride('.5')).toBe(0.5)
  })
  it('flags junk, negatives, exponents and fractional passengers', () => {
    for (const s of ['abc', '-1', '1e3', '1.2.3', 'Infinity']) expect(parseOverride(s)).toBe('invalid')
    expect(parseOverride('2.5', true)).toBe('invalid')
    expect(parseOverride('3', true)).toBe(3)
  })
})

describe('compareScenarios', () => {
  it('an empty override reproduces the baseline with zero delta', () => {
    const [row] = compareScenarios(base, [{}])
    expect(row.result).toEqual(computeCost(base))
    expect(row.deltaTotal).toBe(0)
    expect(row.deltaPerPerson).toBe(0)
  })
  it('overrides one factor and keeps the same distance', () => {
    const [row] = compareScenarios(base, [{ consumption: 5 }])
    expect(formatAmount(row.result!.total, 'EUR')).toBe('51.10 EUR')
    expect(row.deltaTotal).toBe(-25.55)
  })
  it('more passengers lowers per-person but not total', () => {
    const [row] = compareScenarios(base, [{ passengers: 5 }])
    expect(row.deltaTotal).toBe(0)
    expect(row.deltaPerPerson).toBeLessThan(0)
  })
  it('undefined overrides inherit the baseline', () => {
    const [row] = compareScenarios(base, [{ price: undefined, passengers: 2 }])
    expect(row.result!.total).toBe(computeCost(base)!.total)
  })
  it('invalid scenario yields null, not zero, and does not affect others', () => {
    const rows = compareScenarios(base, [{ price: NaN }, { price: 2 }])
    expect(rows[0]).toEqual({ result: null, deltaTotal: null, deltaPerPerson: null })
    expect(rows[1].result).not.toBeNull()
  })
  it('invalid baseline gives no deltas', () => {
    const [row] = compareScenarios({ ...base, consumption: NaN }, [{ consumption: 5 }])
    expect(row.result).not.toBeNull()
    expect(row.deltaTotal).toBeNull()
  })
  it('never mutates the baseline or the scenario inputs', () => {
    const b = Object.freeze({ ...base })
    const s = Object.freeze({ price: 2 })
    expect(() => compareScenarios(b, [s])).not.toThrow()
    expect(b).toEqual(base)
  })
  it(`caps at ${MAX_SCENARIOS} scenarios`, () => {
    expect(compareScenarios(base, [{}, {}, {}, {}, {}])).toHaveLength(MAX_SCENARIOS)
  })
})

describe('formatDelta', () => {
  it('signs and rounds consistently', () => {
    expect(formatDelta(1.5, 'UAH')).toBe('+1.50 UAH')
    expect(formatDelta(-25.55, 'UAH')).toBe('−25.55 UAH')
    expect(formatDelta(0, 'UAH')).toBe('0.00 UAH')
  })
})
