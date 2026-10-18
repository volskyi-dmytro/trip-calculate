import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.fn()
vi.mock('../nominatimQueue', () => ({ nominatimFetch: (...a: unknown[]) => fetchMock(...a) }))
import { geocodingService } from '../geocodingService'

// Shapes captured from live Nominatim (2026-10-18): the oblast outranks the city.
const hit = (name: string, addresstype: string, lat = '49.5', lon = '25.6') =>
  ({ lat, lon, name, addresstype, display_name: `${name}, Ukraine` })
const respond = (rows: unknown[]) =>
  fetchMock.mockResolvedValue({ ok: true, json: async () => rows })

describe('geocodingService.searchPlaces / forwardGeocode (QA F2)', () => {
  beforeEach(() => fetchMock.mockReset())

  it('asks for several results in the UI language instead of limit=1', async () => {
    respond([hit('Ternopil', 'city')])
    await geocodingService.searchPlaces('Ternopil', 'uk')
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('limit=5')
    expect(url).toContain('accept-language=uk')
    expect(url).not.toContain('limit=1&')
  })

  it.each(['Ternopil', 'Vinnytsia', 'Lutsk', 'Lviv', 'Kyiv'])(
    'forwardGeocode(%s) skips the oblast and resolves the city',
    async (city) => {
      respond([hit(`${city} Oblast`, 'state'), hit(city, 'city', '1', '2')])
      const r = await geocodingService.forwardGeocode(city)
      expect(r?.displayName).toBe(`${city}, Ukraine`)
      expect(r?.lat).toBe(1)
    },
  )

  it('keeps the top hit when it is already specific (street address)', async () => {
    respond([hit('Khreshchatyk 1', 'building'), hit('Kyiv', 'city')])
    expect((await geocodingService.forwardGeocode('Khreshchatyk 1, Kyiv'))?.displayName).toBe('Khreshchatyk 1, Ukraine')
  })

  it('returns [] / null on failure or no hits', async () => {
    respond([])
    expect(await geocodingService.searchPlaces('zzzz')).toEqual([])
    expect(await geocodingService.forwardGeocode('zzzz')).toBeNull()
    fetchMock.mockResolvedValue({ ok: false })
    expect(await geocodingService.searchPlaces('x')).toEqual([])
  })
})
