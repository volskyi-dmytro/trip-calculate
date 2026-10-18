import { describe, expect, it } from 'vitest'
import fixtures from '../../../../fixtures/route-cost-v2.json'
import { buildEstimateExport, computeTripStats } from '../tripStats'
import { computeCost } from '../costScenarios'

const waypoints = [{ name: 'A', lat: 0, lng: 0 }, { name: 'B', lat: 0, lng: 1 }]

describe('shared route-cost/2 decimal contract', () => {
  it('versions the changed arithmetic in computed and exported provenance', () => {
    const settings = { fuelConsumption: 10, fuelCostPerLiter: 60, passengerCount: 2 }
    expect(computeTripStats(waypoints, settings, 188.694, 60, 'road').modelVersion).toBe('trip-estimate/2')
    expect(buildEstimateExport(waypoints, settings, 188.694, 60, { quality: 'road', source: 'test', calculatedAt: '2026-10-18T00:00:00Z' }).modelVersion).toBe('trip-estimate/2')
  })
  it('does not replace a tiny road distance rounded to zero with a straight-line route', () => {
    const stats = computeTripStats(waypoints, { fuelConsumption: 10, fuelCostPerLiter: 60, passengerCount: 2 }, 0.004, 1, 'road')
    expect(stats).toMatchObject({ totalDistance: 0, fuelCost: 0, costPerPerson: 0, quality: 'road' })
    expect(stats.segments[0].distance).toBe(0)
  })
  it.each(fixtures.cases)('normalizes $rawDistanceKm km, $fuelConsumption L/100km, $fuelPrice and $people people', c => {
    const stats = computeTripStats(waypoints, {
      fuelConsumption: Number(c.fuelConsumption), fuelCostPerLiter: Number(c.fuelPrice), passengerCount: c.people,
    }, Number(c.rawDistanceKm), 60, 'road')
    expect(stats.totalDistance).toBe(Number(c.distanceKm))
    expect(stats.fuelCost).toBe(Number(c.totalCost))
    expect(stats.costPerPerson).toBe(Number(c.costPerPerson))
    expect(stats.segments.reduce((sum, leg) => sum + leg.distance, 0)).toBeCloseTo(Number(c.distanceKm), 10)
    expect(computeCost({ distanceKm: Number(c.rawDistanceKm), consumption: Number(c.fuelConsumption), price: Number(c.fuelPrice), passengers: c.people }))
      .toEqual({ total: Number(c.totalCost), perPerson: Number(c.costPerPerson) })
  })
})
