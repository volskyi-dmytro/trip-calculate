import { useLanguage } from '../contexts/LanguageContext'
import { getTranslation, type Language } from '../i18n/routePlanner'
import type { RiskFlagType, WeatherData } from '../types/weather'
import { weatherIcon } from '../utils/weatherUtils'

const FLAG_ICONS: Record<RiskFlagType, string> = {
  snow: '❄️', heavy_rain: '🌧️', strong_wind: '💨', ice_risk: '🧊', storm: '⛈️',
}

/**
 * Shared per-stop weather + risk-flag strip, rendered in the TripResultCard
 * (AI flow) and the route panel (manual flow). Advisory: renders nothing
 * when weather is absent.
 */
export function WeatherStrip({ weather }: { weather: WeatherData | null }) {
  const { language } = useLanguage()
  const t = getTranslation(language as Language)
  if (!weather || weather.samples.length === 0) return null
  const stops = weather.samples.filter(s => s.label)

  return (
    <div className="weather-strip" aria-label={t.weather.title}>
      <div className="weather-strip-stops">
        {stops.map((s, i) => (
          <span key={`${s.lat},${s.lon},${i}`} className="weather-strip-stop">
            <span aria-hidden="true">{weatherIcon(s.weather_code)}</span>
            {' '}{s.label!.split(',')[0]} {Math.round(s.temp_max_c)}°
          </span>
        ))}
      </div>
      {weather.risk_flags.length > 0 && (
        <div className="weather-strip-flags">
          {weather.risk_flags.map(f => (
            <span key={f.type} className="weather-strip-flag">
              <span aria-hidden="true">{FLAG_ICONS[f.type]}</span>
              {' '}{t.weather.flags[f.type]}
              {f.near ? ` — ${f.near.split(',')[0]}` : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
