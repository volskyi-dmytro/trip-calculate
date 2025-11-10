import type { Waypoint, RouteSettings } from './RoutePlanner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { MapPin, Trash2, GripVertical, Plus } from 'lucide-react'

interface RoutePanelProps {
  waypoints: Waypoint[]
  routeSettings: RouteSettings
  onUpdateWaypointName: (id: string, name: string) => void
  onRemoveWaypoint: (id: string) => void
  onUpdateSettings: (settings: RouteSettings) => void
  onAddManually?: () => void
}

export function RoutePanel({
  waypoints,
  routeSettings,
  onUpdateWaypointName,
  onRemoveWaypoint,
  onUpdateSettings,
  onAddManually,
}: RoutePanelProps) {
  return (
    <div className="p-4 space-y-4">
      {/* Route Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Route Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fuel-consumption">Fuel Consumption (L/100km)</Label>
            <Input
              id="fuel-consumption"
              type="number"
              step="0.1"
              value={routeSettings.fuelConsumption}
              onChange={(e) => onUpdateSettings({
                ...routeSettings,
                fuelConsumption: parseFloat(e.target.value) || 0
              })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fuel-cost">Fuel Cost (per liter)</Label>
            <Input
              id="fuel-cost"
              type="number"
              step="0.01"
              value={routeSettings.fuelCostPerLiter}
              onChange={(e) => onUpdateSettings({
                ...routeSettings,
                fuelCostPerLiter: parseFloat(e.target.value) || 0
              })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="currency">Currency</Label>
            <Input
              id="currency"
              value={routeSettings.currency}
              onChange={(e) => onUpdateSettings({
                ...routeSettings,
                currency: e.target.value
              })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Waypoints List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Waypoints ({waypoints.length})</span>
            {onAddManually && (
              <Button
                size="sm"
                variant="outline"
                onClick={onAddManually}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Manually
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {waypoints.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No waypoints yet</p>
              <p className="text-xs mt-1">Click on the map to add waypoints</p>
            </div>
          ) : (
            <div className="space-y-2">
              {waypoints.map((waypoint, index) => (
                <div key={waypoint.id}>
                  <div className="flex items-center gap-2 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-2 flex-1">
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                        {index + 1}
                      </div>
                      <Input
                        value={waypoint.name}
                        onChange={(e) => onUpdateWaypointName(waypoint.id, e.target.value)}
                        className="h-8"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onRemoveWaypoint(waypoint.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground px-3 py-1">
                    {waypoint.lat.toFixed(5)}, {waypoint.lng.toFixed(5)}
                  </div>
                  {index < waypoints.length - 1 && (
                    <Separator className="my-2" />
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
