// Corridor weather wire types — mirror agent/app/schema.py (WeatherData et al).
// Lives in types/ (not services/) so types/AI.ts can reference it without a
// types -> services cycle.

export type RiskFlagType = 'snow' | 'heavy_rain' | 'strong_wind' | 'ice_risk' | 'storm'

export interface WeatherSample {
  lat: number
  lon: number
  /** Stop name for waypoint samples; null for interpolated corridor points */
  label: string | null
  temp_max_c: number
  temp_min_c: number
  precipitation_mm: number
  snowfall_cm: number
  wind_gust_kmh: number
  weather_code: number
}

export interface RiskFlag {
  type: RiskFlagType
  near: string | null
}

export interface WeatherData {
  date: string
  samples: WeatherSample[]
  risk_flags: RiskFlag[]
  source: string
  fetched_at: string
}
