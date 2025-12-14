import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Waypoint } from './RoutePlanner'

// Fix for default marker icons in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

interface MapContainerProps {
  waypoints: Waypoint[]
  routeGeometry: Array<[number, number]>
  onAddWaypoint: (lat: number, lng: number) => void
  onUpdateWaypoint: (id: string, lat: number, lng: number) => void
}

export function MapContainer({ waypoints, routeGeometry, onAddWaypoint, onUpdateWaypoint }: MapContainerProps) {
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
  const polylineRef = useRef<L.Polyline | null>(null)
  // Use ref to store callback to avoid map re-initialization on language change (Issue #2 fix)
  const onAddWaypointRef = useRef(onAddWaypoint)

  // Update callback ref when it changes
  useEffect(() => {
    onAddWaypointRef.current = onAddWaypoint
  }, [onAddWaypoint])

  // Initialize map ONCE - never re-run this effect (Issue #2 fix)
  useEffect(() => {
    if (!mapRef.current) {
      const map = L.map('map').setView([50.4501, 30.5234], 6) // Center on Ukraine

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map)

      // Add click handler using ref to avoid re-initialization
      map.on('click', (e) => {
        onAddWaypointRef.current(e.latlng.lat, e.latlng.lng)
      })

      mapRef.current = map
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, []) // Empty dependency array - only run once

  // Update markers and route line (Issue #2 & #3 fix: Properly handle language changes and route loading)
  useEffect(() => {
    console.log('🟣 [MAP] Effect triggered - waypoints:', waypoints.length, 'geometry points:', routeGeometry.length);

    if (!mapRef.current) {
      console.warn('⚠️ [MAP] Map not initialized yet');
      return;
    }

    const map = mapRef.current

    // Ensure map is properly sized (important when becoming visible)
    setTimeout(() => {
      map.invalidateSize()
    }, 100)

    // Remove markers that no longer exist
    markersRef.current.forEach((marker, id) => {
      if (!waypoints.find(wp => wp.id === id)) {
        marker.remove()
        markersRef.current.delete(id)
      }
    })

    // Add or update markers
    console.log('🟣 [MAP] Updating', waypoints.length, 'markers');
    waypoints.forEach((waypoint, index) => {
      let marker = markersRef.current.get(waypoint.id)

      if (!marker) {
        // Create custom icon with number
        const icon = L.divIcon({
          html: `<div style="background-color: #3b82f6; color: white; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">${index + 1}</div>`,
          className: 'custom-marker',
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        })

        marker = L.marker([waypoint.lat, waypoint.lng], {
          icon,
          draggable: true,
        }).addTo(map)

        marker.bindPopup(waypoint.name)

        // Handle marker drag
        marker.on('dragend', () => {
          const pos = marker!.getLatLng()
          onUpdateWaypoint(waypoint.id, pos.lat, pos.lng)
        })

        markersRef.current.set(waypoint.id, marker)
        console.log('🟣 [MAP] Created new marker', index + 1, 'at', waypoint.lat, waypoint.lng);
      } else {
        // Update existing marker position and icon
        marker.setLatLng([waypoint.lat, waypoint.lng])

        const icon = L.divIcon({
          html: `<div style="background-color: #3b82f6; color: white; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">${index + 1}</div>`,
          className: 'custom-marker',
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        })

        marker.setIcon(icon)
        marker.setPopupContent(waypoint.name)
        console.log('🟣 [MAP] Updated existing marker', index + 1);
      }
    })

    // Update route line - use road-based geometry if available
    if (polylineRef.current) {
      console.log('🟣 [MAP] Removing existing polyline');
      polylineRef.current.remove()
      polylineRef.current = null
    }

    if (routeGeometry.length > 0) {
      console.log('🟣 [MAP] Creating polyline with', routeGeometry.length, 'points');
      console.log('🟣 [MAP] First 5 points:', routeGeometry.slice(0, 5));
      console.log('🟣 [MAP] Last 5 points:', routeGeometry.slice(-5));

      polylineRef.current = L.polyline(routeGeometry, {
        color: '#3b82f6',
        weight: 4,
        opacity: 0.7,
      }).addTo(map)

      console.log('✅ [MAP] Polyline added to map');

      // Fit bounds to show all waypoints (Issue #3 fix: Ensure proper zoom)
      setTimeout(() => {
        if (polylineRef.current) {
          const bounds = polylineRef.current.getBounds();
          console.log('🟣 [MAP] Fitting map to polyline bounds:', bounds);
          map.fitBounds(bounds, { padding: [50, 50] });
        }
      }, 150)
    } else if (waypoints.length === 1) {
      console.log('🟣 [MAP] Single waypoint, centering map');
      map.setView([waypoints[0].lat, waypoints[0].lng], 10)
    } else if (waypoints.length > 1) {
      // If we have waypoints but no geometry yet, fit to waypoint bounds
      console.log('🟣 [MAP] Multiple waypoints but no geometry, fitting to waypoint bounds');
      const bounds = L.latLngBounds(waypoints.map(wp => [wp.lat, wp.lng]))
      setTimeout(() => {
        map.fitBounds(bounds, { padding: [50, 50] })
      }, 150)
    } else {
      console.log('🟣 [MAP] No waypoints or geometry to display');
    }
  }, [waypoints, routeGeometry, onUpdateWaypoint])

  return <div id="map" className="w-full h-full" />
}
