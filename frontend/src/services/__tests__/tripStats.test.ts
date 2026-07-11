import { describe, it, expect } from 'vitest'
import { computeTripStats } from '../tripStats'

const wps = [
  { name: 'Kyiv', lat: 50.45, lng: 30.52 },
  { name: 'Lviv', lat: 49.84, lng: 24.03 },
]
const settings = { fuelConsumption: 10, fuelCostPerLiter: 60, passengerCount: 2 }

describe('computeTripStats', () => {
  it('uses road distance when available', () => {
    const s = computeTripStats(wps, settings, 540, 300)
    expect(s.totalDistance).toBe(540)
    expect(s.fuelNeeded).toBeCloseTo(54)
    expect(s.fuelCost).toBeCloseTo(3240)
    expect(s.costPerPerson).toBeCloseTo(1620)
    expect(s.estimatedTime).toBeCloseTo(5)   // 300 min → hours
  })

  it('falls back to Haversine when routing failed', () => {
    const s = computeTripStats(wps, settings, 0, 0)
    expect(s.totalDistance).toBeGreaterThan(400)  // ~469km straight line
    expect(s.segments).toHaveLength(1)
  })

  it('zeroes out below two waypoints', () => {
    expect(computeTripStats([wps[0]], settings, 0, 0).fuelCost).toBe(0)
  })
})
