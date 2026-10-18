import { afterEach, describe, expect, it, vi } from 'vitest'
import { routingService } from '../routingService'
import { api } from '../api'

afterEach(() => vi.restoreAllMocks())

describe('routingService.getRoute (BUG-1)', () => {
  it('reports an unreachable destination instead of drawing a fake line', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({
      data: { noRoute: true, totalDistance: 0, totalDuration: 0, geometry: [], segments: [] },
    })

    const route = await routingService.getRoute([{ lat: 50.45, lng: 30.52 }, { lat: 49.26, lng: -123.11 }])

    expect(route.noRoute).toBe(true)
    expect(route.totalDistance).toBe(0)
    expect(route.geometry).toEqual([])
  })
})

describe('routingService.getRoute provenance (P0-A)', () => {
  const wps = [{ lat: 50.45, lng: 30.52 }, { lat: 49.84, lng: 24.03 }]

  it('labels a provider route as road quality', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({
      data: { totalDistance: 540, totalDuration: 300, geometry: [[50.45, 30.52], [49.84, 24.03]], segments: [], provider: 'mapbox' },
    })
    const route = await routingService.getRoute(wps)
    expect(route.quality).toBe('road')
    expect(route.source).toBe('mapbox')
    expect(Number.isNaN(Date.parse(route.calculatedAt))).toBe(false)
  })

  it('keeps an outage approximate, never road', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(api, 'post').mockRejectedValue(new Error('down'))
    const route = await routingService.getRoute(wps)
    expect(route.quality).toBe('approximate')
    expect(route.totalDistance).toBe(0)
  })

  it('treats the server straight-line fallback (zero distance) as approximate', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({
      data: { totalDistance: 0, totalDuration: 0, geometry: [[50.45, 30.52], [49.84, 24.03]], segments: [] },
    })
    expect((await routingService.getRoute(wps)).quality).toBe('approximate')
  })

  it('marks no-route as unavailable', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({ data: { noRoute: true } })
    expect((await routingService.getRoute(wps)).quality).toBe('unavailable')
  })
})
