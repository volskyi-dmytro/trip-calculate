import { useMemo } from 'react'
import type { Waypoint, RouteSettings } from './RoutePlanner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

  return (
    <div className="p-4 space-y-4">
      {/* Summary Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t.routeSummary.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <StatItem
              icon={<Route className="h-5 w-5" />}
              label={t.routeSummary.totalDistance}
              value={`${stats.totalDistance.toFixed(2)} km`}
            />
            <StatItem
              icon={<Fuel className="h-5 w-5" />}
              label={t.routeSummary.fuelNeeded}
              value={`${stats.fuelNeeded.toFixed(2)} L`}
            />
            <StatItem
              icon={<DollarSign className="h-5 w-5" />}
              label={t.routeSummary.fuelCost}
              value={`${stats.fuelCost.toFixed(2)} ${routeSettings.currency}`}
            />
            <StatItem
              icon={<Clock className="h-5 w-5" />}
              label={t.routeSummary.estTime}
              value={`${Math.floor(stats.estimatedTime)}h ${Math.round((stats.estimatedTime % 1) * 60)}m`}
            />
          </div>
        </CardContent>
      </Card>

      {/* Segment Details */}
      {stats.segments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t.routeSegments.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.segments.map((segment, index) => (
                <div key={index} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold mt-1">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{segment.from}</div>
                    <Navigation className="h-3 w-3 text-muted-foreground my-1" />
                    <div className="text-sm font-medium truncate">{segment.to}</div>
                    <div className="text-xs text-muted-foreground mt-2">
                      {segment.distance.toFixed(2)} km
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cost Breakdown */}
      {waypoints.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t.costBreakdown.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t.costBreakdown.fuelConsumption}</span>
              <span className="font-medium">{routeSettings.fuelConsumption} L/100km</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t.costBreakdown.fuelPrice}</span>
              <span className="font-medium">{routeSettings.fuelCostPerLiter} {routeSettings.currency}/L</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t.costBreakdown.distance}</span>
              <span className="font-medium">{stats.totalDistance.toFixed(2)} km</span>
            </div>
            <div className="h-px bg-border my-2" />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t.costBreakdown.fuelNeeded}</span>
              <span className="font-medium">{stats.fuelNeeded.toFixed(2)} L</span>
            </div>
            <div className="flex justify-between font-bold text-base pt-2">
              <span>{t.costBreakdown.totalCost}</span>
              <span className="text-primary">{stats.fuelCost.toFixed(2)} {routeSettings.currency}</span>
            </div>

            {/* Expense Splitting - Show when passengers > 1 */}
            {routeSettings.passengerCount > 1 && (
              <>
                <div className="h-px bg-border my-3" />
                <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {language === 'uk' ? 'Кількість пасажирів' : 'Number of passengers'}
                    </span>
                    <span className="font-medium">{routeSettings.passengerCount}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg pt-1">
                    <span className="text-green-700 dark:text-green-400">
                      {language === 'uk' ? 'Вартість на особу' : 'Cost per person'}
                    </span>
                    <span className="text-green-700 dark:text-green-400">
                      {stats.costPerPerson.toFixed(2)} {routeSettings.currency}
                    </span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {waypoints.length === 0 && (
        <Card>
          <CardContent className="pt-6 pb-6 text-center text-muted-foreground">
            <p className="text-sm">{t.routeSummary.addWaypoints}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function StatItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <span className="font-semibold">{value}</span>
    </div>
  )
}
