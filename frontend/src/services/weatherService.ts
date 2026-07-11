import { getCsrfToken } from './agentService'
import type { WeatherData } from '../types/weather'

// Spring proxy in front of the agent's deterministic corridor endpoint
const WEATHER_ENDPOINT = '/api/weather/corridor'

/**
 * Corridor forecast for the manual flow. Advisory end-to-end: every
 * failure mode (validation, network, agent down) resolves to null —
 * one attempt, no retry, never throws.
 */
export async function fetchCorridorWeather(
  waypoints: { name: string; latitude: number; longitude: number }[],
  date: string,
): Promise<WeatherData | null> {
  try {
    const csrfToken = getCsrfToken()
    const headers: HeadersInit = { 'Content-Type': 'application/json' }
    if (csrfToken) headers['X-XSRF-TOKEN'] = csrfToken
    const response = await fetch(WEATHER_ENDPOINT, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ waypoints, date }),
    })
    if (!response.ok) return null
    const payload = await response.json() as { weather_data: WeatherData | null }
    return payload.weather_data ?? null
  } catch {
    return null
  }
}
