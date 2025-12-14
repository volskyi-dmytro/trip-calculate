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
    console.log('🔵 [ROUTING] Starting route calculation for waypoints:', waypoints.length);

    if (waypoints.length < 2) {
      console.log('🔵 [ROUTING] Less than 2 waypoints, returning empty route');
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

    console.log('🔵 [ROUTING] Coordinates string:', coordinates);
    console.log('🔵 [ROUTING] Waypoints:', waypoints.map(w => ({ lat: w.lat, lng: w.lng })));

    // Try each OSRM server with retry logic
    for (let serverIndex = 0; serverIndex < OSRM_SERVERS.length; serverIndex++) {
      const baseUrl = OSRM_SERVERS[serverIndex];
      const url = `${baseUrl}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=true`;

      console.log(`🔵 [ROUTING] Attempting route from OSRM server ${serverIndex + 1}/${OSRM_SERVERS.length}:`, baseUrl);
      console.log(`🔵 [ROUTING] Full URL:`, url);

      try {
        // Fetch with 10 second timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        console.log(`🔵 [ROUTING] Sending fetch request to server ${serverIndex + 1}...`);
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
          }
        });

        clearTimeout(timeoutId);

        console.log(`🔵 [ROUTING] Response received from server ${serverIndex + 1}:`, {
          status: response.status,
          ok: response.ok,
          statusText: response.statusText
        });

        if (!response.ok) {
          console.warn(`⚠️ [ROUTING] Server ${serverIndex + 1} returned ${response.status}, trying next...`);
          continue; // Try next server
        }

        const data = await response.json();
        console.log(`🔵 [ROUTING] Response data from server ${serverIndex + 1}:`, data);

        if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
          console.warn(`⚠️ [ROUTING] Server ${serverIndex + 1} returned no routes (code: ${data.code}), trying next...`);
          continue; // Try next server
        }

        const route = data.routes[0];
        console.log(`🔵 [ROUTING] Route data from server ${serverIndex + 1}:`, {
          distance: route.distance,
          duration: route.duration,
          hasGeometry: !!route.geometry,
          geometryType: route.geometry?.type,
          coordinatesCount: route.geometry?.coordinates?.length
        });

        if (!route.geometry || !route.geometry.coordinates) {
          console.error(`❌ [ROUTING] Server ${serverIndex + 1} returned route WITHOUT geometry!`);
          continue;
        }

        console.log(`✅ [ROUTING] Route found from server ${serverIndex + 1}! Distance:`, (route.distance / 1000).toFixed(2), 'km, Duration:', (route.duration / 60).toFixed(0), 'min');
        console.log(`✅ [ROUTING] Geometry type:`, route.geometry.type);
        console.log(`✅ [ROUTING] Coordinates count:`, route.geometry.coordinates.length);
        console.log(`✅ [ROUTING] First 5 coordinates (GeoJSON [lng,lat]):`, route.geometry.coordinates.slice(0, 5));

        // Convert GeoJSON coordinates [lng, lat] to [lat, lng] for Leaflet
        const geometry: Array<[number, number]> = route.geometry.coordinates.map(
          (coord: [number, number]) => [coord[1], coord[0]]
        );

        console.log(`✅ [ROUTING] First 5 coordinates (Leaflet [lat,lng]):`, geometry.slice(0, 5));
        console.log(`✅ [ROUTING] Total geometry points:`, geometry.length);

        // Extract segments
        const segments: RouteSegment[] = route.legs.map((leg: { distance: number; duration: number; steps: { geometry: { coordinates: Array<[number, number]> } }[] }) => ({
          distance: leg.distance,
          duration: leg.duration,
          geometry: leg.steps.flatMap((step: { geometry: { coordinates: Array<[number, number]> } }) =>
            step.geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]] as [number, number])
          ),
        }));

        const result = {
          totalDistance: route.distance / 1000, // convert meters to km
          totalDuration: route.duration / 60, // convert seconds to minutes
          geometry,
          segments,
        };

        console.log(`✅ [ROUTING] Returning successful result:`, {
          totalDistance: result.totalDistance,
          totalDuration: result.totalDuration,
          geometryPoints: result.geometry.length
        });

        return result;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          console.error(`❌ [ROUTING] Server ${serverIndex + 1} timed out after 10s, trying next...`);
        } else {
          console.error(`❌ [ROUTING] Server ${serverIndex + 1} error:`, error, 'trying next...');
        }
        // Continue to next server
      }
    }

    // All servers failed - fallback to straight lines
    console.error('❌ [ROUTING] All routing servers failed. Using straight-line fallback.');
    console.error('❌ [ROUTING] Fallback geometry (straight lines):', waypoints.map(w => [w.lat, w.lng]));
    return {
      totalDistance: 0,
      totalDuration: 0,
      geometry: waypoints.map(w => [w.lat, w.lng] as [number, number]),
      segments: [],
    };
  },
};
