import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { Waypoint } from './RoutePlanner'
import { useTheme } from '../contexts/ThemeContext'

interface MapContainerProps {
  waypoints: Waypoint[]
  routeGeometry: Array<[number, number]> // [lat, lng] format from OSRM
  onAddWaypoint: (lat: number, lng: number) => void
  onUpdateWaypoint: (id: string, lat: number, lng: number) => void
  onDeleteWaypoint?: (id: string) => void
}

export function MapContainer({ waypoints, routeGeometry, onAddWaypoint, onUpdateWaypoint, onDeleteWaypoint }: MapContainerProps) {
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map())
  const onAddWaypointRef = useRef(onAddWaypoint)
  const onDeleteWaypointRef = useRef(onDeleteWaypoint)
  const isMapLoadedRef = useRef(false)
  const { theme } = useTheme()

  const add3DBuildingsLayer = (map: mapboxgl.Map) => {
    if (map.getLayer('3d-buildings')) return

    const layers = map.getStyle().layers
    const labelLayerId = layers?.find(layer => {
      if (layer.type !== 'symbol') return false
      const symbolLayer = layer as mapboxgl.SymbolLayer
      return Boolean(symbolLayer.layout?.['text-field'])
    })?.id

    map.addLayer(
      {
        id: '3d-buildings',
        source: 'composite',
        'source-layer': 'building',
        filter: ['==', 'extrude', 'true'],
        type: 'fill-extrusion',
        minzoom: 15,
        paint: {
          'fill-extrusion-color': '#aaa',
          'fill-extrusion-opacity': 0.6,
          'fill-extrusion-height': [
            'interpolate',
            ['linear'],
            ['zoom'],
            15,
            ['get', 'height'],
            15.05,
            ['get', 'height']
          ],
          'fill-extrusion-base': [
            'interpolate',
            ['linear'],
            ['zoom'],
            15,
            ['get', 'min_height'],
            15.05,
            ['get', 'min_height']
          ]
        }
      },
      labelLayerId
    )
  }

  // Update callback refs when they change
  useEffect(() => {
    onAddWaypointRef.current = onAddWaypoint
    onDeleteWaypointRef.current = onDeleteWaypoint
  }, [onAddWaypoint, onDeleteWaypoint])

  // Initialize map ONCE - never re-run this effect
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    // Set Mapbox access token from environment variable
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || ''

    if (!mapboxgl.accessToken) {
      console.error('⚠️ [MAP] VITE_MAPBOX_TOKEN is not set. Map will not load.')
      return
    }

    // Create map instance
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: theme === 'dark'
        ? 'mapbox://styles/mapbox/dark-v11'
        : 'mapbox://styles/mapbox/streets-v12',
      center: [30.5234, 50.4501], // [lng, lat] - Kyiv, Ukraine (Mapbox uses lng-first!)
      zoom: 6,
      projection: 'mercator' as any, // Explicitly set to mercator (not globe)
      pitch: 55,
      bearing: -15,
      antialias: true
    })

    // Add navigation controls
    map.addControl(new mapboxgl.NavigationControl(), 'top-right')

    // Add click handler to add waypoints
    map.on('click', (e) => {
      const { lat, lng } = e.lngLat
      onAddWaypointRef.current(lat, lng)
    })

    // Wait for map to load before adding initial data
    map.on('load', () => {
      isMapLoadedRef.current = true
      console.log('✅ [MAP] Mapbox GL JS initialized')

      // Add source for route line (initially empty)
      if (!map.getSource('route')) {
        map.addSource('route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: []
            }
          }
        })

        // Add layer for route line
        map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#3b82f6', // Tailwind blue-500
            'line-width': 4,
            'line-opacity': 0.8
          }
        })
        add3DBuildingsLayer(map)
      } else if (!map.getLayer('3d-buildings')) {
        add3DBuildingsLayer(map)
      }
    })

    mapRef.current = map

    // Cleanup on unmount
    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        isMapLoadedRef.current = false
      }
    }
  }, []) // Empty dependency array - only run once (theme is handled separately)

  // Handle theme changes - update map style
  useEffect(() => {
    if (!mapRef.current) return

    const map = mapRef.current
    const desiredStyle = theme === 'dark'
      ? 'mapbox://styles/mapbox/dark-v11'
      : 'mapbox://styles/mapbox/streets-v12'
    const spriteIdentifier = theme === 'dark' ? 'dark' : 'streets'

    const applyStyleChange = () => {
      if (!map.isStyleLoaded()) return

      const currentStyle = map.getStyle()
      if (currentStyle && currentStyle.sprite && currentStyle.sprite.includes(spriteIdentifier)) {
        return
      }

      console.log('🎨 [MAP] Switching theme to:', theme)

      const routeData = map.getSource('route')
        ? (map.getSource('route') as mapboxgl.GeoJSONSource)._data
        : null

      isMapLoadedRef.current = false
      map.setStyle(desiredStyle)

      map.once('style.load', () => {
        isMapLoadedRef.current = true
        console.log('🎨 [MAP] Style loaded, re-adding route layer')

        if (!map.getSource('route')) {
          map.addSource('route', {
            type: 'geojson',
            data: routeData || {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: []
              }
            }
          })

          map.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route',
            layout: {
              'line-join': 'round',
              'line-cap': 'round'
            },
            paint: {
              'line-color': '#3b82f6',
              'line-width': 4,
              'line-opacity': 0.8
            }
          })
        }

        add3DBuildingsLayer(map)
      })
    }

    if (map.isStyleLoaded()) {
      applyStyleChange()
    } else {
      map.once('load', () => {
        isMapLoadedRef.current = true
        applyStyleChange()
      })
    }
  }, [theme])

  // Update markers and route line when waypoints or geometry change
  useEffect(() => {
    console.log('🟣 [MAP] Effect triggered - waypoints:', waypoints.length, 'geometry points:', routeGeometry.length)

    if (!mapRef.current) {
      console.warn('⚠️ [MAP] Map not initialized yet')
      return
    }

    const map = mapRef.current

    // Remove markers that no longer exist
    markersRef.current.forEach((marker, id) => {
      if (!waypoints.find(wp => wp.id === id)) {
        marker.remove()
        markersRef.current.delete(id)
      }
    })

    // Add or update markers
    console.log('🟣 [MAP] Updating', waypoints.length, 'markers')
    waypoints.forEach((waypoint, index) => {
      let marker = markersRef.current.get(waypoint.id)

      if (!marker) {
        // Create custom HTML marker element with number
        const el = document.createElement('div')
        el.className = 'custom-mapbox-marker'
        el.style.cssText = `
          background-color: #3b82f6;
          color: white;
          border-radius: 50%;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          border: 3px solid white;
          box-shadow: 0 2px 5px rgba(0,0,0,0.3);
          cursor: grab;
          font-size: 14px;
          transition: all 0.2s ease;
        `
        el.textContent = (index + 1).toString()

        // Add hover effect
        el.addEventListener('mouseenter', () => {
          el.style.transform = 'scale(1.1)'
          el.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.5)'
        })
        el.addEventListener('mouseleave', () => {
          el.style.transform = 'scale(1)'
          el.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)'
        })

        // Add right-click handler for deletion
        el.addEventListener('contextmenu', (e) => {
          e.preventDefault()
          e.stopPropagation()

          if (onDeleteWaypointRef.current) {
            // Visual feedback before deletion
            el.style.backgroundColor = '#ef4444'
            el.style.transform = 'scale(0.8)'

            setTimeout(() => {
              onDeleteWaypointRef.current!(waypoint.id)
            }, 150)
          }
        })

        // Create marker at waypoint position (Mapbox uses [lng, lat])
        marker = new mapboxgl.Marker({
          element: el,
          draggable: true,
          anchor: 'center'
        })
          .setLngLat([waypoint.lng, waypoint.lat])
          .setPopup(new mapboxgl.Popup({ offset: 25 }).setText(waypoint.name))
          .addTo(map)

        // Handle marker drag
        marker.on('dragend', () => {
          const lngLat = marker!.getLngLat()
          onUpdateWaypoint(waypoint.id, lngLat.lat, lngLat.lng)
        })

        markersRef.current.set(waypoint.id, marker)
        console.log('🟣 [MAP] Created new marker', index + 1, 'at', waypoint.lat, waypoint.lng)
      } else {
        // Update existing marker position and number
        marker.setLngLat([waypoint.lng, waypoint.lat])

        const el = marker.getElement()
        el.textContent = (index + 1).toString()

        marker.setPopup(new mapboxgl.Popup({ offset: 25 }).setText(waypoint.name))
        console.log('🟣 [MAP] Updated existing marker', index + 1)
      }
    })

    // Update route line - convert from [lat, lng] to [lng, lat] for Mapbox
    if (routeGeometry.length > 0) {
      console.log('🟣 [MAP] Updating route geometry with', routeGeometry.length, 'points')
      console.log('🟣 [MAP] First point (Leaflet format):', routeGeometry[0])

      // Convert OSRM geometry from [lat, lng] to Mapbox [lng, lat]
      const mapboxCoordinates = routeGeometry.map(([lat, lng]) => [lng, lat])
      console.log('🟣 [MAP] First point (Mapbox format):', mapboxCoordinates[0])

      const source = map.getSource('route') as mapboxgl.GeoJSONSource
      if (source) {
        source.setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: mapboxCoordinates
          }
        })

        console.log('✅ [MAP] Route geometry updated')

        // Fit bounds to show entire route
        if (mapboxCoordinates.length > 0) {
          const bounds = mapboxCoordinates.reduce(
            (bounds, coord) => bounds.extend(coord as [number, number]),
            new mapboxgl.LngLatBounds(mapboxCoordinates[0] as [number, number], mapboxCoordinates[0] as [number, number])
          )

          map.fitBounds(bounds, {
            padding: 50,
            duration: 300
          })
        }
      }
    } else if (waypoints.length === 1) {
      // Single waypoint - center on it
      console.log('🟣 [MAP] Single waypoint, centering map')
      map.flyTo({
        center: [waypoints[0].lng, waypoints[0].lat],
        zoom: 10,
        duration: 300
      })

      // Clear route line
      const source = map.getSource('route') as mapboxgl.GeoJSONSource
      if (source) {
        source.setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: []
          }
        })
      }
    } else if (waypoints.length > 1) {
      // Multiple waypoints but no geometry yet - fit to waypoint bounds
      console.log('🟣 [MAP] Multiple waypoints but no geometry, fitting to waypoint bounds')

      const coordinates = waypoints.map(wp => [wp.lng, wp.lat] as [number, number])
      const bounds = coordinates.reduce(
        (bounds, coord) => bounds.extend(coord),
        new mapboxgl.LngLatBounds(coordinates[0], coordinates[0])
      )

      map.fitBounds(bounds, {
        padding: 50,
        duration: 300
      })

      // Clear route line
      const source = map.getSource('route') as mapboxgl.GeoJSONSource
      if (source) {
        source.setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: []
          }
        })
      }
    } else {
      // No waypoints - clear route line
      console.log('🟣 [MAP] No waypoints, clearing route')
      const source = map.getSource('route') as mapboxgl.GeoJSONSource
      if (source) {
        source.setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: []
          }
        })
      }
    }
  }, [waypoints, routeGeometry, onUpdateWaypoint])

  return <div id="map" ref={mapContainerRef} className="w-full h-full" />
}
