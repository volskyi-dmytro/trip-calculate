import { describe, it, expect } from 'vitest'
import { computeTripStats, buildEstimateExport } from '../tripStats'

const wps = [
  { name: 'Kyiv', lat: 50.45, lng: 30.52 },
  { name: 'Lviv', lat: 49.84, lng: 24.03 },
]
const settings = { fuelConsumption: 10, fuelCostPerLiter: 60, passengerCount: 2 }

describe('computeTripStats', () => {
  it('uses road distance when available', () => {
    const s = computeTripStats(wps, settings, 540, 300)
    expect(s.totalDistance).toBe(540)
    expect(s.segments[0].distance).toBe(540)
    expect(s.fuelNeeded).toBeCloseTo(54)
    expect(s.fuelCost).toBeCloseTo(3240)
    expect(s.costPerPerson).toBeCloseTo(1620)
    expect(s.estimatedTime).toBeCloseTo(5)   // 300 min → hours
  })

  it('keeps multi-stop segment distances consistent with the routed total', () => {
    const multiStopWaypoints = [
      wps[0],
      { name: 'Rivne', lat: 50.62, lng: 26.25 },
      wps[1],
    ]

    const s = computeTripStats(multiStopWaypoints, settings, 600, 360)

    expect(s.segments).toHaveLength(2)
    expect(s.segments.reduce((sum, segment) => sum + segment.distance, 0)).toBeCloseTo(600)
  })

  it('reconciles displayed segment rounding with the displayed routed total', () => {
    const equalLegWaypoints = [
      { name: 'A', lat: 0, lng: 0 },
      { name: 'B', lat: 0, lng: 1 },
      { name: 'C', lat: 0, lng: 2 },
      { name: 'D', lat: 0, lng: 3 },
    ]

    const s = computeTripStats(equalLegWaypoints, settings, 100, 60)
    const displayedSegmentTotal = s.segments.reduce(
      (sum, segment) => sum + Number(segment.distance.toFixed(2)),
      0,
    )

    expect(displayedSegmentTotal).toBe(Number(s.totalDistance.toFixed(2)))
  })

  it('never makes a short final segment negative while reconciling cents', () => {
    const unevenWaypoints = [
      { name: 'A', lat: 0, lng: 0 },
      { name: 'B', lat: 0, lng: 3 },
      { name: 'C', lat: 0, lng: 6 },
      { name: 'D', lat: 0, lng: 9 },
      { name: 'E', lat: 0, lng: 10 },
    ]

    const s = computeTripStats(unevenWaypoints, settings, 0.02, 1)
    const displayedSegmentTotal = s.segments.reduce(
      (sum, segment) => sum + Number(segment.distance.toFixed(2)),
      0,
    )

    expect(s.segments.every(segment => segment.distance >= 0)).toBe(true)
    expect(displayedSegmentTotal).toBe(Number(s.totalDistance.toFixed(2)))
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

describe('computeTripStats provenance (P0-A)', () => {
  it('labels a routed total as road with provider duration and proportional legs', () => {
    const s = computeTripStats(wps, settings, 540, 300, 'road')
    expect(s).toMatchObject({ quality: 'road', durationBasis: 'provider', legBasis: 'proportional' })
  })

  it('keeps the outage estimate approximate with assumed-speed duration, even if the caller claims road', () => {
    const s = computeTripStats(wps, settings, 0, 0, 'road')
    expect(s).toMatchObject({ quality: 'approximate', durationBasis: 'assumed-speed', legBasis: 'straight-line' })
    expect(s.totalDistance).toBeGreaterThan(0)
  })

  it('yields no figures for an unavailable route, so no receipt can be built from it', () => {
    const s = computeTripStats(wps, settings, 0, 0, 'unavailable')
    expect(s).toMatchObject({ quality: 'unavailable', totalDistance: 0, fuelCost: 0, segments: [] })
  })

  it('reconciles legs with the total without claiming they are measured', () => {
    const three = [wps[0], { name: 'Rivne', lat: 50.62, lng: 26.25 }, wps[1]]
    const s = computeTripStats(three, settings, 600, 360, 'road')
    expect(s.segments.reduce((sum, l) => sum + l.distance, 0)).toBeCloseTo(600)
    expect(s.legBasis).toBe('proportional')
  })

  it('carries outage quality into the export block', () => {
    const e = buildEstimateExport(wps, settings, 0, 0, { quality: 'approximate', source: 'straight-line', calculatedAt: '2026-01-01T00:00:00Z' })
    expect(e).toMatchObject({ quality: 'approximate', source: 'straight-line', durationBasis: 'assumed-speed' })
  })
})
