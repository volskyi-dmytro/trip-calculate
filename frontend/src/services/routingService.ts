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

export const routingService = {
  /**
   * Calculate road-based route between waypoints using OSRM
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

    try {
      // Build OSRM API URL
      const coordinates = waypoints
        .map(w => `${w.lng},${w.lat}`)
        .join(';');

      const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=true`;

      console.log('🗺️ Requesting route from OSRM:', url);

      const response = await fetch(url);

      if (!response.ok) {
        console.error('❌ OSRM API returned error:', response.status, response.statusText);
        throw new Error(`Routing API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
        console.error('❌ OSRM returned no routes:', data);
        throw new Error('No route found between waypoints');
      }

      const route = data.routes[0];
      console.log('✅ Route found! Distance:', (route.distance / 1000).toFixed(2), 'km, Duration:', (route.duration / 60).toFixed(0), 'min');

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
      console.error('❌ Routing service error:', error);
      // Fallback to straight lines if routing fails
      console.warn('⚠️ Falling back to straight-line rendering');
      return {
        totalDistance: 0,
        totalDuration: 0,
        geometry: waypoints.map(w => [w.lat, w.lng] as [number, number]),
        segments: [],
      };
    }
  },
};
