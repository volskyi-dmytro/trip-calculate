import { describe, it, expect } from 'vitest'
import { weatherIcon } from '../../utils/weatherUtils'

describe('weatherIcon WMO buckets', () => {
  it('maps representative codes to distinct glyph families', () => {
    expect(weatherIcon(0)).toBe('☀️')     // clear
    expect(weatherIcon(2)).toBe('🌤️')    // partly cloudy
    expect(weatherIcon(3)).toBe('☁️')     // overcast
    expect(weatherIcon(45)).toBe('🌫️')   // fog
    expect(weatherIcon(55)).toBe('🌦️')   // drizzle
    expect(weatherIcon(63)).toBe('🌧️')   // rain
    expect(weatherIcon(73)).toBe('🌨️')   // snow
    expect(weatherIcon(81)).toBe('🌧️')   // showers
    expect(weatherIcon(86)).toBe('🌨️')   // snow showers
    expect(weatherIcon(95)).toBe('⛈️')    // thunderstorm
  })
})
