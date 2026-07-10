import { describe, it, expect } from 'vitest'
import { computeWeightedPrice, applyLiveFuelPrice } from '../fuelPriceService'

const prices = {
  UA: { pricePerLiter: 58.9, stale: false, source: 'minfin', fetchedAt: '2026-07-07T04:00:00Z' },
  PL: { pricePerLiter: 64.75, stale: false, source: 'eu_oil_bulletin', fetchedAt: '2026-07-07T04:00:00Z' },
}

describe('computeWeightedPrice', () => {
  it('weights by leg distance, splitting border legs 50/50', () => {
    const points = [
      { lat: 49.84, lng: 24.03, countryCode: 'UA' },
      { lat: 52.23, lng: 21.01, countryCode: 'PL' },
    ]
    const result = computeWeightedPrice(points, prices)
    expect(result).not.toBeNull()
    expect(result!.price).toBeCloseTo((58.9 + 64.75) / 2, 1)
    expect(result!.stale).toBe(false)
  })

  it('skips waypoints without a country and renormalizes', () => {
    const points = [
      { lat: 49.84, lng: 24.03, countryCode: 'UA' },
      { lat: 50.0, lng: 25.0, countryCode: undefined },
      { lat: 50.45, lng: 30.52, countryCode: 'UA' },
    ]
    expect(computeWeightedPrice(points, prices)!.price).toBeCloseTo(58.9, 2)
  })

  it('returns null when no priced country appears on the route', () => {
    const points = [
      { lat: 1, lng: 1, countryCode: 'DE' },
      { lat: 2, lng: 2, countryCode: 'DE' },
    ]
    expect(computeWeightedPrice(points, prices)).toBeNull()
  })

  it('propagates stale from any contributing row', () => {
    const stalePrices = { UA: { ...prices.UA, stale: true } }
    const points = [
      { lat: 49.84, lng: 24.03, countryCode: 'UA' },
      { lat: 50.45, lng: 30.52, countryCode: 'UA' },
    ]
    expect(computeWeightedPrice(points, stalePrices)!.stale).toBe(true)
  })
})

describe('applyLiveFuelPrice', () => {
  const settings = {
    fuelConsumption: 9.2, fuelCostPerLiter: 55, currency: 'UAH',
    passengerCount: 1, fuelType: 'petrol' as const, fuelPriceTouched: false,
  }
  const suggestion = { price: 58.9, currency: 'UAH', stale: false, fetchedAt: '', source: 'minfin' }

  it('applies when the user has not touched the price', () => {
    const updated = applyLiveFuelPrice(settings, suggestion)
    expect(updated!.fuelCostPerLiter).toBe(58.9)
    expect(updated!.fuelPriceTouched).toBe(false)
  })

  it('NEVER overwrites a touched price', () => {
    expect(applyLiveFuelPrice({ ...settings, fuelPriceTouched: true }, suggestion)).toBeNull()
  })

  it('ignores invalid suggestions', () => {
    expect(applyLiveFuelPrice(settings, null)).toBeNull()
    expect(applyLiveFuelPrice(settings, { ...suggestion, price: 0 })).toBeNull()
  })
})
