import { describe, it, expect } from 'vitest'
import { displayWaypointName, isCoordinateLikeName } from '../waypointName'

describe('isCoordinateLikeName', () => {
  it('flags raw lat/lng pairs', () => {
    expect(isCoordinateLikeName('50.74507, 25.32008')).toBe(true)
    expect(isCoordinateLikeName('-33.865, 151.209')).toBe(true)
  })

  it('does not flag real place names', () => {
    expect(isCoordinateLikeName('Lviv, Ukraine')).toBe(false)
    expect(isCoordinateLikeName('50 Cent Street')).toBe(false)
  })
})

describe('displayWaypointName', () => {
  it('swaps a coordinate-like name for the fallback', () => {
    expect(displayWaypointName('50.74507, 25.32008', 'Stop 2')).toBe('Stop 2')
  })

  it('keeps a real name unchanged', () => {
    expect(displayWaypointName('Lublin, Poland', 'Stop 2')).toBe('Lublin, Poland')
  })
})
