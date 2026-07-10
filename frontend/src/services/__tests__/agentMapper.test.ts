import { describe, it, expect } from 'vitest'
import { mapAgentRouteResponse } from '../agentService'

const ok = {
  success: true,
  route: {
    waypoints: [
      { positionOrder: 1, name: 'Zhytomyr', latitude: 50.25, longitude: 28.66 },
      { positionOrder: 0, name: 'Kyiv', latitude: 50.45, longitude: 30.52 },
      { positionOrder: 2, name: 'Lviv', latitude: 49.84, longitude: 24.03 },
    ],
    settings: { passengers: 3, fuelCostPerLiter: 60 },
  },
  fuel_data: {
    price_per_liter: 61.83, currency: 'UAH', fuel_type: 'petrol',
    source: 'minfin', fetched_at: '2026-07-10T04:00:00Z', stale: false,
  },
}

describe('mapAgentRouteResponse', () => {
  it('sorts by positionOrder and maps origin/waypoints/destination', () => {
    const { data } = mapAgentRouteResponse(ok as never)
    expect(data!.originName).toBe('Kyiv')
    expect(data!.destinationName).toBe('Lviv')
    expect(data!.waypoints).toHaveLength(1)
    expect(data!.waypoints![0].display_name).toBe('Zhytomyr')
  })

  it('maps settings and fuel_data', () => {
    const { data } = mapAgentRouteResponse(ok as never)
    expect(data!.passengers).toBe(3)
    expect(data!.price).toBe(60)
    expect(data!.fuelData!.price).toBe(61.83)
  })

  it('surfaces the agent error on failure', () => {
    const res = mapAgentRouteResponse({ success: false, error: 'off topic' } as never)
    expect(res.data).toBeNull()
    expect(res.error).toBe('off topic')
  })
})
