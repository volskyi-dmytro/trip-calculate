import { useState, useCallback, useEffect } from 'react'
import { MapContainer } from './MapContainer'
import { RoutePanel } from './RoutePanel'
import { StatsPanel } from './StatsPanel'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MapPin, Navigation, Save, Upload, Trash2, FolderOpen, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { routeService, type Route } from '../services/routeService'
import '../styles/route-planner.css'

export interface Waypoint {
  id: string
  lat: number
  lng: number
  name: string
}

export interface RouteSettings {
  fuelConsumption: number
  fuelCostPerLiter: number
  currency: string
}

export function RoutePlanner() {
  const [waypoints, setWaypoints] = useState<Waypoint[]>([])
  const [routeSettings, setRouteSettings] = useState<RouteSettings>({
    fuelConsumption: 7,
    fuelCostPerLiter: 51.99,
    currency: 'UAH'
  })
  const [savedRoutes, setSavedRoutes] = useState<Route[]>([])
  const [loadingRoutes, setLoadingRoutes] = useState(false)
  const [savingRoute, setSavingRoute] = useState(false)
  const [routeName, setRouteName] = useState('')
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showLoadDialog, setShowLoadDialog] = useState(false)

  // Load user's routes on mount
  useEffect(() => {
    loadSavedRoutes()
  }, [])

  const loadSavedRoutes = async () => {
    setLoadingRoutes(true)
    try {
      const routes = await routeService.getUserRoutes()
      setSavedRoutes(routes)
    } catch (error) {
      console.error('Failed to load routes:', error)
      toast.error('Failed to load saved routes')
    } finally {
      setLoadingRoutes(false)
    }
  }

  const addWaypoint = useCallback((lat: number, lng: number) => {
    const newWaypoint: Waypoint = {
      id: Date.now().toString(),
      lat,
      lng,
      name: `Waypoint ${waypoints.length + 1}`
    }
    setWaypoints(prev => [...prev, newWaypoint])
    toast.success(`Added ${newWaypoint.name}`)
  }, [waypoints.length])

  const updateWaypoint = useCallback((id: string, lat: number, lng: number) => {
    setWaypoints(prev => 
      prev.map(wp => wp.id === id ? { ...wp, lat, lng } : wp)
    )
  }, [])

  const updateWaypointName = useCallback((id: string, name: string) => {
    setWaypoints(prev => 
      prev.map(wp => wp.id === id ? { ...wp, name } : wp)
    )
  }, [])

  const removeWaypoint = useCallback((id: string) => {
    setWaypoints(prev => prev.filter(wp => wp.id !== id))
    toast.success('Waypoint removed')
  }, [])

  const clearRoute = useCallback(() => {
    setWaypoints([])
    setRouteName('')
    toast.success('Route cleared')
  }, [])

  const saveRouteToServer = useCallback(async () => {
    if (waypoints.length < 2) {
      toast.error('Please add at least 2 waypoints')
      return
    }

    if (!routeName.trim()) {
      toast.error('Please enter a route name')
      return
    }

    setSavingRoute(true)
    try {
      const routeData: Route = {
        name: routeName,
        fuelConsumption: routeSettings.fuelConsumption,
        fuelCostPerLiter: routeSettings.fuelCostPerLiter,
        currency: routeSettings.currency,
        waypoints: waypoints.map((wp, index) => ({
          positionOrder: index,
          name: wp.name,
          latitude: wp.lat,
          longitude: wp.lng
        }))
      }

      await routeService.createRoute(routeData)
      toast.success('Route saved successfully!')
      setShowSaveDialog(false)
      setRouteName('')
      await loadSavedRoutes()
    } catch (error) {
      console.error('Failed to save route:', error)
      toast.error('Failed to save route')
    } finally {
      setSavingRoute(false)
    }
  }, [waypoints, routeSettings, routeName])

  const loadRouteFromServer = useCallback(async (routeId: number) => {
    try {
      const route = await routeService.getRoute(routeId)
      
      // Convert backend waypoints to frontend format
      const loadedWaypoints: Waypoint[] = route.waypoints.map(wp => ({
        id: Date.now().toString() + Math.random(),
        lat: wp.latitude,
        lng: wp.longitude,
        name: wp.name
      }))

      setWaypoints(loadedWaypoints)
      setRouteSettings({
        fuelConsumption: route.fuelConsumption,
        fuelCostPerLiter: route.fuelCostPerLiter,
        currency: route.currency
      })
      setRouteName(route.name)
      setShowLoadDialog(false)
      toast.success(`Loaded route: ${route.name}`)
    } catch (error) {
      console.error('Failed to load route:', error)
      toast.error('Failed to load route')
    }
  }, [])

  const deleteRouteFromServer = useCallback(async (routeId: number) => {
    if (!confirm('Are you sure you want to delete this route?')) {
      return
    }

    try {
      await routeService.deleteRoute(routeId)
      toast.success('Route deleted')
      await loadSavedRoutes()
    } catch (error) {
      console.error('Failed to delete route:', error)
      toast.error('Failed to delete route')
    }
  }, [])

  const exportRouteAsJSON = useCallback(() => {
    const routeData = {
      name: routeName || `Route ${new Date().toLocaleDateString()}`,
      waypoints,
      settings: routeSettings,
      exportedAt: new Date().toISOString()
    }
    
    const blob = new Blob([JSON.stringify(routeData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `route-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    
    toast.success('Route exported!')
  }, [waypoints, routeSettings, routeName])

  return (
    <div className="route-planner-container">
      {/* Header */}
      <header className="route-planner-header">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Navigation className="h-6 w-6 text-blue-500" />
            <h1 className="text-2xl font-bold">Trip Route Planner</h1>
            {routeName && <span className="text-sm ml-4 opacity-60">({routeName})</span>}
          </div>
          <div className="flex items-center gap-2">
            {/* Load Route Dialog */}
            <Dialog open={showLoadDialog} onOpenChange={setShowLoadDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Load Route
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Load Saved Route</DialogTitle>
                </DialogHeader>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {loadingRoutes ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : savedRoutes.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      No saved routes yet
                    </p>
                  ) : (
                    savedRoutes.map(route => (
                      <Card key={route.id} className="p-4 hover:bg-accent/50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold">{route.name}</h3>
                            <p className="text-sm text-muted-foreground">
                              {route.waypoints.length} waypoints • {route.totalDistance?.toFixed(2)} km
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(route.updatedAt!).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              onClick={() => loadRouteFromServer(route.id!)}
                            >
                              Load
                            </Button>
                            <Button 
                              size="sm" 
                              variant="destructive"
                              onClick={() => deleteRouteFromServer(route.id!)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))
                  )}
                </div>
              </DialogContent>
            </Dialog>

            {/* Save Route Dialog */}
            <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={waypoints.length === 0}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Route
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Save Route</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="route-name">Route Name</Label>
                    <Input
                      id="route-name"
                      placeholder="Enter route name..."
                      value={routeName}
                      onChange={(e) => setRouteName(e.target.value)}
                    />
                  </div>
                  <Button 
                    onClick={saveRouteToServer} 
                    disabled={savingRoute}
                    className="w-full"
                  >
                    {savingRoute ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save to Cloud'
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Button variant="outline" size="sm" onClick={exportRouteAsJSON} disabled={waypoints.length === 0}>
              <Upload className="h-4 w-4 mr-2" />
              Export JSON
            </Button>
            <Button variant="destructive" size="sm" onClick={clearRoute} disabled={waypoints.length === 0}>
              <Trash2 className="h-4 w-4 mr-2" />
              Clear
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="route-planner-content">
        {/* Left Panel - Route Details */}
        <div className="route-panel">
          <RoutePanel
            waypoints={waypoints}
            routeSettings={routeSettings}
            onUpdateWaypointName={updateWaypointName}
            onRemoveWaypoint={removeWaypoint}
            onUpdateSettings={setRouteSettings}
          />
        </div>

        {/* Map */}
        <div className="map-wrapper">
          <MapContainer
            waypoints={waypoints}
            onAddWaypoint={addWaypoint}
            onUpdateWaypoint={updateWaypoint}
          />

          {/* Instructions overlay */}
          {waypoints.length === 0 && (
            <div className="map-instructions-overlay">
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4" />
                <span>Click on the map to add waypoints</span>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Statistics */}
        <div className="stats-panel">
          <StatsPanel waypoints={waypoints} routeSettings={routeSettings} />
        </div>
      </div>
    </div>
  )
}
