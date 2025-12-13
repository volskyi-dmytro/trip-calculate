import { useState, useCallback, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { MapContainer } from './MapContainer'
import { WelcomeScreen } from './WelcomeScreen'
import { TopChatBar } from './TopChatBar'
import { StatsPanel } from './StatsPanel'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MapPin, Navigation, Save, Upload, Trash2, FolderOpen, Loader2, Edit, FilePlus, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { routeService, type Route } from '../services/routeService'
import { geocodingService } from '../services/geocodingService'
import { routingService } from '../services/routingService'
import { planTripWithN8n } from '../services/n8nService'
// import { getTripInsights } from '../services/geminiService'
import { useLanguage } from '../contexts/LanguageContext'
import { getTranslation, type Language } from '../i18n/routePlanner'
import type { ChatMessage } from '../types'
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
  passengerCount: number
}

export function RoutePlanner() {
  const { language } = useLanguage()
  const t = getTranslation(language as Language)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  // Load waypoints from localStorage on mount
  const [waypoints, setWaypoints] = useState<Waypoint[]>(() => {
    const saved = localStorage.getItem('tripCalculate_currentRoute')
    return saved ? JSON.parse(saved) : []
  })
  const [routeSettings, setRouteSettings] = useState<RouteSettings>(() => {
    const saved = localStorage.getItem('tripCalculate_routeSettings')
    return saved ? JSON.parse(saved) : {
      fuelConsumption: 9.2,
      fuelCostPerLiter: 55,
      currency: 'UAH',
      passengerCount: 1
    }
  })
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

  // Edit mode state
  const [currentRouteId, setCurrentRouteId] = useState<number | null>(null)
  const [isEditMode, setIsEditMode] = useState(false)

  // AI Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isProcessingN8n, setIsProcessingN8n] = useState(false)
  // const [isGettingInsights, setIsGettingInsights] = useState(false)
  const [pendingSuggestions, setPendingSuggestions] = useState<string[] | null>(null)
  const [isApplyingSuggestions, setIsApplyingSuggestions] = useState(false)

  // View mode: welcome screen vs dashboard
  const [showWelcomeScreen, setShowWelcomeScreen] = useState(true)
  const [manualMode, setManualMode] = useState(false)

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

  // Calculate road-based route whenever waypoints change
  useEffect(() => {
    const updateRoute = async () => {
      if (waypoints.length < 2) {
        setRouteGeometry([])
        setRouteDistance(0)
        setRouteDuration(0)
        return
      }

      try {
        const route = await routingService.getRoute(waypoints)
        setRouteGeometry(route.geometry)
        setRouteDistance(route.totalDistance)
        setRouteDuration(route.totalDuration)

        // Log routing success/failure for debugging
        if (route.totalDistance > 0) {
          console.log('✅ Road-based route calculated:', route.totalDistance.toFixed(2), 'km')
        } else {
          console.warn('⚠️ Using straight-line fallback (routing failed)')
        }
      } catch (error) {
        console.error('Failed to calculate route:', error)
        // Fallback to straight lines
        setRouteGeometry(waypoints.map(w => [w.lat, w.lng]))
        setRouteDistance(0)
        setRouteDuration(0)
      }
    }

    updateRoute()
  }, [waypoints])

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

  const updateWaypointName = useCallback((id: string, name: string) => {
    setWaypoints(prev =>
      prev.map(wp => wp.id === id ? { ...wp, name } : wp)
    )
  }, [])

  // const removeWaypoint = useCallback((id: string) => {
  //   setWaypoints(prev => prev.filter(wp => wp.id !== id))
  //   toast.success(t.toasts.waypointRemoved)
  // }, [t])

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
        fuelConsumption: route.fuelConsumption,
        fuelCostPerLiter: route.fuelCostPerLiter,
        currency: route.currency,
        passengerCount: route.passengerCount || 1
      })
      setRouteName(route.name)
      setShowLoadDialog(false)
      setShowWelcomeScreen(false) // Exit welcome screen when loading a route
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
    setIsProcessingN8n(true);

    // Transition to dashboard after first user message
    if (showWelcomeScreen) {
      setShowWelcomeScreen(false);
      setManualMode(false); // Exit manual mode when AI is used
    }

    try {
      const n8nData = await planTripWithN8n(userMsg.content);

      if (n8nData) {
        const updates: string[] = [];

        // Update fuel consumption
        if (n8nData.consumption) {
          setRouteSettings(prev => ({ ...prev, fuelConsumption: n8nData.consumption! }));
          updates.push(`${t.routeSettings.fuelConsumption}: ${n8nData.consumption}`);
        }

        // Update fuel cost
        if (n8nData.price) {
          setRouteSettings(prev => ({ ...prev, fuelCostPerLiter: n8nData.price! }));
          updates.push(`${t.routeSettings.fuelCost}: ${n8nData.price}`);
        }

        // Update currency
        if (n8nData.currency) {
          setRouteSettings(prev => ({ ...prev, currency: n8nData.currency! }));
        }

        // Update passenger count
        if (n8nData.passengers) {
          setRouteSettings(prev => ({ ...prev, passengerCount: n8nData.passengers! }));
          updates.push(`${language === 'uk' ? 'Пасажири' : 'Passengers'}: ${n8nData.passengers}`);
        }

        // Add waypoints from n8n data
        const newWaypoints: Waypoint[] = [];

        // Origin
        if (n8nData.originLocation) {
          newWaypoints.push({
            id: Date.now().toString() + '-origin',
            lat: n8nData.originLocation.lat,
            lng: n8nData.originLocation.lon,
            name: n8nData.originLocation.display_name
          });
          updates.push(`Start: ${n8nData.originLocation.display_name.split(',')[0]}`);
        } else if (n8nData.originName) {
          const locs = await geocodingService.forwardGeocode(n8nData.originName);
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
        if (n8nData.waypoints && n8nData.waypoints.length > 0) {
          for (const wp of n8nData.waypoints) {
            newWaypoints.push({
              id: Date.now().toString() + '-wp-' + Math.random(),
              lat: wp.lat,
              lng: wp.lon,
              name: wp.display_name
            });
          }
          updates.push(`+${n8nData.waypoints.length} stop(s)`);
        }

        // Destination
        if (n8nData.destinationLocation) {
          newWaypoints.push({
            id: Date.now().toString() + '-dest',
            lat: n8nData.destinationLocation.lat,
            lng: n8nData.destinationLocation.lon,
            name: n8nData.destinationLocation.display_name
          });
          updates.push(`Destination: ${n8nData.destinationLocation.display_name.split(',')[0]}`);
        } else if (n8nData.destinationName) {
          const locs = await geocodingService.forwardGeocode(n8nData.destinationName);
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

        const responseMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: updates.length > 0
            ? `✓ Updated: ${updates.join(', ')}.`
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
        setChatMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Sorry, I could not process your request. Please try again.',
          timestamp: Date.now()
        }]);

        // Error toast - no data returned
        toast.error(
          language === 'uk' ? 'Не вдалося обробити запит' : 'Failed to process request',
          {
            description: language === 'uk'
              ? 'AI не зміг обробити ваш запит. Спробуйте ще раз з більш детальним описом.'
              : 'AI could not process your request. Please try again with more details.',
            duration: 5000
          }
        );
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
      setIsProcessingN8n(false);
    }
  }, [chatInput, t, showWelcomeScreen, language]);

  // AI Insights Handler (commented out for now)
  // const handleGetAiInsights = useCallback(async () => {
  //   if (waypoints.length < 2) {
  //     setChatMessages(prev => [...prev, {
  //       id: Date.now().toString(),
  //       role: 'assistant',
  //       content: 'Please add at least 2 waypoints (start and destination) to get insights.',
  //       timestamp: Date.now()
  //     }]);
  //     return;
  //   }

  //   setIsGettingInsights(true);
  //   setChatMessages(prev => [...prev, {
  //     id: Date.now().toString(),
  //     role: 'assistant',
  //     content: 'Searching for interesting stops along your route...',
  //     timestamp: Date.now()
  //   }]);

  //   const origin = waypoints[0].name.split(',')[0];
  //   const destination = waypoints[waypoints.length - 1].name.split(',')[0];
  //   const distance = routeGeometry.length > 0 ? calculateTotalDistance() : 0;

  //   const insights = await getTripInsights(origin, destination, distance / 1000, language);

  //   setChatMessages(prev => [...prev, {
  //     id: (Date.now() + 1).toString(),
  //     role: 'assistant',
  //     content: insights.content,
  //     timestamp: Date.now()
  //   }]);

  //   if (insights.suggestedStops.length > 0) {
  //     setPendingSuggestions(insights.suggestedStops);
  //   }

  //   setIsGettingInsights(false);
  // }, [waypoints, routeGeometry, language]);

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

  // If in welcome screen mode, show centered chat interface
  if (showWelcomeScreen && !manualMode) {
    return (
      <WelcomeScreen
        chatMessages={chatMessages}
        chatInput={chatInput}
        onChatInputChange={setChatInput}
        onSendMessage={handleSendChat}
        isProcessing={isProcessingN8n}
        onManualClick={handleManualClick}
        pendingSuggestions={pendingSuggestions}
        onApplySuggestions={handleApplySuggestions}
        onDismissSuggestions={() => setPendingSuggestions(null)}
        isApplyingSuggestions={isApplyingSuggestions}
      />
    );
  }

  // Dashboard view with map and panels
  return (
    <div className="flex flex-col min-h-screen">
      {/* SECTION 1: Fixed Header - NO SCROLL */}
      <div className="sticky top-0 z-50 bg-white dark:bg-slate-900">
        {/* AI Assistant Input - FIXED at top */}
        <TopChatBar
          chatInput={chatInput}
          onChatInputChange={setChatInput}
          onSendMessage={handleSendChat}
          isProcessing={isProcessingN8n}
        />

        {/* Title + Buttons - FIXED at top, doesn't scroll */}
        <header className="border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            {/* Title */}
            <div className="flex items-center gap-2">
              <Navigation className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
              <h1 className="text-xl lg:text-2xl font-bold text-slate-800 dark:text-white">{t.title}</h1>
              {routeName && <span className="text-sm ml-4 opacity-60">({routeName})</span>}
              {isEditMode && (
                <span className="text-xs px-2 py-1 rounded bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center gap-1">
                  <Edit className="h-3 w-3" />
                  Editing
                </span>
              )}
            </div>

            {/* Button Group - ALL buttons must be visible */}
            <div className="flex gap-2 flex-wrap">
            {isEditMode && (
              <Button variant="outline" size="sm" onClick={createNewRoute} className="whitespace-nowrap px-3 lg:px-4 text-sm lg:text-base">
                <FilePlus className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">New Route</span>
                <span className="sm:hidden">New</span>
              </Button>
            )}
            {/* Load Route Dialog */}
            <Dialog open={showLoadDialog} onOpenChange={setShowLoadDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="whitespace-nowrap px-3 lg:px-4 text-sm lg:text-base">
                  <FolderOpen className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">{t.buttons.loadRoute}</span>
                  <span className="sm:hidden">Load</span>
                </Button>
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
                            <Button
                              size="sm"
                              onClick={() => loadRouteFromServer(route.id!)}
                            >
                              {t.buttons.load}
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
                  {isEditMode ? 'Update Route' : t.buttons.saveRoute}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{isEditMode ? 'Update Route' : t.dialogs.save.title}</DialogTitle>
                  <DialogDescription>
                    {isEditMode ? 'Update the existing route or save as a new one' : t.dialogs.save.description}
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
                        if (e.key === 'Enter' && !savingRoute) {
                          saveRouteToServer(false)
                        }
                      }}
                    />
                  </div>

                  <div className="text-sm text-muted-foreground">
                    <p>{isEditMode ? 'This will update:' : t.dialogs.save.willSave}</p>
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      <li>{waypoints.length} {t.dialogs.save.waypoints}</li>
                      <li>{t.dialogs.save.fuelSettings}</li>
                      <li>{t.dialogs.save.calculations}</li>
                    </ul>
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setShowSaveDialog(false)}
                  >
                    {t.buttons.cancel}
                  </Button>
                  {isEditMode && (
                    <Button
                      variant="outline"
                      onClick={() => saveRouteToServer(true)}
                      disabled={savingRoute}
                    >
                      {savingRoute ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <FilePlus className="h-4 w-4 mr-2" />
                          Save as New
                        </>
                      )}
                    </Button>
                  )}
                  <Button
                    onClick={() => saveRouteToServer(false)}
                    disabled={savingRoute}
                  >
                    {savingRoute ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {t.buttons.saving}
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        {isEditMode ? 'Update' : t.buttons.save}
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button variant="outline" size="sm" onClick={exportRouteAsJSON} disabled={waypoints.length === 0} className="whitespace-nowrap px-3 lg:px-4 text-sm lg:text-base">
              <Upload className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">{t.buttons.exportJson}</span>
              <span className="sm:hidden">Export</span>
            </Button>
            <Button variant="destructive" size="sm" onClick={clearRoute} disabled={waypoints.length === 0} className="whitespace-nowrap px-3 lg:px-4 text-sm lg:text-base">
              <Trash2 className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">{t.buttons.clear}</span>
              <span className="sm:hidden">Clear</span>
            </Button>
          </div>
        </div>
      </header>

        {/* Manual Address Input Dialog */}
        <Dialog open={showManualInputDialog} onOpenChange={setShowManualInputDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.dialogs.manual.title}</DialogTitle>
            <DialogDescription>
              {t.dialogs.manual.description}
            </DialogDescription>
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
                  if (e.key === 'Enter' && !isSearching) {
                    handleManualAddressSubmit()
                  }
                }}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t.dialogs.manual.hint}
              </p>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowManualInputDialog(false)
                  setManualAddress('')
                }}
              >
                {t.buttons.cancel}
              </Button>
              <Button
                onClick={handleManualAddressSubmit}
                disabled={!manualAddress.trim() || isSearching}
              >
                {isSearching ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t.buttons.searching}
                  </>
                ) : (
                  <>
                    <MapPin className="h-4 w-4 mr-2" />
                    {t.dialogs.manual.addWaypoint}
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
      </div>
      {/* End Fixed Header Section */}

      {/* SECTION 2: Main Content Area - SINGLE PAGE SCROLL */}
      <div className="flex-1">
        <div className="flex flex-col lg:flex-row">
          {/* LEFT: Map Container */}
          <div className="relative w-full lg:w-2/3 h-[400px] lg:h-[600px] bg-gray-100 dark:bg-gray-800">
          <MapContainer
            waypoints={waypoints}
            routeGeometry={routeGeometry}
            onAddWaypoint={addWaypoint}
            onUpdateWaypoint={updateWaypoint}
          />

          {/* Instructions overlay */}
          {waypoints.length === 0 && (
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-white dark:bg-slate-800 px-4 py-2 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-[500]">
              <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <MapPin className="h-4 w-4" />
                <span>{t.waypoints.clickMap}</span>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Details Panel - Scrolls naturally with page */}
        <div className="w-full lg:w-1/3 bg-gray-50 dark:bg-gray-900 border-t lg:border-t-0 lg:border-l border-gray-200 dark:border-gray-700">
          <div className="p-4 space-y-6">
            {/* Route Inputs Section */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-800 dark:text-white">
                <Navigation className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                {language === 'uk' ? 'Деталі маршруту' : 'Route Details'}
              </h2>

              {/* Start Location */}
              <div>
                <Label className="block text-xs font-semibold mb-1 text-slate-600 dark:text-slate-300 uppercase">
                  {language === 'uk' ? 'ПОЧАТОК' : 'START'}
                </Label>
                <Input
                  type="text"
                  placeholder={language === 'uk' ? 'Шукати початкову локацію...' : 'Search start location...'}
                  value={waypoints.length > 0 ? waypoints[0].name : ''}
                  onChange={(e) => {
                    if (waypoints.length > 0) {
                      updateWaypointName(waypoints[0].id, e.target.value);
                    }
                  }}
                  className="w-full"
                />
              </div>

              {/* Destination */}
              <div>
                <Label className="block text-xs font-semibold mb-1 text-slate-600 dark:text-slate-300 uppercase">
                  {language === 'uk' ? 'ПРИЗНАЧЕННЯ' : 'DESTINATION'}
                </Label>
                <Input
                  type="text"
                  placeholder={language === 'uk' ? 'Шукати призначення...' : 'Search destination...'}
                  value={waypoints.length > 1 ? waypoints[waypoints.length - 1].name : ''}
                  onChange={(e) => {
                    if (waypoints.length > 1) {
                      updateWaypointName(waypoints[waypoints.length - 1].id, e.target.value);
                    }
                  }}
                  className="w-full"
                />
              </div>

              {/* Fuel Consumption */}
              <div>
                <Label className="block text-xs font-semibold mb-1 text-slate-600 dark:text-slate-300 uppercase">
                  {language === 'uk' ? 'Л/100КМ' : 'L/100KM'}
                </Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="9.2"
                  value={routeSettings.fuelConsumption > 0 ? routeSettings.fuelConsumption.toString() : ''}
                  onChange={(e) => {
                    let value = e.target.value.replace(',', '.');
                    if (value === '' || /^\d*\.?\d*$/.test(value)) {
                      const numValue = parseFloat(value);
                      if (!isNaN(numValue) && numValue >= 0) {
                        setRouteSettings({ ...routeSettings, fuelConsumption: numValue });
                      }
                    }
                  }}
                  className="w-full"
                />
              </div>

              {/* Fuel Price */}
              <div>
                <Label className="block text-xs font-semibold mb-1 text-slate-600 dark:text-slate-300 uppercase">
                  {language === 'uk' ? 'ЦІНА' : 'PRICE'}
                </Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="55"
                  value={routeSettings.fuelCostPerLiter > 0 ? routeSettings.fuelCostPerLiter.toString() : ''}
                  onChange={(e) => {
                    let value = e.target.value.replace(',', '.');
                    if (value === '' || /^\d*\.?\d*$/.test(value)) {
                      const numValue = parseFloat(value);
                      if (!isNaN(numValue) && numValue >= 0) {
                        setRouteSettings({ ...routeSettings, fuelCostPerLiter: numValue });
                      }
                    }
                  }}
                  className="w-full"
                />
              </div>

              {/* Passenger Count */}
              <div>
                <Label className="block text-xs font-semibold mb-1 text-slate-600 dark:text-slate-300 uppercase">
                  {language === 'uk' ? 'ПАСАЖИРИ' : 'PASSENGERS'}
                </Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="1"
                  min="1"
                  max="99"
                  value={routeSettings.passengerCount > 0 ? routeSettings.passengerCount : ''}
                  onChange={(e) => {
                    const numValue = parseInt(e.target.value, 10);
                    if (!isNaN(numValue) && numValue >= 1 && numValue <= 99) {
                      setRouteSettings({ ...routeSettings, passengerCount: numValue });
                    } else if (e.target.value === '') {
                      // Allow clearing the field temporarily
                      setRouteSettings({ ...routeSettings, passengerCount: 1 });
                    }
                  }}
                  className="w-full"
                />
              </div>

              {/* Manual Add Button */}
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowManualInputDialog(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                {t.buttons.addManually}
              </Button>
            </div>

            {/* Stats Panel */}
            <StatsPanel
              waypoints={waypoints}
              routeSettings={routeSettings}
              routeDistance={routeDistance}
              routeDuration={routeDuration}
            />
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}
