import { useMemo } from 'react'
import type { Waypoint, RouteSettings } from './RoutePlanner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Fuel, Navigation, DollarSign, Route, Clock } from 'lucide-react'

interface StatsPanelProps {
  waypoints: Waypoint[]
  routeSettings: RouteSettings
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

export function StatsPanel({ waypoints, routeSettings }: StatsPanelProps) {
  const stats = useMemo(() => {
    if (waypoints.length < 2) {
      return {
        totalDistance: 0,
        fuelNeeded: 0,
        fuelCost: 0,
        segments: [],
        estimatedTime: 0
      }
    }

    let totalDistance = 0
    const segments: { from: string; to: string; distance: number }[] = []

    for (let i = 0; i < waypoints.length - 1; i++) {
      const from = waypoints[i]
      const to = waypoints[i + 1]
      const distance = calculateDistance(from.lat, from.lng, to.lat, to.lng)
      totalDistance += distance
      segments.push({
        from: from.name,
        to: to.name,
        distance
      })
    }

    const fuelNeeded = (totalDistance / 100) * routeSettings.fuelConsumption
    const fuelCost = fuelNeeded * routeSettings.fuelCostPerLiter
    const estimatedTime = totalDistance / 80 // Assuming 80 km/h average speed

    return {
      totalDistance,
      fuelNeeded,
      fuelCost,
      segments,
      estimatedTime
    }
  }, [waypoints, routeSettings])

  return (
    <div className="p-4 space-y-4">
      {/* Summary Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Route Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <StatItem
              icon={<Route className="h-5 w-5" />}
              label="Total Distance"
              value={`${stats.totalDistance.toFixed(2)} km`}
            />
            <StatItem
              icon={<Fuel className="h-5 w-5" />}
              label="Fuel Needed"
              value={`${stats.fuelNeeded.toFixed(2)} L`}
            />
            <StatItem
              icon={<DollarSign className="h-5 w-5" />}
              label="Fuel Cost"
              value={`${stats.fuelCost.toFixed(2)} ${routeSettings.currency}`}
            />
            <StatItem
              icon={<Clock className="h-5 w-5" />}
              label="Est. Time"
              value={`${Math.floor(stats.estimatedTime)}h ${Math.round((stats.estimatedTime % 1) * 60)}m`}
            />
          </div>
        </CardContent>
      </Card>

      {/* Segment Details */}
      {stats.segments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Route Segments</CardTitle>
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
            <CardTitle className="text-lg">Cost Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Fuel consumption:</span>
              <span className="font-medium">{routeSettings.fuelConsumption} L/100km</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Fuel price:</span>
              <span className="font-medium">{routeSettings.fuelCostPerLiter} {routeSettings.currency}/L</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Distance:</span>
              <span className="font-medium">{stats.totalDistance.toFixed(2)} km</span>
            </div>
            <div className="h-px bg-border my-2" />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Fuel needed:</span>
              <span className="font-medium">{stats.fuelNeeded.toFixed(2)} L</span>
            </div>
            <div className="flex justify-between font-bold text-base pt-2">
              <span>Total Cost:</span>
              <span className="text-primary">{stats.fuelCost.toFixed(2)} {routeSettings.currency}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {waypoints.length === 0 && (
        <Card>
          <CardContent className="pt-6 pb-6 text-center text-muted-foreground">
            <p className="text-sm">Add waypoints to see route statistics</p>
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
