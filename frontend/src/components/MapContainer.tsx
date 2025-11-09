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
  onAddWaypoint: (lat: number, lng: number) => void
  onUpdateWaypoint: (id: string, lat: number, lng: number) => void
}

export function MapContainer({ waypoints, onAddWaypoint, onUpdateWaypoint }: MapContainerProps) {
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
  const polylineRef = useRef<L.Polyline | null>(null)

  // Initialize map
  useEffect(() => {
    if (!mapRef.current) {
      const map = L.map('map').setView([50.4501, 30.5234], 6) // Center on Ukraine

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map)

      // Add click handler for adding waypoints
      map.on('click', (e) => {
        onAddWaypoint(e.latlng.lat, e.latlng.lng)
      })

      mapRef.current = map
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [onAddWaypoint])

  // Update markers and route line
  useEffect(() => {
    if (!mapRef.current) return

    const map = mapRef.current

    // Remove markers that no longer exist
    markersRef.current.forEach((marker, id) => {
      if (!waypoints.find(wp => wp.id === id)) {
        marker.remove()
        markersRef.current.delete(id)
      }
    })

    // Add or update markers
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
      }
    })

    // Update route line
    if (polylineRef.current) {
      polylineRef.current.remove()
      polylineRef.current = null
    }

    if (waypoints.length > 1) {
      const latLngs = waypoints.map(wp => [wp.lat, wp.lng] as [number, number])
      polylineRef.current = L.polyline(latLngs, {
        color: '#3b82f6',
        weight: 4,
        opacity: 0.7,
      }).addTo(map)

      // Fit bounds to show all waypoints
      map.fitBounds(polylineRef.current.getBounds(), { padding: [50, 50] })
    } else if (waypoints.length === 1) {
      map.setView([waypoints[0].lat, waypoints[0].lng], 10)
    }
  }, [waypoints, onUpdateWaypoint])

  return <div id="map" className="w-full h-full" />
}
