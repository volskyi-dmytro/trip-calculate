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
