/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const waypoint = { id: 'country', lat: 52, lng: 13, name: 'Berlin' }

async function services() {
  const { geocodingService } = await import('../geocodingService')
  const { ensureCountryCodes } = await import('../fuelPriceService')
  return { geocodingService, ensureCountryCodes }
}

const reply = (data: unknown) => ({ ok: true, json: async () => data }) as Response

describe('shared Nominatim request queue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    vi.resetModules()
    sessionStorage.clear()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('aborts a stalled advisory request at its deadline so an interactive lookup can proceed', async () => {
    const starts: number[] = []
    let stalledSignal: AbortSignal | undefined
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      starts.push(Date.now())
      if (url.includes('zoom=3')) {
        stalledSignal = init?.signal ?? undefined
        return new Promise<Response>((_resolve, reject) => {
          stalledSignal?.addEventListener('abort', () => reject(stalledSignal?.reason), { once: true })
        })
      }
      return Promise.resolve(reply([{ lat: '48', lon: '2', display_name: 'Paris' }]))
    }))
    const { geocodingService, ensureCountryCodes } = await services()
    const advisory = ensureCountryCodes([waypoint])
    const interactive = geocodingService.forwardGeocode('Paris')
    await vi.advanceTimersByTimeAsync(9999)
    expect(starts).toEqual([0])
    await vi.advanceTimersByTimeAsync(1)
    expect(stalledSignal?.aborted).toBe(true)
    expect(starts).toEqual([0, 10000])
    await expect(advisory).resolves.toEqual([{ lat: 52, lng: 13, countryCode: undefined }])
    await expect(interactive).resolves.toEqual({ lat: 48, lng: 2, displayName: 'Paris' })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('serializes slow requests and resumes queued streams after rejection', async () => {
    const starts: number[] = []
    let rejectFirst!: (error: Error) => void
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      starts.push(Date.now())
      if (url.includes('/search?')) {
        return new Promise<Response>((_resolve, reject) => { rejectFirst = reject })
      }
      return Promise.resolve(reply({ address: { city: 'Berlin', country_code: 'de' } }))
    }))
    const { geocodingService, ensureCountryCodes } = await services()
    const forward = geocodingService.forwardGeocode('Paris')
    const reverse = geocodingService.reverseGeocode(52, 13)
    const countries = ensureCountryCodes([waypoint])
    await vi.advanceTimersByTimeAsync(2500)
    // Even after the spacing interval, the in-flight request blocks the queue.
    expect(starts).toEqual([0])
    rejectFirst(new Error('offline'))
    await vi.advanceTimersByTimeAsync(0)
    await expect(forward).resolves.toBeNull()
    await expect(reverse).resolves.toBe('Berlin')
    expect(starts).toEqual([0, 2500])
    await vi.advanceTimersByTimeAsync(999)
    expect(starts).toEqual([0, 2500])
    await vi.advanceTimersByTimeAsync(1)
    expect(starts).toEqual([0, 2500, 3500])
    await expect(countries).resolves.toEqual([{ lat: 52, lng: 13, countryCode: 'DE' }])
  })

  it('spaces actual forward, reverse and country request starts by at least one second', async () => {
    const starts: number[] = []
    const fetchMock = vi.fn(async (url: string) => {
      starts.push(Date.now())
      return reply(url.includes('/search?')
        ? [{ lat: '48', lon: '2', display_name: 'Paris' }]
        : { address: { city: 'Berlin', road: 'Main Street', country_code: 'de' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    const { geocodingService, ensureCountryCodes } = await services()
    const forward = geocodingService.forwardGeocode('Paris')
    const reverse = geocodingService.reverseGeocode(52, 13)
    const countries = ensureCountryCodes([waypoint])
    await vi.advanceTimersByTimeAsync(0)
    expect(starts).toEqual([0])
    await vi.advanceTimersByTimeAsync(999)
    expect(starts).toEqual([0])
    await vi.advanceTimersByTimeAsync(1)
    expect(starts).toEqual([0, 1000])
    await vi.advanceTimersByTimeAsync(1000)
    expect(starts).toEqual([0, 1000, 2000])
    await expect(forward).resolves.toEqual({ lat: 48, lng: 2, displayName: 'Paris' })
    await expect(reverse).resolves.toBe('Berlin, Main Street')
    await expect(countries).resolves.toEqual([{ lat: 52, lng: 13, countryCode: 'DE' }])
    // Country cache hits and pre-populated codes bypass the network queue.
    await ensureCountryCodes([waypoint, { ...waypoint, countryCode: 'FR' }])
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
