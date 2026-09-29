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
  /** No drivable road connects the waypoints (e.g. another continent).
   *  Distinct from an outage: there is nothing honest to estimate. */
  noRoute?: boolean;
}

// Use backend proxy for routing to avoid CORS and timeout issues with public OSRM servers
import { api } from './api';

export const routingService = {
  /**
   * Calculate road-based route between waypoints using backend routing proxy
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

    console.log('🔵 [ROUTING] Waypoints:', waypoints.map(w => ({ lat: w.lat, lng: w.lng })));

    try {
      console.log('🔵 [ROUTING] Calling backend routing API...');
      const response = await api.post('/api/routing/calculate', { waypoints });
      const data = response.data;

      console.log('🔵 [ROUTING] Response from backend:', data);

      if (data.noRoute) {
        return { totalDistance: 0, totalDuration: 0, geometry: [], segments: [], noRoute: true };
      }

      if (data.error || data.fallback) {
        console.warn('⚠️ [ROUTING] Backend returned fallback/error response');
        throw new Error(data.message || 'Routing service unavailable');
      }

      const geometry: Array<[number, number]> = data.geometry.map(
        (coord: [number, number]) => [coord[0], coord[1]] as [number, number]
      );

      console.log(`✅ [ROUTING] Route found! Distance:`, data.totalDistance.toFixed(2), 'km, Duration:', data.totalDuration.toFixed(0), 'min');
      console.log(`✅ [ROUTING] Coordinates count:`, geometry.length);
      console.log(`✅ [ROUTING] First 5 coordinates:`, geometry.slice(0, 5));

      return {
        totalDistance: data.totalDistance,
        totalDuration: data.totalDuration,
        geometry,
        segments: data.segments || [],
      };
    } catch (error) {
      console.error('❌ [ROUTING] Backend routing failed:', error);
      console.error('❌ [ROUTING] Falling back to straight lines');

      // Fallback to straight lines
      return {
        totalDistance: 0,
        totalDuration: 0,
        geometry: waypoints.map(w => [w.lat, w.lng] as [number, number]),
        segments: [],
      };
    }
  },
};
