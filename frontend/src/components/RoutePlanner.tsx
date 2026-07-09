import { useState, useCallback, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { MapContainer } from './MapContainer'
import { WelcomeScreen } from './WelcomeScreen'
// TopChatBar is replaced by inline AI input in the sidebar
import { StatsPanel } from './StatsPanel'
import { RoutePanel } from './RoutePanel'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MapPin, Save, Upload, Trash2, FolderOpen, Loader2, Edit, FilePlus, Send, Search, ChevronUp, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { routeService, type Route } from '../services/routeService'
import { geocodingService } from '../services/geocodingService'
import { routingService } from '../services/routingService'
import { parseRouteWithAgent } from '../services/agentService'
import { getFuelSuggestion, applyLiveFuelPrice, type FuelSuggestion } from '../services/fuelPriceService'
import { useLanguage } from '../contexts/LanguageContext'
import { getTranslation, type Language } from '../i18n/routePlanner'
import type { ChatMessage } from '../types'
import '../styles/route-planner.css'

export interface Waypoint {
  id: string
  lat: number
  lng: number
  name: string
  countryCode?: string
}

export interface RouteSettings {
  fuelConsumption: number
  fuelCostPerLiter: number
  currency: string
  passengerCount: number
  fuelType: 'petrol' | 'diesel' | 'lpg'
  // True once the user manually edits the fuel price — live/AI suggestions
  // must never overwrite a touched value
  fuelPriceTouched: boolean
}

const DEFAULT_ROUTE_SETTINGS: RouteSettings = {
  fuelConsumption: 9.2,
  fuelCostPerLiter: 55,
  currency: 'UAH',
  passengerCount: 1,
  fuelType: 'petrol',
  fuelPriceTouched: false,
}

export function RoutePlanner() {
  const { language } = useLanguage()
  const languageRef = useRef(language)
  const t = getTranslation(language as Language)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const [waypoints, setWaypoints] = useState<Waypoint[]>([])
  const [routeSettings, setRouteSettings] = useState<RouteSettings>(() => {
    const saved = localStorage.getItem('tripCalculate_routeSettings')
    if (!saved) return DEFAULT_ROUTE_SETTINGS
    try { return { ...DEFAULT_ROUTE_SETTINGS, ...JSON.parse(saved) } }
    catch { return DEFAULT_ROUTE_SETTINGS }
  })
  const [fuelSuggestion, setFuelSuggestion] = useState<FuelSuggestion | null>(null)
  // Latest-wins sequence guard for the debounced fuel suggestion fetch below
  const fuelFetchSeq = useRef(0)
  const [savedRoutes, setSavedRoutes] = useState<Route[]>([])
  const [loadingRoutes, setLoadingRoutes] = useState(false)
  const [savingRoute, setSavingRoute] = useState(false)
  const [routeName, setRouteName] = useState('')
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showLoadDialog, setShowLoadDialog] = useState(false)
  const [routeGeometry, setRouteGeometry] = useState<Array<[number, number]>>([])
  const [routeDistance, setRouteDistance] = useState<number>(0) // in km from OSRM
  const [routeDuration, setRouteDuration] = useState<number>(0) // in minutes from OSRM
  const [isGeocoding, setIsGeocoding] = useState(false)
  const [showManualInputDialog, setShowManualInputDialog] = useState(false)
  const [manualAddress, setManualAddress] = useState('')
  const [isSearching, setIsSearching] = useState(false)

  // Search input state for start/destination fields
  const [startLocationInput, setStartLocationInput] = useState('')
  const [destinationInput, setDestinationInput] = useState('')
  const [isSearchingStart, setIsSearchingStart] = useState(false)
  const [isSearchingDestination, setIsSearchingDestination] = useState(false)

  // Edit mode state
  const [currentRouteId, setCurrentRouteId] = useState<number | null>(null)
  const [isEditMode, setIsEditMode] = useState(false)

  // AI Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isProcessingAi, setIsProcessingAi] = useState(false)
  const [pendingSuggestions, setPendingSuggestions] = useState<string[] | null>(null)
  const [isApplyingSuggestions, setIsApplyingSuggestions] = useState(false)

  // View mode: welcome screen vs dashboard
  const [showWelcomeScreen, setShowWelcomeScreen] = useState(true)
  const [manualMode, setManualMode] = useState(false)

  // Map visibility state (Issue #1 fix: Collapsible map)
  const [isMapVisible, setIsMapVisible] = useState<boolean>(() => {
    const saved = localStorage.getItem('tripCalculate_mapVisible')
    if (!saved) return false
    try { return JSON.parse(saved) } catch { return false }
  })

  // Route calculation state
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false)

  // Mobile bottom sheet state
  const [isMobileExpanded, setIsMobileExpanded] = useState(false)
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)

  // Load user's routes on mount
  useEffect(() => {
    loadSavedRoutes()
  }, [])

  // Persist waypoints to localStorage
  useEffect(() => {
    if (waypoints.length > 0) {
      localStorage.setItem('tripCalculate_currentRoute', JSON.stringify(waypoints))
    } else {
      localStorage.removeItem('tripCalculate_currentRoute')
    }
  }, [waypoints])

  // Persist route settings to localStorage
  useEffect(() => {
    localStorage.setItem('tripCalculate_routeSettings', JSON.stringify(routeSettings))
  }, [routeSettings])

  // Persist map visibility to localStorage
  useEffect(() => {
    localStorage.setItem('tripCalculate_mapVisible', JSON.stringify(isMapVisible))
  }, [isMapVisible])

  // Sync search inputs with waypoints
  useEffect(() => {
    if (waypoints.length > 0) {
      setStartLocationInput(waypoints[0].name)
    } else {
      setStartLocationInput('')
    }

    if (waypoints.length > 1) {
      setDestinationInput(waypoints[waypoints.length - 1].name)
    } else {
      setDestinationInput('')
    }
  }, [waypoints])

  // Sync languageRef when language changes
  useEffect(() => {
    languageRef.current = language
  }, [language])

  // Initialize welcome message
  useEffect(() => {
    const welcomeMessage = language === 'uk'
      ? 'Привіт! Я можу допомогти вам спланувати маршрут. Просто опишіть вашу подорож, наприклад: "Поїздка з Києва до Львова на двох пасажирів".'
      : 'Hello! I can help you plan your route. Just describe your trip, for example: "Trip from Kyiv to Lviv for 2 passengers".';

    setChatMessages([{
      id: 'init',
      role: 'assistant',
      content: welcomeMessage,
      timestamp: Date.now()
    }]);
  }, [language])

  // Check for routeId in URL parameters and load route for editing
  useEffect(() => {
    const routeId = searchParams.get('routeId')
    if (routeId) {
      const id = parseInt(routeId, 10)
      if (!isNaN(id)) {
        loadRouteFromServer(id)
        setCurrentRouteId(id)
        setIsEditMode(true)
        // Exit welcome screen when loading a route
        setShowWelcomeScreen(false)
      }
    }
  }, [searchParams])

  // Track mobile viewport
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (!mobile) {
        setIsMobileExpanded(false)
      }
      // Close any open dialogs to prevent flash when viewport crosses breakpoint
      setShowLoadDialog(false)
      setShowSaveDialog(false)
    }
    window.addEventListener('resize', handleResize)
    window.addEventListener('orientationchange', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleResize)
    }
  }, [])

  // Calculate road-based route whenever waypoints change
  useEffect(() => {
    const updateRoute = async () => {
      console.log('🟢 [PLANNER] Waypoints changed, count:', waypoints.length);

      if (waypoints.length < 2) {
        console.log('🟢 [PLANNER] Less than 2 waypoints, clearing route');
        setRouteGeometry([])
        setRouteDistance(0)
        setRouteDuration(0)
        setIsCalculatingRoute(false)
        return
      }

      console.log('🟢 [PLANNER] Calling calculateRoute...');
      console.log('🟢 [PLANNER] Waypoints:', waypoints.map(w => ({ id: w.id, name: w.name, lat: w.lat, lng: w.lng })));

      setIsCalculatingRoute(true)

      try {
        const route = await routingService.getRoute(waypoints)

        console.log('🟢 [PLANNER] Received route result:', {
          totalDistance: route.totalDistance,
          totalDuration: route.totalDuration,
          geometryPoints: route.geometry.length,
          hasGeometry: route.geometry.length > 0
        });
        console.log('🟢 [PLANNER] First 5 geometry points:', route.geometry.slice(0, 5));

        setRouteGeometry(route.geometry)
        setRouteDistance(route.totalDistance)
        setRouteDuration(route.totalDuration)

        console.log('🟢 [PLANNER] State updated with route geometry');

        // Log routing success/failure for debugging
        if (route.totalDistance > 0) {
          console.log('✅ [PLANNER] Road-based route calculated:', route.totalDistance.toFixed(2), 'km');
          console.log('✅ [PLANNER] Route geometry has', route.geometry.length, 'points');
        } else {
          console.warn('⚠️ [PLANNER] Using straight-line fallback (routing failed)');
          console.warn('⚠️ [PLANNER] Geometry:', route.geometry);
          // Notify user that routing service failed
          toast.warning(
            languageRef.current === 'uk' ? 'Маршрутизація недоступна' : 'Routing unavailable',
            {
              description: languageRef.current === 'uk'
                ? 'Не вдалося розрахувати маршрут по дорогам. Показано прямі лінії.'
                : 'Could not calculate road-based route. Showing straight lines.',
              duration: 5000
            }
          )
        }

        setIsCalculatingRoute(false)
      } catch (error) {
        console.error('❌ [PLANNER] Failed to calculate route:', error);
        // Fallback to straight lines
        const fallbackGeometry = waypoints.map(w => [w.lat, w.lng] as [number, number]);
        console.error('❌ [PLANNER] Using fallback geometry:', fallbackGeometry);
        setRouteGeometry(fallbackGeometry)
        setRouteDistance(0)
        setRouteDuration(0)
        setIsCalculatingRoute(false)
        toast.error(
          languageRef.current === 'uk' ? 'Помилка маршрутизації' : 'Routing error',
          {
            description: languageRef.current === 'uk'
              ? 'Виникла помилка при розрахунку маршруту.'
              : 'An error occurred while calculating the route.',
            duration: 5000
          }
        )
      }
    }

    updateRoute()
  }, [waypoints])

  // Live fuel price: advisory fetch whenever the route's shape or the fuel
  // context changes; auto-applies only while the price field is untouched
  useEffect(() => {
    if (waypoints.length < 2) { setFuelSuggestion(null); return }
    // Latest-wins guard: getFuelSuggestion awaits sequential Nominatim
    // reverse lookups and can take seconds, so a newer effect run may start
    // a second fetch before an older one resolves. Without this, the older
    // (stale) response could land last and overwrite state for a route
    // shape that no longer exists.
    const seq = ++fuelFetchSeq.current
    const handle = setTimeout(async () => {
      const suggestion = await getFuelSuggestion(
        waypoints, routeSettings.fuelType, routeSettings.currency)
      if (seq !== fuelFetchSeq.current) return // superseded by a newer route shape
      setFuelSuggestion(suggestion)
      if (suggestion) {
        setRouteSettings(prev => applyLiveFuelPrice(prev, suggestion) ?? prev)
      }
    }, 1000)
    return () => clearTimeout(handle)
  }, [waypoints, routeSettings.fuelType, routeSettings.currency])

  const loadSavedRoutes = async () => {
    setLoadingRoutes(true)
    try {
      const routes = await routeService.getUserRoutes()
      setSavedRoutes(routes)
    } catch (error) {
      console.error('Failed to load routes:', error)
      toast.error(t.toasts.routesLoadFailed)
    } finally {
      setLoadingRoutes(false)
    }
  }

  const addWaypoint = useCallback(async (lat: number, lng: number) => {
    if (isGeocoding) {
      toast.error(t.toasts.waitForLocation)
      return
    }

    setIsGeocoding(true)

    try {
      // Get location name via reverse geocoding
      const locationName = await geocodingService.reverseGeocode(lat, lng)

      const newWaypoint: Waypoint = {
        id: Date.now().toString(),
        lat,
        lng,
        name: locationName
      }

      setWaypoints(prev => [...prev, newWaypoint])
      toast.success(`${t.toasts.locationAdded} ${locationName}`)
    } catch (error) {
      console.error('Failed to add waypoint:', error)
      toast.error(t.toasts.locationFailed)
    } finally {
      setIsGeocoding(false)
    }
  }, [isGeocoding, t])

  const updateWaypoint = useCallback(async (id: string, lat: number, lng: number) => {
    // Update position immediately
    setWaypoints(prev =>
      prev.map(wp => wp.id === id ? { ...wp, lat, lng } : wp)
    )

    // Fetch new address via reverse geocoding
    try {
      const locationName = await geocodingService.reverseGeocode(lat, lng)
      setWaypoints(prev =>
        prev.map(wp => wp.id === id ? { ...wp, name: locationName } : wp)
      )
    } catch (error) {
      console.error('Failed to reverse geocode on drag:', error)
      // Keep the old name if reverse geocoding fails
    }
  }, [])

  const removeWaypoint = useCallback((id: string) => {
    if (waypoints.length <= 2) {
      toast.error(
        language === 'uk'
          ? 'Потрібно мінімум 2 точки для маршруту'
          : 'Minimum 2 waypoints required'
      )
      return
    }
    setWaypoints(prev => prev.filter(wp => wp.id !== id))
    toast.success(t.toasts.waypointRemoved)
  }, [waypoints.length, t, language])

  const reorderWaypoints = useCallback((reorderedWaypoints: Waypoint[]) => {
    setWaypoints(reorderedWaypoints)
  }, [])

  const updateWaypointName = useCallback((id: string, name: string) => {
    setWaypoints(prev =>
      prev.map(wp => wp.id === id ? { ...wp, name } : wp)
    )
  }, [])

  const updateRouteSettings = useCallback((settings: RouteSettings) => {
    setRouteSettings(settings)
  }, [])

  const handleApplyFuelSuggestion = useCallback(() => {
    if (!fuelSuggestion) return
    setRouteSettings(prev => ({ ...prev, fuelCostPerLiter: fuelSuggestion.price, fuelPriceTouched: false }))
  }, [fuelSuggestion])

  const clearRoute = useCallback(() => {
    setWaypoints([])
    setRouteName('')
    setCurrentRouteId(null)
    setIsEditMode(false)
    localStorage.removeItem('tripCalculate_currentRoute')
    navigate('/route-planner', { replace: true })
    toast.success(t.toasts.routeCleared)
  }, [t, navigate])

  const createNewRoute = useCallback(() => {
    setWaypoints([])
    setRouteName('')
    setCurrentRouteId(null)
    setIsEditMode(false)
    navigate('/route-planner', { replace: true })
    toast.success('Ready to create new route')
  }, [navigate])

  const saveRouteToServer = useCallback(async (saveAsNew = false) => {
    if (waypoints.length < 2) {
      toast.error(t.toasts.minWaypoints)
      return
    }

    if (!routeName.trim()) {
      toast.error(t.toasts.enterRouteName)
      return
    }

    setSavingRoute(true)
    try {
      const routeData: Route = {
        name: routeName,
        fuelConsumption: routeSettings.fuelConsumption,
        fuelCostPerLiter: routeSettings.fuelCostPerLiter,
        currency: routeSettings.currency,
        passengerCount: routeSettings.passengerCount,
        waypoints: waypoints.map((wp, index) => ({
          positionOrder: index,
          name: wp.name,
          latitude: wp.lat,
          longitude: wp.lng
        }))
      }

      if (isEditMode && currentRouteId && !saveAsNew) {
        // Update existing route
        await routeService.updateRoute(currentRouteId, routeData)
        toast.success('Route updated successfully!')
      } else {
        // Create new route
        const newRoute = await routeService.createRoute(routeData)
        toast.success(t.toasts.routeSaved)

        // If saving as new from edit mode, switch to editing the new route
        if (saveAsNew && isEditMode) {
          setCurrentRouteId(newRoute.id!)
          navigate(`/route-planner?routeId=${newRoute.id}`, { replace: true })
        }
      }

      setShowSaveDialog(false)
      await loadSavedRoutes()
    } catch (error) {
      console.error('Failed to save route:', error)
      toast.error(t.toasts.routeSaveFailed)
    } finally {
      setSavingRoute(false)
    }
  }, [waypoints, routeSettings, routeName, t, isEditMode, currentRouteId, navigate])

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
        ...DEFAULT_ROUTE_SETTINGS,
        fuelConsumption: route.fuelConsumption,
        fuelCostPerLiter: route.fuelCostPerLiter,
        currency: route.currency,
        passengerCount: route.passengerCount || 1,
        // A persisted price is a user-chosen price: mark it touched so the
        // live fuel suggestion effect (see applyLiveFuelPrice guard) never
        // silently overwrites it once the new waypoints trigger a refetch.
        fuelPriceTouched: true
      })
      setRouteName(route.name)
      setShowLoadDialog(false)
      setShowWelcomeScreen(false) // Exit welcome screen when loading a route

      // Issue #3 fix: Automatically show map when loading a route
      setIsMapVisible(true)

      toast.success(`${t.toasts.routeLoaded} ${route.name}`)
    } catch (error) {
      console.error('Failed to load route:', error)
      toast.error(t.toasts.routeLoadFailed)
    }
  }, [t])

  const deleteRouteFromServer = useCallback(async (routeId: number) => {
    if (!confirm(t.dialogs.load.deleteConfirm)) {
      return
    }

    try {
      await routeService.deleteRoute(routeId)
      toast.success(t.toasts.routeDeleted)
      await loadSavedRoutes()
    } catch (error) {
      console.error('Failed to delete route:', error)
      toast.error(t.toasts.routeDeleteFailed)
    }
  }, [t])

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

    toast.success(t.toasts.routeExported)
  }, [waypoints, routeSettings, routeName, t])

  const handleManualAddressSubmit = useCallback(async () => {
    if (!manualAddress.trim()) {
      toast.error(t.toasts.enterAddress)
      return
    }

    setIsSearching(true)

    try {
      toast.loading(t.toasts.searchingLocation)

      const result = await geocodingService.forwardGeocode(manualAddress)

      toast.dismiss()

      if (!result) {
        toast.error(t.toasts.locationNotFound)
        return
      }

      // Get proper location name via reverse geocoding
      const locationName = await geocodingService.reverseGeocode(result.lat, result.lng)

      // Add waypoint
      const newWaypoint: Waypoint = {
        id: Date.now().toString(),
        lat: result.lat,
        lng: result.lng,
        name: locationName
      }

      setWaypoints(prev => [...prev, newWaypoint])

      toast.success(`${t.toasts.manualAddSuccess} ${locationName}`)

      // Close dialog and reset
      setShowManualInputDialog(false)
      setManualAddress('')
    } catch (error) {
      toast.dismiss()
      console.error('Manual address error:', error)
      toast.error(t.toasts.manualAddFailed)
    } finally {
      setIsSearching(false)
    }
  }, [manualAddress, t])

  // Handle start location search
  const handleStartLocationSearch = useCallback(async () => {
    if (!startLocationInput.trim()) {
      toast.error(t.toasts.enterAddress)
      return
    }

    setIsSearchingStart(true)

    try {
      const result = await geocodingService.forwardGeocode(startLocationInput)

      if (!result) {
        toast.error(t.toasts.locationNotFound)
        setIsSearchingStart(false)
        return
      }

      // Get proper location name via reverse geocoding
      const locationName = await geocodingService.reverseGeocode(result.lat, result.lng)

      // Update or add start waypoint
      if (waypoints.length > 0) {
        // Update existing start waypoint
        setWaypoints(prev => [
          { ...prev[0], lat: result.lat, lng: result.lng, name: locationName },
          ...prev.slice(1)
        ])
      } else {
        // Add new start waypoint
        const newWaypoint: Waypoint = {
          id: Date.now().toString(),
          lat: result.lat,
          lng: result.lng,
          name: locationName
        }
        setWaypoints([newWaypoint])
      }

      setStartLocationInput(locationName)
      toast.success(`${t.toasts.locationAdded} ${locationName}`)
    } catch (error) {
      console.error('Start location search error:', error)
      toast.error(t.toasts.locationFailed)
    } finally {
      setIsSearchingStart(false)
    }
  }, [startLocationInput, waypoints, t])

  // Handle destination search
  const handleDestinationSearch = useCallback(async () => {
    if (!destinationInput.trim()) {
      toast.error(t.toasts.enterAddress)
      return
    }

    setIsSearchingDestination(true)

    try {
      const result = await geocodingService.forwardGeocode(destinationInput)

      if (!result) {
        toast.error(t.toasts.locationNotFound)
        setIsSearchingDestination(false)
        return
      }

      // Get proper location name via reverse geocoding
      const locationName = await geocodingService.reverseGeocode(result.lat, result.lng)

      // Update or add destination waypoint
      if (waypoints.length > 1) {
        // Update existing destination waypoint
        setWaypoints(prev => [
          ...prev.slice(0, -1),
          { ...prev[prev.length - 1], lat: result.lat, lng: result.lng, name: locationName }
        ])
      } else if (waypoints.length === 1) {
        // Add destination waypoint
        const newWaypoint: Waypoint = {
          id: Date.now().toString(),
          lat: result.lat,
          lng: result.lng,
          name: locationName
        }
        setWaypoints(prev => [...prev, newWaypoint])
      } else {
        // No waypoints exist, can't add destination without start
        toast.error(language === 'uk' ? 'Спочатку додайте початкову локацію' : 'Add start location first')
        setIsSearchingDestination(false)
        return
      }

      setDestinationInput(locationName)
      toast.success(`${t.toasts.locationAdded} ${locationName}`)
    } catch (error) {
      console.error('Destination search error:', error)
      toast.error(t.toasts.locationFailed)
    } finally {
      setIsSearchingDestination(false)
    }
  }, [destinationInput, waypoints, t, language])

  // Geocode both start and destination atomically, then trigger auto-calculation via waypoints update
  const handleCalculateRoute = useCallback(async () => {
    if (!startLocationInput.trim() || !destinationInput.trim()) return

    setIsSearchingStart(true)
    setIsSearchingDestination(true)

    try {
      const [startResult, destResult] = await Promise.all([
        geocodingService.forwardGeocode(startLocationInput),
        geocodingService.forwardGeocode(destinationInput)
      ])

      if (!startResult) {
        toast.error(t.toasts.locationNotFound)
        return
      }
      if (!destResult) {
        toast.error(t.toasts.locationNotFound)
        return
      }

      const [startName, destName] = await Promise.all([
        geocodingService.reverseGeocode(startResult.lat, startResult.lng),
        geocodingService.reverseGeocode(destResult.lat, destResult.lng)
      ])

      const startWaypoint: Waypoint = {
        id: Date.now().toString() + '-start',
        lat: startResult.lat,
        lng: startResult.lng,
        name: startName
      }
      const destWaypoint: Waypoint = {
        id: Date.now().toString() + '-dest',
        lat: destResult.lat,
        lng: destResult.lng,
        name: destName
      }

      const middleWaypoints = waypoints.length > 2 ? waypoints.slice(1, -1) : []
      setWaypoints([startWaypoint, ...middleWaypoints, destWaypoint])
      setStartLocationInput(startName)
      setDestinationInput(destName)
    } catch (error) {
      console.error('Calculate route error:', error)
      toast.error(t.toasts.locationFailed)
    } finally {
      setIsSearchingStart(false)
      setIsSearchingDestination(false)
    }
  }, [startLocationInput, destinationInput, waypoints, t])

  // AI Chat Handler
  const handleSendChat = useCallback(async () => {
    if (!chatInput.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: chatInput,
      timestamp: Date.now()
    };

    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsProcessingAi(true);

    // Transition to dashboard after first user message
    if (showWelcomeScreen) {
      setShowWelcomeScreen(false);
      setManualMode(false); // Exit manual mode when AI is used
    }

    try {
      // Send the route already on the map so the agent can apply
      // modifications ("add a stop in X") instead of only building
      // routes from scratch
      const currentRoute = waypoints.map(wp => ({
        name: wp.name,
        latitude: wp.lat,
        longitude: wp.lng,
      }));
      const agentResult = await parseRouteWithAgent(userMsg.content, language, currentRoute,
        { fuel_type: routeSettings.fuelType, currency: routeSettings.currency });
      const agentData = agentResult.data;

      if (agentData) {
        const updates: string[] = [];

        // Update fuel consumption
        if (agentData.consumption) {
          setRouteSettings(prev => ({ ...prev, fuelConsumption: agentData.consumption! }));
          updates.push(`${t.routeSettings.fuelConsumption}: ${agentData.consumption}`);
        }

        // Update fuel cost
        if (agentData.price) {
          setRouteSettings(prev => ({ ...prev, fuelCostPerLiter: agentData.price! }));
          updates.push(`${t.routeSettings.fuelCost}: ${agentData.price}`);
        }

        // Update currency
        if (agentData.currency) {
          setRouteSettings(prev => ({ ...prev, currency: agentData.currency! }));
        }

        // Update passenger count
        if (agentData.passengers) {
          setRouteSettings(prev => ({ ...prev, passengerCount: agentData.passengers! }));
          updates.push(`${language === 'uk' ? 'Пасажири' : 'Passengers'}: ${agentData.passengers}`);
        }

        // Live fuel price advisory from the agent's fuel tool — routed
        // through the same guard as the debounced effect, so a touched
        // price is NEVER overwritten
        if (agentData.fuelData) {
          setFuelSuggestion(agentData.fuelData);
          setRouteSettings(prev => applyLiveFuelPrice(prev, agentData.fuelData!) ?? prev);
        }

        // Add waypoints from agent data
        const newWaypoints: Waypoint[] = [];

        // Origin
        if (agentData.originLocation) {
          newWaypoints.push({
            id: Date.now().toString() + '-origin',
            lat: agentData.originLocation.lat,
            lng: agentData.originLocation.lon,
            name: agentData.originLocation.display_name
          });
          updates.push(`Start: ${agentData.originLocation.display_name.split(',')[0]}`);
        } else if (agentData.originName) {
          const locs = await geocodingService.forwardGeocode(agentData.originName);
          if (locs) {
            const locationName = await geocodingService.reverseGeocode(locs.lat, locs.lng);
            newWaypoints.push({
              id: Date.now().toString() + '-origin',
              lat: locs.lat,
              lng: locs.lng,
              name: locationName
            });
            updates.push(`Start: ${locationName.split(',')[0]}`);
          }
        }

        // Intermediate waypoints
        if (agentData.waypoints && agentData.waypoints.length > 0) {
          for (const wp of agentData.waypoints) {
            newWaypoints.push({
              id: Date.now().toString() + '-wp-' + Math.random(),
              lat: wp.lat,
              lng: wp.lon,
              name: wp.display_name
            });
          }
          updates.push(`+${agentData.waypoints.length} stop(s)`);
        }

        // Destination
        if (agentData.destinationLocation) {
          newWaypoints.push({
            id: Date.now().toString() + '-dest',
            lat: agentData.destinationLocation.lat,
            lng: agentData.destinationLocation.lon,
            name: agentData.destinationLocation.display_name
          });
          updates.push(`Destination: ${agentData.destinationLocation.display_name.split(',')[0]}`);
        } else if (agentData.destinationName) {
          const locs = await geocodingService.forwardGeocode(agentData.destinationName);
          if (locs) {
            const locationName = await geocodingService.reverseGeocode(locs.lat, locs.lng);
            newWaypoints.push({
              id: Date.now().toString() + '-dest',
              lat: locs.lat,
              lng: locs.lng,
              name: locationName
            });
            updates.push(`Destination: ${locationName.split(',')[0]}`);
          }
        }

        if (newWaypoints.length > 0) {
          setWaypoints(newWaypoints);
        }

        // Tell the user about locations the agent could not geocode
        const skippedNames = agentData.skippedLocations?.map(s => s.name) ?? [];
        const skippedNote = skippedNames.length > 0
          ? (language === 'uk'
              ? ` Не вдалося знайти: ${skippedNames.join(', ')}.`
              : ` Could not find: ${skippedNames.join(', ')}.`)
          : '';

        const responseMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: updates.length > 0
            ? `✓ Updated: ${updates.join(', ')}.${skippedNote}`
            : 'No changes made. Please provide more details.',
          timestamp: Date.now()
        };
        setChatMessages(prev => [...prev, responseMsg]);

        // Success toast notification
        if (updates.length > 0) {
          toast.success(
            language === 'uk' ? 'Маршрут оновлено!' : 'Route updated!',
            {
              description: language === 'uk'
                ? 'AI успішно обробив ваш запит'
                : 'AI assistant processed your request successfully',
              duration: 3000
            }
          );
        }
      } else {
        // Prefer the agent's own reason (already localized) over the
        // generic fallback so users learn WHY the request failed
        const reason = agentResult.error || t.chat.aiFailedDescription;

        setChatMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: reason,
          timestamp: Date.now()
        }]);

        // Error toast - no data returned
        toast.error(t.chat.aiFailedTitle, {
          description: reason,
          duration: 5000
        });
      }
    } catch (e) {
      console.error(e);
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';

      setChatMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'An error occurred while processing your request.',
        timestamp: Date.now()
      }]);

      // Error toast - exception occurred
      toast.error(
        language === 'uk' ? 'Помилка обробки' : 'Processing error',
        {
          description: language === 'uk'
            ? `Виникла помилка: ${errorMessage}`
            : `An error occurred: ${errorMessage}`,
          duration: 5000
        }
      );
    } finally {
      setIsProcessingAi(false);
    }
  }, [chatInput, t, showWelcomeScreen, language, waypoints, routeSettings.fuelType, routeSettings.currency]);

  // Apply Suggested Stops
  const handleApplySuggestions = useCallback(async () => {
    if (!pendingSuggestions) return;
    setIsApplyingSuggestions(true);

    try {
      const newWaypoints = [...waypoints];
      const destination = newWaypoints.pop();

      for (const stopName of pendingSuggestions) {
        const result = await geocodingService.forwardGeocode(stopName);
        if (result) {
          const locationName = await geocodingService.reverseGeocode(result.lat, result.lng);
          newWaypoints.push({
            id: Date.now().toString() + '-suggested-' + Math.random(),
            lat: result.lat,
            lng: result.lng,
            name: locationName
          });
        }
      }

      if (destination) {
        newWaypoints.push(destination);
      }

      setWaypoints(newWaypoints);

      setChatMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: `✓ Added ${pendingSuggestions.join(', ')} to your route. Recalculating...`,
        timestamp: Date.now()
      }]);
    } catch (error) {
      console.error("Failed to add stops", error);
    } finally {
      setIsApplyingSuggestions(false);
      setPendingSuggestions(null);
    }
  }, [pendingSuggestions, waypoints]);

  // Helper function to calculate total distance (commented out for now)
  // const calculateTotalDistance = () => {
  //   if (routeGeometry.length < 2) return 0;
  //   let totalDistance = 0;
  //   for (let i = 0; i < routeGeometry.length - 1; i++) {
  //     const [lat1, lng1] = routeGeometry[i];
  //     const [lat2, lng2] = routeGeometry[i + 1];
  //     totalDistance += getDistanceBetweenPoints(lat1, lng1, lat2, lng2);
  //   }
  //   return totalDistance;
  // };

  // const getDistanceBetweenPoints = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  //   const R = 6371e3;
  //   const φ1 = lat1 * Math.PI/180;
  //   const φ2 = lat2 * Math.PI/180;
  //   const Δφ = (lat2-lat1) * Math.PI/180;
  //   const Δλ = (lon2-lon1) * Math.PI/180;

  //   const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
  //             Math.cos(φ1) * Math.cos(φ2) *
  //             Math.sin(Δλ/2) * Math.sin(Δλ/2);
  //   const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  //   return R * c;
  // }

  // Handler for manual configuration mode
  const handleManualClick = useCallback(() => {
    setManualMode(true);
    setShowWelcomeScreen(false);
  }, []);

  // Map visibility state is kept for potential future use / localStorage persistence

  // If in welcome screen mode, show centered chat interface
  if (showWelcomeScreen && !manualMode) {
    return (
      <WelcomeScreen
        chatMessages={chatMessages}
        chatInput={chatInput}
        onChatInputChange={setChatInput}
        onSendMessage={handleSendChat}
        isProcessing={isProcessingAi}
        onManualClick={handleManualClick}
        pendingSuggestions={pendingSuggestions}
        onApplySuggestions={handleApplySuggestions}
        onDismissSuggestions={() => setPendingSuggestions(null)}
        isApplyingSuggestions={isApplyingSuggestions}
      />
    );
  }

  // Dashboard view — map-first Precision Navigation layout
  return (
    <div className="relative flex h-full overflow-hidden">

      {/* ── DESKTOP SIDEBAR — hidden on mobile ── */}
      {!isMobile && (
        <div
          className="glass-sidebar flex-shrink-0 flex flex-col h-full overflow-hidden"
          style={{ width: '360px' }}
        >
          {/* Scrollable content area */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 space-y-5">

              {/* ── Route name + edit mode indicator ── */}
              {(routeName || isEditMode) && (
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                  style={{
                    background: 'var(--nav-bg-input)',
                    border: '1px solid var(--nav-border)',
                    color: 'var(--nav-text-secondary)',
                  }}
                >
                  {isEditMode && (
                    <Edit className="h-3 w-3" style={{ color: 'var(--nav-accent)' }} />
                  )}
                  <span className="truncate">{routeName || (language === 'uk' ? 'Редагування маршруту' : 'Editing route')}</span>
                </div>
              )}

              {/* ── START input ── */}
              <div>
                <Label
                  className="block text-xs font-semibold mb-1.5 uppercase tracking-wider"
                  style={{ color: 'var(--nav-text-secondary)' }}
                >
                  {language === 'uk' ? 'Початок' : 'Start'}
                </Label>
                <div className="relative">
                  <Input
                    type="text"
                    placeholder={language === 'uk' ? 'Шукати початкову локацію...' : 'Search start location...'}
                    value={startLocationInput}
                    onChange={(e) => setStartLocationInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isSearchingStart) {
                        handleStartLocationSearch()
                      }
                    }}
                    disabled={isSearchingStart}
                    className="w-full pr-8"
                    style={{
                      background: 'var(--nav-bg-input)',
                      border: '1px solid var(--nav-border)',
                      color: 'var(--nav-text-primary)',
                    }}
                  />
                  {isSearchingStart && (
                    <Loader2
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin"
                      style={{ color: 'var(--nav-accent)' }}
                    />
                  )}
                </div>
              </div>

              {/* ── Swap button ── */}
              {waypoints.length >= 2 && (
                <div className="flex justify-center">
                  <button
                    onClick={() => {
                      const swapped = [...waypoints]
                      const first = swapped[0]
                      swapped[0] = swapped[swapped.length - 1]
                      swapped[swapped.length - 1] = first
                      reorderWaypoints(swapped)
                    }}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full transition-colors"
                    style={{
                      background: 'var(--nav-bg-input)',
                      border: '1px solid var(--nav-border)',
                      color: 'var(--nav-text-secondary)',
                    }}
                    title={language === 'uk' ? 'Поміняти місцями' : 'Swap start/destination'}
                  >
                    ↕ {language === 'uk' ? 'Поміняти' : 'Swap'}
                  </button>
                </div>
              )}

              {/* ── DESTINATION input ── */}
              <div>
                <Label
                  className="block text-xs font-semibold mb-1.5 uppercase tracking-wider"
                  style={{ color: 'var(--nav-text-secondary)' }}
                >
                  {language === 'uk' ? 'Призначення' : 'Destination'}
                </Label>
                <div className="relative">
                  <Input
                    type="text"
                    placeholder={language === 'uk' ? 'Шукати призначення...' : 'Search destination...'}
                    value={destinationInput}
                    onChange={(e) => setDestinationInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isSearchingDestination) {
                        handleDestinationSearch()
                      }
                    }}
                    disabled={isSearchingDestination}
                    className="w-full pr-8"
                    style={{
                      background: 'var(--nav-bg-input)',
                      border: '1px solid var(--nav-border)',
                      color: 'var(--nav-text-primary)',
                    }}
                  />
                  {isSearchingDestination && (
                    <Loader2
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin"
                      style={{ color: 'var(--nav-accent)' }}
                    />
                  )}
                </div>
              </div>

              {/* ── Calculate Route button ── */}
              {(() => {
                const isBusy = isSearchingStart || isSearchingDestination || isCalculatingRoute
                const hasInputs = startLocationInput.trim().length > 0 && destinationInput.trim().length > 0
                const isDisabled = !hasInputs || isBusy
                return (
                  <button
                    onClick={handleCalculateRoute}
                    disabled={isDisabled}
                    title={!hasInputs ? t.buttons.enterLocations : undefined}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                    style={{
                      background: isDisabled ? 'var(--nav-bg-input)' : 'var(--nav-accent)',
                      border: `1px solid ${isDisabled ? 'var(--nav-border)' : 'var(--nav-accent)'}`,
                      color: isDisabled ? 'var(--nav-text-secondary)' : '#0f1117',
                      opacity: isDisabled ? 0.6 : 1,
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isBusy
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <MapPin className="h-4 w-4" />
                    }
                    {isBusy ? t.buttons.calculatingRoute : t.buttons.calculateRoute}
                  </button>
                )
              })()}

              {/* ── Divider ── */}
              <div style={{ height: '1px', background: 'var(--nav-border)' }} />

              {/* ── Waypoints + Settings + Stats (RoutePanel) ── */}
              <RoutePanel
                waypoints={waypoints}
                routeSettings={routeSettings}
                onUpdateWaypointName={updateWaypointName}
                onRemoveWaypoint={removeWaypoint}
                onReorderWaypoints={reorderWaypoints}
                onUpdateSettings={updateRouteSettings}
                onAddManually={() => setShowManualInputDialog(true)}
                isCalculating={isCalculatingRoute}
                fuelSuggestion={fuelSuggestion}
                onApplyFuelSuggestion={handleApplyFuelSuggestion}
              />

              {/* ── Divider ── */}
              <div style={{ height: '1px', background: 'var(--nav-border)' }} />

              {/* ── Route Stats ── */}
              <StatsPanel
                waypoints={waypoints}
                routeSettings={routeSettings}
                routeDistance={routeDistance}
                routeDuration={routeDuration}
                routeGeometry={routeGeometry}
              />

              {/* ── Divider ── */}
              <div style={{ height: '1px', background: 'var(--nav-border)' }} />

              {/* ── Action Buttons ── */}
              <div className="space-y-2">
                {isEditMode && (
                  <button
                    onClick={createNewRoute}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors"
                    style={{
                      background: 'var(--nav-bg-input)',
                      border: '1px solid var(--nav-border)',
                      color: 'var(--nav-text-primary)',
                    }}
                  >
                    <FilePlus className="h-4 w-4" />
                    {language === 'uk' ? 'Новий маршрут' : 'New Route'}
                  </button>
                )}

                {/* Load Route Dialog trigger */}
                <Dialog open={showLoadDialog} onOpenChange={setShowLoadDialog}>
                  <DialogTrigger asChild>
                    <button
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors"
                      style={{
                        background: 'var(--nav-bg-input)',
                        border: '1px solid var(--nav-border)',
                        color: 'var(--nav-text-primary)',
                      }}
                    >
                      <FolderOpen className="h-4 w-4" />
                      {t.buttons.loadRoute}
                    </button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t.dialogs.load.title}</DialogTitle>
                      <DialogDescription>{t.dialogs.load.description}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {loadingRoutes ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                      ) : savedRoutes.length === 0 ? (
                        <div className="text-center py-8">
                          <p className="text-muted-foreground mb-2">{t.dialogs.load.noRoutes}</p>
                          <p className="text-sm text-muted-foreground">{t.dialogs.load.createFirst}</p>
                        </div>
                      ) : (
                        savedRoutes.map(route => (
                          <Card key={route.id} className="p-4 hover:bg-accent/50 transition-colors">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <h3 className="font-semibold">{route.name}</h3>
                                <p className="text-sm text-muted-foreground">
                                  {route.waypoints.length} {t.dialogs.save.waypoints} • {route.totalDistance?.toFixed(2)} {t.dialogs.load.routeInfo}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(route.updatedAt!).toLocaleDateString()}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" onClick={() => loadRouteFromServer(route.id!)}>
                                  {t.buttons.load}
                                </Button>
                                <Button size="sm" variant="destructive" onClick={() => deleteRouteFromServer(route.id!)}>
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

                {/* Save Route Dialog trigger */}
                <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
                  <DialogTrigger asChild>
                    <button
                      disabled={waypoints.length === 0}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40"
                      style={{
                        background: waypoints.length > 0 ? 'var(--nav-accent)' : 'var(--nav-bg-input)',
                        border: '1px solid var(--nav-border)',
                        color: waypoints.length > 0 ? '#000' : 'var(--nav-text-secondary)',
                      }}
                    >
                      <Save className="h-4 w-4" />
                      {isEditMode ? (language === 'uk' ? 'Оновити маршрут' : 'Update Route') : t.buttons.saveRoute}
                    </button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{isEditMode ? (language === 'uk' ? 'Оновити маршрут' : 'Update Route') : t.dialogs.save.title}</DialogTitle>
                      <DialogDescription>
                        {isEditMode ? (language === 'uk' ? 'Оновіть існуючий маршрут або збережіть як новий' : 'Update the existing route or save as a new one') : t.dialogs.save.description}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="route-name">{t.dialogs.save.routeName}</Label>
                        <Input
                          id="route-name"
                          placeholder={t.dialogs.save.placeholder}
                          value={routeName}
                          onChange={(e) => setRouteName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !savingRoute) saveRouteToServer(false)
                          }}
                        />
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <p>{isEditMode ? (language === 'uk' ? 'Буде оновлено:' : 'This will update:') : t.dialogs.save.willSave}</p>
                        <ul className="list-disc list-inside mt-2 space-y-1">
                          <li>{waypoints.length} {t.dialogs.save.waypoints}</li>
                          <li>{t.dialogs.save.fuelSettings}</li>
                          <li>{t.dialogs.save.calculations}</li>
                        </ul>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
                        {t.buttons.cancel}
                      </Button>
                      {isEditMode && (
                        <Button variant="outline" onClick={() => saveRouteToServer(true)} disabled={savingRoute}>
                          {savingRoute ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{language === 'uk' ? 'Збереження...' : 'Saving...'}</>
                          ) : (
                            <><FilePlus className="h-4 w-4 mr-2" />{language === 'uk' ? 'Зберегти як новий' : 'Save as New'}</>
                          )}
                        </Button>
                      )}
                      <Button onClick={() => saveRouteToServer(false)} disabled={savingRoute}>
                        {savingRoute ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t.buttons.saving}</>
                        ) : (
                          <><Save className="h-4 w-4 mr-2" />{isEditMode ? (language === 'uk' ? 'Оновити' : 'Update') : t.buttons.save}</>
                        )}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <button
                  onClick={exportRouteAsJSON}
                  disabled={waypoints.length === 0}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                  style={{
                    background: 'var(--nav-bg-input)',
                    border: '1px solid var(--nav-border)',
                    color: 'var(--nav-text-primary)',
                  }}
                >
                  <Upload className="h-4 w-4" />
                  {t.buttons.exportJson}
                </button>

                <button
                  onClick={clearRoute}
                  disabled={waypoints.length === 0}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                  style={{
                    background: 'var(--nav-bg-input)',
                    border: '1px solid var(--nav-border)',
                    color: 'var(--nav-danger)',
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  {t.buttons.clear}
                </button>
              </div>

            </div>{/* end scrollable content */}
          </div>

          {/* ── AI Assistant input — pinned to sidebar bottom ── */}
          <div
            className="flex-shrink-0 p-3"
            style={{ borderTop: '1px solid var(--nav-border)' }}
          >
            {isProcessingAi && (
              <div
                className="h-0.5 mb-2 rounded-full animate-pulse"
                style={{ background: 'linear-gradient(90deg, var(--nav-accent), #6366f1, var(--nav-accent))' }}
              />
            )}
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder={t.chat.askPlaceholder}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isProcessingAi && chatInput.trim()) handleSendChat()
                }}
                disabled={isProcessingAi}
                className="flex-1 h-9 text-sm disabled:opacity-50"
                style={{
                  background: 'var(--nav-bg-input)',
                  border: '1px solid var(--nav-border)',
                  color: 'var(--nav-text-primary)',
                }}
              />
              <button
                onClick={handleSendChat}
                disabled={isProcessingAi || !chatInput.trim()}
                className="h-9 w-9 flex items-center justify-center rounded-lg flex-shrink-0 transition-colors disabled:opacity-40"
                style={{
                  background: 'var(--nav-accent)',
                  color: '#000',
                }}
              >
                {isProcessingAi ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MAP — always rendered, full width on mobile, flex-1 on desktop ── */}
      <div
        className="flex-1 relative h-full overflow-hidden"
        style={isMobile ? { paddingBottom: '140px' } : undefined}
      >
        <MapContainer
          waypoints={waypoints}
          routeGeometry={routeGeometry}
          onAddWaypoint={addWaypoint}
          onUpdateWaypoint={updateWaypoint}
          onDeleteWaypoint={removeWaypoint}
        />

        {/* Instructions overlay when no waypoints */}
        {waypoints.length === 0 && (
          <div
            className="glass-modal absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg z-10 pointer-events-none"
            style={{ color: 'var(--nav-text-secondary)' }}
          >
            <div className="flex flex-col gap-1 text-sm">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" style={{ color: 'var(--nav-accent)' }} />
                <span>{language === 'uk' ? 'Клікніть на карту, щоб додати точку' : 'Click map to add waypoint'}</span>
              </div>
              <div className="text-xs ml-6" style={{ color: 'var(--nav-text-secondary)' }}>
                {language === 'uk' ? 'ПКМ на маркері — видалити' : 'Right-click marker to delete'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── MOBILE BOTTOM SHEET — hidden on desktop ── */}
      {isMobile && (
        <div
          className="glass-sheet absolute bottom-0 left-0 right-0 flex flex-col transition-[height] duration-300 ease-in-out"
          style={{
            height: isMobileExpanded ? '65vh' : '140px',
            zIndex: 40,
          }}
        >
          {/* Sheet trigger: high-contrast pill so it reads as a button over
              the map, with a nudging chevron announcing the swipe-up */}
          <button
            type="button"
            onClick={() => setIsMobileExpanded(prev => !prev)}
            className="flex-shrink-0 flex flex-col items-center justify-center pt-1.5 pb-2 w-full"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
            aria-expanded={isMobileExpanded}
            aria-label={isMobileExpanded ? t.bottomSheet.collapse : t.bottomSheet.expand}
          >
            <div
              className="w-10 h-1 rounded-full mb-1.5"
              style={{ background: 'var(--nav-border)' }}
            />
            <span className="sheet-trigger-pill flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold shadow-lg">
              {isMobileExpanded ? (
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ChevronUp className="h-4 w-4 sheet-chevron" aria-hidden="true" />
              )}
              {isMobileExpanded ? t.bottomSheet.collapse : t.bottomSheet.expand}
            </span>
          </button>

          {/* Collapsed state: start + destination quick-entry */}
          {!isMobileExpanded && (
            <div className="flex items-center gap-2 px-3 pb-2">
              <div className="relative flex-1">
                <Input
                  type="text"
                  placeholder={language === 'uk' ? 'Початок...' : 'Start...'}
                  value={startLocationInput}
                  onChange={(e) => setStartLocationInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !isSearchingStart) handleStartLocationSearch() }}
                  disabled={isSearchingStart}
                  className="h-9 text-sm w-full"
                  style={{
                    background: 'var(--nav-bg-input)',
                    border: '1px solid var(--nav-border)',
                    color: 'var(--nav-text-primary)',
                  }}
                />
                {isSearchingStart && (
                  <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin" style={{ color: 'var(--nav-accent)' }} />
                )}
              </div>
              <div className="relative flex-1">
                <Input
                  type="text"
                  placeholder={language === 'uk' ? 'Кінець...' : 'Destination...'}
                  value={destinationInput}
                  onChange={(e) => setDestinationInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !isSearchingDestination) handleDestinationSearch() }}
                  disabled={isSearchingDestination}
                  className="h-9 text-sm w-full"
                  style={{
                    background: 'var(--nav-bg-input)',
                    border: '1px solid var(--nav-border)',
                    color: 'var(--nav-text-primary)',
                  }}
                />
                {isSearchingDestination && (
                  <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin" style={{ color: 'var(--nav-accent)' }} />
                )}
              </div>
              <button
                onClick={() => { if (startLocationInput.trim()) handleStartLocationSearch(); if (destinationInput.trim()) handleDestinationSearch() }}
                className="h-9 w-9 flex items-center justify-center rounded-lg flex-shrink-0"
                style={{ background: 'var(--nav-accent)', color: '#0f1117' }}
                aria-label={language === 'uk' ? 'Пошук' : 'Search'}
              >
                <Search className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Expanded state: scrollable full sidebar content */}
          {isMobileExpanded && (
            <>
              <div className="flex-1 overflow-y-auto">
                <div className="p-4 space-y-5">

                  {/* ── Route name + edit mode indicator ── */}
                  {(routeName || isEditMode) && (
                    <div
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                      style={{
                        background: 'var(--nav-bg-input)',
                        border: '1px solid var(--nav-border)',
                        color: 'var(--nav-text-secondary)',
                      }}
                    >
                      {isEditMode && (
                        <Edit className="h-3 w-3" style={{ color: 'var(--nav-accent)' }} />
                      )}
                      <span className="truncate">{routeName || (language === 'uk' ? 'Редагування маршруту' : 'Editing route')}</span>
                    </div>
                  )}

                  {/* ── START input ── */}
                  <div>
                    <Label
                      className="block text-xs font-semibold mb-1.5 uppercase tracking-wider"
                      style={{ color: 'var(--nav-text-secondary)' }}
                    >
                      {language === 'uk' ? 'Початок' : 'Start'}
                    </Label>
                    <div className="relative">
                      <Input
                        type="text"
                        placeholder={language === 'uk' ? 'Шукати початкову локацію...' : 'Search start location...'}
                        value={startLocationInput}
                        onChange={(e) => setStartLocationInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !isSearchingStart) {
                            handleStartLocationSearch()
                          }
                        }}
                        disabled={isSearchingStart}
                        className="w-full pr-8"
                        style={{
                          background: 'var(--nav-bg-input)',
                          border: '1px solid var(--nav-border)',
                          color: 'var(--nav-text-primary)',
                        }}
                      />
                      {isSearchingStart && (
                        <Loader2
                          className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin"
                          style={{ color: 'var(--nav-accent)' }}
                        />
                      )}
                    </div>
                  </div>

                  {/* ── Swap button ── */}
                  {waypoints.length >= 2 && (
                    <div className="flex justify-center">
                      <button
                        onClick={() => {
                          const swapped = [...waypoints]
                          const first = swapped[0]
                          swapped[0] = swapped[swapped.length - 1]
                          swapped[swapped.length - 1] = first
                          reorderWaypoints(swapped)
                        }}
                        className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full transition-colors"
                        style={{
                          background: 'var(--nav-bg-input)',
                          border: '1px solid var(--nav-border)',
                          color: 'var(--nav-text-secondary)',
                        }}
                        title={language === 'uk' ? 'Поміняти місцями' : 'Swap start/destination'}
                      >
                        ↕ {language === 'uk' ? 'Поміняти' : 'Swap'}
                      </button>
                    </div>
                  )}

                  {/* ── DESTINATION input ── */}
                  <div>
                    <Label
                      className="block text-xs font-semibold mb-1.5 uppercase tracking-wider"
                      style={{ color: 'var(--nav-text-secondary)' }}
                    >
                      {language === 'uk' ? 'Призначення' : 'Destination'}
                    </Label>
                    <div className="relative">
                      <Input
                        type="text"
                        placeholder={language === 'uk' ? 'Шукати призначення...' : 'Search destination...'}
                        value={destinationInput}
                        onChange={(e) => setDestinationInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !isSearchingDestination) {
                            handleDestinationSearch()
                          }
                        }}
                        disabled={isSearchingDestination}
                        className="w-full pr-8"
                        style={{
                          background: 'var(--nav-bg-input)',
                          border: '1px solid var(--nav-border)',
                          color: 'var(--nav-text-primary)',
                        }}
                      />
                      {isSearchingDestination && (
                        <Loader2
                          className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin"
                          style={{ color: 'var(--nav-accent)' }}
                        />
                      )}
                    </div>
                  </div>

                  {/* ── Calculate Route button ── */}
                  {(() => {
                    const isBusy = isSearchingStart || isSearchingDestination || isCalculatingRoute
                    const hasInputs = startLocationInput.trim().length > 0 && destinationInput.trim().length > 0
                    const isDisabled = !hasInputs || isBusy
                    return (
                      <button
                        onClick={handleCalculateRoute}
                        disabled={isDisabled}
                        title={!hasInputs ? t.buttons.enterLocations : undefined}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                        style={{
                          background: isDisabled ? 'var(--nav-bg-input)' : 'var(--nav-accent)',
                          border: `1px solid ${isDisabled ? 'var(--nav-border)' : 'var(--nav-accent)'}`,
                          color: isDisabled ? 'var(--nav-text-secondary)' : '#0f1117',
                          opacity: isDisabled ? 0.6 : 1,
                          cursor: isDisabled ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isBusy
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <MapPin className="h-4 w-4" />
                        }
                        {isBusy ? t.buttons.calculatingRoute : t.buttons.calculateRoute}
                      </button>
                    )
                  })()}

                  {/* ── Divider ── */}
                  <div style={{ height: '1px', background: 'var(--nav-border)' }} />

                  {/* ── Waypoints + Settings + Stats (RoutePanel) ── */}
                  <RoutePanel
                    waypoints={waypoints}
                    routeSettings={routeSettings}
                    onUpdateWaypointName={updateWaypointName}
                    onRemoveWaypoint={removeWaypoint}
                    onReorderWaypoints={reorderWaypoints}
                    onUpdateSettings={updateRouteSettings}
                    onAddManually={() => setShowManualInputDialog(true)}
                    isCalculating={isCalculatingRoute}
                    fuelSuggestion={fuelSuggestion}
                    onApplyFuelSuggestion={handleApplyFuelSuggestion}
                  />

                  {/* ── Divider ── */}
                  <div style={{ height: '1px', background: 'var(--nav-border)' }} />

                  {/* ── Route Stats ── */}
                  <StatsPanel
                    waypoints={waypoints}
                    routeSettings={routeSettings}
                    routeDistance={routeDistance}
                    routeDuration={routeDuration}
                    routeGeometry={routeGeometry}
                  />

                  {/* ── Divider ── */}
                  <div style={{ height: '1px', background: 'var(--nav-border)' }} />

                  {/* ── Action Buttons ── */}
                  <div className="space-y-2">
                    {isEditMode && (
                      <button
                        onClick={createNewRoute}
                        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors"
                        style={{
                          background: 'var(--nav-bg-input)',
                          border: '1px solid var(--nav-border)',
                          color: 'var(--nav-text-primary)',
                        }}
                      >
                        <FilePlus className="h-4 w-4" />
                        {language === 'uk' ? 'Новий маршрут' : 'New Route'}
                      </button>
                    )}

                    {/* Load Route Dialog trigger */}
                    <Dialog open={showLoadDialog} onOpenChange={setShowLoadDialog}>
                      <DialogTrigger asChild>
                        <button
                          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors"
                          style={{
                            background: 'var(--nav-bg-input)',
                            border: '1px solid var(--nav-border)',
                            color: 'var(--nav-text-primary)',
                          }}
                        >
                          <FolderOpen className="h-4 w-4" />
                          {t.buttons.loadRoute}
                        </button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>{t.dialogs.load.title}</DialogTitle>
                          <DialogDescription>{t.dialogs.load.description}</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                          {loadingRoutes ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            </div>
                          ) : savedRoutes.length === 0 ? (
                            <div className="text-center py-8">
                              <p className="text-muted-foreground mb-2">{t.dialogs.load.noRoutes}</p>
                              <p className="text-sm text-muted-foreground">{t.dialogs.load.createFirst}</p>
                            </div>
                          ) : (
                            savedRoutes.map(route => (
                              <Card key={route.id} className="p-4 hover:bg-accent/50 transition-colors">
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    <h3 className="font-semibold">{route.name}</h3>
                                    <p className="text-sm text-muted-foreground">
                                      {route.waypoints.length} {t.dialogs.save.waypoints} • {route.totalDistance?.toFixed(2)} {t.dialogs.load.routeInfo}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {new Date(route.updatedAt!).toLocaleDateString()}
                                    </p>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button size="sm" onClick={() => loadRouteFromServer(route.id!)}>
                                      {t.buttons.load}
                                    </Button>
                                    <Button size="sm" variant="destructive" onClick={() => deleteRouteFromServer(route.id!)}>
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

                    {/* Save Route Dialog trigger */}
                    <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
                      <DialogTrigger asChild>
                        <button
                          disabled={waypoints.length === 0}
                          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40"
                          style={{
                            background: waypoints.length > 0 ? 'var(--nav-accent)' : 'var(--nav-bg-input)',
                            border: '1px solid var(--nav-border)',
                            color: waypoints.length > 0 ? '#000' : 'var(--nav-text-secondary)',
                          }}
                        >
                          <Save className="h-4 w-4" />
                          {isEditMode ? (language === 'uk' ? 'Оновити маршрут' : 'Update Route') : t.buttons.saveRoute}
                        </button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>{isEditMode ? (language === 'uk' ? 'Оновити маршрут' : 'Update Route') : t.dialogs.save.title}</DialogTitle>
                          <DialogDescription>
                            {isEditMode ? (language === 'uk' ? 'Оновіть існуючий маршрут або збережіть як новий' : 'Update the existing route or save as a new one') : t.dialogs.save.description}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <Label htmlFor="route-name-mobile">{t.dialogs.save.routeName}</Label>
                            <Input
                              id="route-name-mobile"
                              placeholder={t.dialogs.save.placeholder}
                              value={routeName}
                              onChange={(e) => setRouteName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !savingRoute) saveRouteToServer(false)
                              }}
                            />
                          </div>
                          <div className="text-sm text-muted-foreground">
                            <p>{isEditMode ? (language === 'uk' ? 'Буде оновлено:' : 'This will update:') : t.dialogs.save.willSave}</p>
                            <ul className="list-disc list-inside mt-2 space-y-1">
                              <li>{waypoints.length} {t.dialogs.save.waypoints}</li>
                              <li>{t.dialogs.save.fuelSettings}</li>
                              <li>{t.dialogs.save.calculations}</li>
                            </ul>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
                            {t.buttons.cancel}
                          </Button>
                          {isEditMode && (
                            <Button variant="outline" onClick={() => saveRouteToServer(true)} disabled={savingRoute}>
                              {savingRoute ? (
                                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{language === 'uk' ? 'Збереження...' : 'Saving...'}</>
                              ) : (
                                <><FilePlus className="h-4 w-4 mr-2" />{language === 'uk' ? 'Зберегти як новий' : 'Save as New'}</>
                              )}
                            </Button>
                          )}
                          <Button onClick={() => saveRouteToServer(false)} disabled={savingRoute}>
                            {savingRoute ? (
                              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t.buttons.saving}</>
                            ) : (
                              <><Save className="h-4 w-4 mr-2" />{isEditMode ? (language === 'uk' ? 'Оновити' : 'Update') : t.buttons.save}</>
                            )}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    <button
                      onClick={exportRouteAsJSON}
                      disabled={waypoints.length === 0}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                      style={{
                        background: 'var(--nav-bg-input)',
                        border: '1px solid var(--nav-border)',
                        color: 'var(--nav-text-primary)',
                      }}
                    >
                      <Upload className="h-4 w-4" />
                      {t.buttons.exportJson}
                    </button>

                    <button
                      onClick={clearRoute}
                      disabled={waypoints.length === 0}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                      style={{
                        background: 'var(--nav-bg-input)',
                        border: '1px solid var(--nav-border)',
                        color: 'var(--nav-danger)',
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      {t.buttons.clear}
                    </button>
                  </div>

                </div>{/* end scrollable content */}
              </div>

              {/* AI assistant input pinned to bottom */}
              <div
                className="flex-shrink-0 p-3"
                style={{ borderTop: '1px solid var(--nav-border)' }}
              >
                {isProcessingAi && (
                  <div
                    className="h-0.5 mb-2 rounded-full animate-pulse"
                    style={{ background: 'linear-gradient(90deg, var(--nav-accent), #6366f1, var(--nav-accent))' }}
                  />
                )}
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder={t.chat.askPlaceholder}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isProcessingAi && chatInput.trim()) handleSendChat()
                    }}
                    disabled={isProcessingAi}
                    className="flex-1 h-9 text-sm disabled:opacity-50"
                    style={{
                      background: 'var(--nav-bg-input)',
                      border: '1px solid var(--nav-border)',
                      color: 'var(--nav-text-primary)',
                    }}
                  />
                  <button
                    onClick={handleSendChat}
                    disabled={isProcessingAi || !chatInput.trim()}
                    className="h-9 w-9 flex items-center justify-center rounded-lg flex-shrink-0 transition-colors disabled:opacity-40"
                    style={{
                      background: 'var(--nav-accent)',
                      color: '#000',
                    }}
                  >
                    {isProcessingAi ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Dialogs — rendered at root level for correct z-index ── */}

      {/* Manual Address Input Dialog */}
      <Dialog open={showManualInputDialog} onOpenChange={setShowManualInputDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.dialogs.manual.title}</DialogTitle>
            <DialogDescription>{t.dialogs.manual.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="manual-address">{t.dialogs.manual.addressLabel}</Label>
              <Input
                id="manual-address"
                value={manualAddress}
                onChange={(e) => setManualAddress(e.target.value)}
                placeholder={t.dialogs.manual.placeholder}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isSearching) handleManualAddressSubmit()
                }}
              />
              <p className="text-xs text-muted-foreground mt-1">{t.dialogs.manual.hint}</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowManualInputDialog(false); setManualAddress('') }}>
                {t.buttons.cancel}
              </Button>
              <Button onClick={handleManualAddressSubmit} disabled={!manualAddress.trim() || isSearching}>
                {isSearching ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t.buttons.searching}</>
                ) : (
                  <><MapPin className="h-4 w-4 mr-2" />{t.dialogs.manual.addWaypoint}</>
                )}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
