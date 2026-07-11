import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchCorridorWeather } from '../weatherService'

const WAYPOINTS = [
  { name: 'Kyiv', latitude: 50.45, longitude: 30.52 },
  { name: 'Lviv', latitude: 49.84, longitude: 24.03 },
]
const WEATHER = {
  date: '2026-07-12', samples: [], risk_flags: [],
  source: 'open-meteo', fetched_at: '2026-07-12T00:00:00Z',
}

afterEach(() => vi.unstubAllGlobals())

describe('fetchCorridorWeather', () => {
  it('returns weather_data from a 200 response', async () => {
    vi.stubGlobal('document', { cookie: 'XSRF-TOKEN=tok' })
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ weather_data: WEATHER }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchCorridorWeather(WAYPOINTS, '2026-07-12')
    expect(result).toEqual(WEATHER)
    const [, init] = fetchMock.mock.calls[0]
    expect((init.headers as Record<string, string>)['X-XSRF-TOKEN']).toBe('tok')
    expect(JSON.parse(init.body as string)).toEqual(
      { waypoints: WAYPOINTS, date: '2026-07-12' })
  })

  it('returns null for a null advisory body', async () => {
    vi.stubGlobal('document', { cookie: '' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ weather_data: null }), { status: 200 })))
    expect(await fetchCorridorWeather(WAYPOINTS, '2026-07-12')).toBeNull()
  })

  it('returns null on non-200 and on network failure — never throws', async () => {
    vi.stubGlobal('document', { cookie: '' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 400 })))
    expect(await fetchCorridorWeather(WAYPOINTS, '2026-07-12')).toBeNull()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    expect(await fetchCorridorWeather(WAYPOINTS, '2026-07-12')).toBeNull()
  })
})
