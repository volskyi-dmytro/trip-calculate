import { describe, it, expect } from 'vitest'
import { wazeLegLinks } from '../wazeExport'

describe('wazeLegLinks', () => {
  it('emits one link per leg with destination coordinates', () => {
    const links = wazeLegLinks([
      { name: 'Kyiv', lat: 50.45, lng: 30.52 },
      { name: 'Zhytomyr', lat: 50.25, lng: 28.66 },
      { name: 'Lviv', lat: 49.84, lng: 24.03 },
    ])
    expect(links).toHaveLength(2)
    expect(links[0].label).toBe('Kyiv → Zhytomyr')
    expect(links[0].url).toBe('https://waze.com/ul?ll=50.25,28.66&navigate=yes')
    expect(links[1].label).toBe('Zhytomyr → Lviv')
  })

  it('skips legs whose destination lacks coordinates', () => {
    const links = wazeLegLinks([
      { name: 'A', lat: 50, lng: 30 },
      { name: 'B', lat: NaN, lng: 28 },
      { name: 'C', lat: 49, lng: 24 },
    ])
    expect(links).toHaveLength(1)
    expect(links[0].label).toBe('B → C')
  })

  it('returns empty below two waypoints', () => {
    expect(wazeLegLinks([{ name: 'A', lat: 1, lng: 2 }])).toEqual([])
  })
})
