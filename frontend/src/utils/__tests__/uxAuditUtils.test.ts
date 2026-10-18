import { describe, expect, it, vi } from 'vitest'

vi.mock('../../services/api', () => ({ API_BASE_URL: '' }))

const { buildLoginUrl } = await import('../loginUrl')
const { parsePlannerPrefill, plannerPrefillQuery } = await import('../plannerPrefill')
const { defaultTripName } = await import('../plannerDraft')

describe('buildLoginUrl', () => {
  it('carries a locale-prefixed return path', () => {
    expect(buildLoginUrl('/en/route-planner?x=1')).toBe('/oauth2/authorization/google?returnTo=%2Fen%2Froute-planner%3Fx%3D1')
    expect(buildLoginUrl('/uk')).toBe('/oauth2/authorization/google?returnTo=%2Fuk')
  })
  it('drops anything that is not an app path (the server re-checks too)', () => {
    for (const bad of ['https://evil.com', '//evil.com', '/', '/admin', '/enx']) {
      expect(buildLoginUrl(bad)).toBe('/oauth2/authorization/google')
    }
  })
})

describe('planner prefill', () => {
  const p = { from: { name: 'Kyiv', lat: 50.45, lng: 30.52 }, to: { name: 'Lviv', lat: 49.84, lng: 24.03 }, passengers: 3 }
  it('round-trips through the query string', () => {
    expect(parsePlannerPrefill(new URLSearchParams(plannerPrefillQuery(p)))).toEqual(p)
  })
  it('rejects missing or out-of-range coordinates', () => {
    expect(parsePlannerPrefill(new URLSearchParams('from=Kyiv&to=Lviv'))).toBeNull()
    expect(parsePlannerPrefill(new URLSearchParams('from=A&fromLat=91&fromLng=0&to=B&toLat=0&toLng=0'))).toBeNull()
  })
  it('ignores an invalid passenger count', () => {
    const q = plannerPrefillQuery({ ...p, passengers: undefined }) + '&passengers=99'
    expect(parsePlannerPrefill(new URLSearchParams(q))?.passengers).toBeUndefined()
  })
})

describe('defaultTripName', () => {
  it('uses the short first and last stop names', () => {
    expect(defaultTripName([{ name: 'Kyiv, Ukraine' }, { name: 'Zhytomyr' }, { name: 'Lviv, Lviv Oblast, Ukraine' }])).toBe('Kyiv → Lviv')
  })
  it('falls back with fewer than two stops', () => {
    expect(defaultTripName([{ name: 'Kyiv' }], 'Trip')).toBe('Trip')
  })
})
