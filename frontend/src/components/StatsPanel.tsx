import { useMemo } from 'react'
import type { Waypoint, RouteSettings } from './RoutePlanner'
import { Fuel, Navigation, DollarSign, Route, Clock } from 'lucide-react'
import type { Language } from '../types'
import { getTranslation } from '../i18n/routePlanner'
import { useLanguage } from '../contexts/LanguageContext'

interface StatsPanelProps {
  waypoints: Waypoint[]
  routeSettings: RouteSettings
  routeDistance: number // in km from OSRM routing service
  routeDuration: number // in minutes from OSRM routing service
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  // Haversine formula
  const R = 6371 // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export function StatsPanel({ waypoints, routeSettings, routeDistance, routeDuration }: StatsPanelProps) {
  const { language } = useLanguage()
  const t = getTranslation(language as Language)

  const stats = useMemo(() => {
    if (waypoints.length < 2) {
      return {
        totalDistance: 0,
        fuelNeeded: 0,
        fuelCost: 0,
        costPerPerson: 0,
        segments: [],
        estimatedTime: 0
      }
    }

    // Use actual road distance from OSRM routing service if available
    // Otherwise fall back to calculating straight-line Haversine distance
    let totalDistance = routeDistance

    const segments: { from: string; to: string; distance: number }[] = []

    // Calculate segment distances for display (still using Haversine as approximation for individual segments)
    for (let i = 0; i < waypoints.length - 1; i++) {
      const from = waypoints[i]
      const to = waypoints[i + 1]
      const distance = calculateDistance(from.lat, from.lng, to.lat, to.lng)
      segments.push({
        from: from.name,
        to: to.name,
        distance
      })
    }

    // If OSRM routing failed (distance = 0), fall back to sum of Haversine distances
    if (totalDistance === 0 && segments.length > 0) {
      totalDistance = segments.reduce((sum, seg) => sum + seg.distance, 0)
      console.warn('⚠️ Using Haversine fallback distance:', totalDistance.toFixed(2), 'km')
    }

    const fuelNeeded = (totalDistance / 100) * routeSettings.fuelConsumption
    const fuelCost = fuelNeeded * routeSettings.fuelCostPerLiter
    const passengerCount = routeSettings.passengerCount || 1
    const costPerPerson = fuelCost / passengerCount

    // Use OSRM duration if available, otherwise estimate at 80 km/h
    const estimatedTime = routeDuration > 0 ? routeDuration / 60 : totalDistance / 80

    return {
      totalDistance,
      fuelNeeded,
      fuelCost,
      costPerPerson,
      segments,
      estimatedTime
    }
  }, [waypoints, routeSettings, routeDistance, routeDuration])

  // Precision Navigation palette helpers
  const cardStyle: React.CSSProperties = {
    background: 'var(--nav-bg-sidebar)',
    border: '1px solid var(--nav-border)',
    borderRadius: '0.5rem',
  }
  const labelStyle: React.CSSProperties = {
    color: 'var(--nav-text-secondary)',
    fontSize: '0.7rem',
  }
  const monoValue: React.CSSProperties = {
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 500,
    color: 'var(--nav-text-primary)',
    fontSize: '0.8rem',
  }
  const sectionTitle: React.CSSProperties = {
    color: 'var(--nav-text-primary)',
    fontWeight: 600,
    fontSize: '0.8rem',
    marginBottom: '0.5rem',
  }

  return (
    <div className="space-y-4">
      {/* Summary Stats — horizontal metric cards */}
      {waypoints.length >= 2 ? (
        <div style={cardStyle} className="p-3 space-y-3">
          <div style={sectionTitle}>{t.routeSummary.title}</div>
          <div className="grid grid-cols-2 gap-2">
            <MetricCard
              icon={<Route className="h-3.5 w-3.5" />}
              label={t.routeSummary.totalDistance}
              value={`${stats.totalDistance.toFixed(2)} km`}
            />
            <MetricCard
              icon={<Clock className="h-3.5 w-3.5" />}
              label={t.routeSummary.estTime}
              value={`${Math.floor(stats.estimatedTime)}h ${Math.round((stats.estimatedTime % 1) * 60)}m`}
            />
            <MetricCard
              icon={<Fuel className="h-3.5 w-3.5" />}
              label={t.routeSummary.fuelNeeded}
              value={`${stats.fuelNeeded.toFixed(2)} L`}
            />
            <MetricCard
              icon={<DollarSign className="h-3.5 w-3.5" />}
              label={t.routeSummary.fuelCost}
              value={`${stats.fuelCost.toFixed(2)} ${routeSettings.currency}`}
              accent
            />
          </div>
        </div>
      ) : (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '1.5rem 1rem' }}>
          <p style={{ color: 'var(--nav-text-secondary)', fontSize: '0.75rem' }}>
            {t.routeSummary.addWaypoints}
          </p>
        </div>
      )}

      {/* Cost Breakdown */}
      {waypoints.length >= 2 && (
        <div style={cardStyle} className="p-3 space-y-2">
          <div style={sectionTitle}>{t.costBreakdown.title}</div>

          <div className="flex justify-between items-center">
            <span style={labelStyle}>{t.costBreakdown.fuelConsumption}</span>
            <span style={monoValue}>{routeSettings.fuelConsumption} L/100km</span>
          </div>
          <div className="flex justify-between items-center">
            <span style={labelStyle}>{t.costBreakdown.fuelPrice}</span>
            <span style={monoValue}>{routeSettings.fuelCostPerLiter} {routeSettings.currency}/L</span>
          </div>
          <div className="flex justify-between items-center">
            <span style={labelStyle}>{t.costBreakdown.distance}</span>
            <span style={monoValue}>{stats.totalDistance.toFixed(2)} km</span>
          </div>

          <div style={{ height: '1px', background: 'var(--nav-border)', margin: '4px 0' }} />

          <div className="flex justify-between items-center">
            <span style={labelStyle}>{t.costBreakdown.fuelNeeded}</span>
            <span style={monoValue}>{stats.fuelNeeded.toFixed(2)} L</span>
          </div>
          <div className="flex justify-between items-center">
            <span style={{ ...labelStyle, fontWeight: 600, color: 'var(--nav-text-primary)' }}>
              {t.costBreakdown.totalCost}
            </span>
            <span style={{ ...monoValue, color: 'var(--nav-accent)', fontSize: '0.9rem' }}>
              {stats.fuelCost.toFixed(2)} {routeSettings.currency}
            </span>
          </div>

          {/* Per-person split */}
          {routeSettings.passengerCount > 1 && (
            <>
              <div style={{ height: '1px', background: 'var(--nav-border)', margin: '4px 0' }} />
              <div
                className="rounded-lg p-2 space-y-1"
                style={{ background: 'var(--nav-bg-input)', border: '1px solid var(--nav-border)' }}
              >
                <div className="flex justify-between items-center">
                  <span style={labelStyle}>
                    {language === 'uk' ? 'Кількість пасажирів' : 'Number of passengers'}
                  </span>
                  <span style={monoValue}>{routeSettings.passengerCount}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--nav-accent)' }}>
                    {language === 'uk' ? 'Вартість на особу' : 'Cost per person'}
                  </span>
                  <span style={{ ...monoValue, color: 'var(--nav-accent)', fontSize: '0.9rem' }}>
                    {stats.costPerPerson.toFixed(2)} {routeSettings.currency}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Segment Details */}
      {stats.segments.length > 0 && (
        <div style={cardStyle} className="p-3 space-y-2">
          <div style={sectionTitle}>{t.routeSegments.title}</div>
          <div className="space-y-2">
            {stats.segments.map((segment, index) => (
              <div
                key={index}
                className="flex items-start gap-2 p-2 rounded-lg"
                style={{ background: 'var(--nav-bg-input)', border: '1px solid var(--nav-border)' }}
              >
                <div
                  className="flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold flex-shrink-0 mt-0.5"
                  style={{ background: 'var(--nav-accent)', color: '#000' }}
                >
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate" style={{ color: 'var(--nav-text-primary)' }}>
                    {segment.from}
                  </div>
                  <Navigation className="h-2.5 w-2.5 my-0.5" style={{ color: 'var(--nav-text-secondary)' }} />
                  <div className="text-xs font-medium truncate" style={{ color: 'var(--nav-text-primary)' }}>
                    {segment.to}
                  </div>
                  <div
                    className="text-xs mt-1"
                    style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--nav-text-secondary)', fontSize: '0.65rem' }}
                  >
                    {segment.distance.toFixed(2)} km
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MetricCard({
  icon,
  label,
  value,
  accent = false,
}: {
  icon: React.ReactNode
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div
      className="p-2 rounded-lg"
      style={{
        background: 'var(--nav-bg-input)',
        border: '1px solid var(--nav-border)',
      }}
    >
      <div className="flex items-center gap-1 mb-1" style={{ color: 'var(--nav-text-secondary)' }}>
        {icon}
        <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      </div>
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 500,
          fontSize: '0.8rem',
          color: accent ? 'var(--nav-accent)' : 'var(--nav-text-primary)',
        }}
      >
        {value}
      </div>
    </div>
  )
}
