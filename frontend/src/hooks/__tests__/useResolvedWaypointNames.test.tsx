/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { geocodingService } from '../../services/geocodingService'
import { useResolvedWaypointNames } from '../useResolvedWaypointNames'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type W = { id: string; lat: number; lng: number; name: string }
const mk = (suffix = ''): W[] =>
  [10, 20, 30].map(n => ({ id: `w${n}${suffix}`, lat: n + 0.5, lng: n + 0.25, name: `${n + 0.5}, ${n + 0.25}` }))

function Probe({ wps, rename }: { wps: W[]; rename: (id: string, name: string) => void }) {
  useResolvedWaypointNames(wps, rename)
  return null
}
const mount = (wps: W[], rename: () => void) =>
  act(() => createRoot(document.body.appendChild(document.createElement('div'))).render(<Probe wps={wps} rename={rename} />))
const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

describe('useResolvedWaypointNames', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('queues reverse geocoding serially, >=1 s apart, and caches repeats', async () => {
    const starts: number[] = []
    vi.spyOn(geocodingService, 'reverseGeocode').mockImplementation(async lat => {
      starts.push(Date.now())
      return `Place ${lat}`
    })
    const rename = vi.fn()
    await mount(mk(), rename)

    await tick(0)
    expect(starts).toHaveLength(1)
    await tick(999)
    expect(starts).toHaveLength(1)
    await tick(1)
    expect(starts).toHaveLength(2)
    await tick(1000)
    expect(starts).toHaveLength(3)
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(1000)
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(1000)
    expect(rename).toHaveBeenCalledTimes(3)

    // same coordinates again: served from cache, no new request
    await mount(mk('b'), rename)
    await tick(5000)
    expect(starts).toHaveLength(3)
    expect(rename).toHaveBeenCalledTimes(6)
  })
})
