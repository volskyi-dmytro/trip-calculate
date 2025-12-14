export interface RouteSegment {
  distance: number; // in meters
  duration: number; // in seconds
  geometry: Array<[number, number]>; // lat/lng pairs for the route line
}

export interface RoutingResult {
  totalDistance: number; // in km
  totalDuration: number; // in minutes
  geometry: Array<[number, number]>; // lat/lng pairs
  segments: RouteSegment[];
}

// Multiple OSRM server endpoints for redundancy
const OSRM_SERVERS = [
  'https://router.project-osrm.org',
  'https://routing.openstreetmap.de/routed-car',
];

export const routingService = {
  /**
   * Calculate road-based route between waypoints using OSRM with fallback servers
   * @param waypoints Array of waypoints with lat/lng coordinates
   * @returns Route geometry and statistics
   */
  async getRoute(waypoints: Array<{ lat: number; lng: number }>): Promise<RoutingResult> {
    if (waypoints.length < 2) {
      return {
        totalDistance: 0,
        totalDuration: 0,
        geometry: [],
        segments: [],
      };
    }

    // Build coordinates string (used for all providers)
    const coordinates = waypoints
      .map(w => `${w.lng},${w.lat}`)
      .join(';');

    // Try each OSRM server with retry logic
    for (let serverIndex = 0; serverIndex < OSRM_SERVERS.length; serverIndex++) {
      const baseUrl = OSRM_SERVERS[serverIndex];
      const url = `${baseUrl}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=true`;

      console.log(`🗺️ Attempting route from OSRM server ${serverIndex + 1}/${OSRM_SERVERS.length}:`, baseUrl);

      try {
        // Fetch with 10 second timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
          }
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          console.warn(`⚠️ Server ${serverIndex + 1} returned ${response.status}, trying next...`);
          continue; // Try next server
        }

        const data = await response.json();

        if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
          console.warn(`⚠️ Server ${serverIndex + 1} returned no routes, trying next...`);
          continue; // Try next server
        }

        const route = data.routes[0];
        console.log(`✅ Route found from server ${serverIndex + 1}! Distance:`, (route.distance / 1000).toFixed(2), 'km, Duration:', (route.duration / 60).toFixed(0), 'min');

        // Convert GeoJSON coordinates [lng, lat] to [lat, lng] for Leaflet
        const geometry: Array<[number, number]> = route.geometry.coordinates.map(
          (coord: [number, number]) => [coord[1], coord[0]]
        );

        // Extract segments
        const segments: RouteSegment[] = route.legs.map((leg: { distance: number; duration: number; steps: { geometry: { coordinates: Array<[number, number]> } }[] }) => ({
          distance: leg.distance,
          duration: leg.duration,
          geometry: leg.steps.flatMap((step: { geometry: { coordinates: Array<[number, number]> } }) =>
            step.geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]] as [number, number])
          ),
        }));

        return {
          totalDistance: route.distance / 1000, // convert meters to km
          totalDuration: route.duration / 60, // convert seconds to minutes
          geometry,
          segments,
        };
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          console.warn(`⚠️ Server ${serverIndex + 1} timed out after 10s, trying next...`);
        } else {
          console.warn(`⚠️ Server ${serverIndex + 1} error:`, error, 'trying next...');
        }
        // Continue to next server
      }
    }

    // All servers failed - fallback to straight lines
    console.error('❌ All routing servers failed. Using straight-line fallback.');
    return {
      totalDistance: 0,
      totalDuration: 0,
      geometry: waypoints.map(w => [w.lat, w.lng] as [number, number]),
      segments: [],
    };
  },
};
