import { describe, it, expect } from 'vitest'
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun } from 'lucide-react'
import { weatherIcon } from '../../utils/weatherUtils'

describe('weatherIcon WMO buckets', () => {
  it('maps representative codes to distinct icon families', () => {
    expect(weatherIcon(0)).toBe(Sun)           // clear
    expect(weatherIcon(2)).toBe(CloudSun)      // partly cloudy
    expect(weatherIcon(3)).toBe(Cloud)         // overcast
    expect(weatherIcon(45)).toBe(CloudFog)     // fog
    expect(weatherIcon(55)).toBe(CloudDrizzle) // drizzle
    expect(weatherIcon(63)).toBe(CloudRain)    // rain
    expect(weatherIcon(73)).toBe(CloudSnow)    // snow
    expect(weatherIcon(81)).toBe(CloudRain)    // showers
    expect(weatherIcon(86)).toBe(CloudSnow)    // snow showers
    expect(weatherIcon(95)).toBe(CloudLightning) // thunderstorm
  })
})
