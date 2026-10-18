export interface RouteSegment {
  distance: number; // in meters
  duration: number; // in seconds
  geometry: Array<[number, number]>; // lat/lng pairs for the route line
}

/** How far a distance/duration can be trusted. road = provider route;
 *  approximate = straight-line estimate after an outage; unavailable = there is
 *  nothing honest to show (no route, or not calculated). */
export type EstimateQuality = 'road' | 'approximate' | 'unavailable';

export interface RoutingResult {
  totalDistance: number; // in km
  totalDuration: number; // in minutes
  geometry: Array<[number, number]>; // lat/lng pairs
  segments: RouteSegment[];
  /** No drivable road connects the waypoints (e.g. another continent).
   *  Distinct from an outage: there is nothing honest to estimate. */
  noRoute?: boolean;
  quality: EstimateQuality;
  /** Who produced the figures: a provider name or "straight-line". */
  source: string;
  calculatedAt: string; // ISO-8601
}

// Use backend proxy for routing to avoid CORS and timeout issues with public OSRM servers
import { api } from './api';

const result = (
  quality: EstimateQuality,
  source: string,
  rest: Omit<RoutingResult, 'quality' | 'source' | 'calculatedAt'>,
): RoutingResult => ({ ...rest, quality, source, calculatedAt: new Date().toISOString() });

export const routingService = {
  /**
   * Calculate road-based route between waypoints using backend routing proxy
   * @param waypoints Array of waypoints with lat/lng coordinates
   * @returns Route geometry and statistics
   */
  async getRoute(waypoints: Array<{ lat: number; lng: number }>): Promise<RoutingResult> {
    if (waypoints.length < 2) {
      return result('unavailable', 'none', { totalDistance: 0, totalDuration: 0, geometry: [], segments: [] });
    }

    try {
      const response = await api.post('/api/routing/calculate', { waypoints });
      const data = response.data;

      if (data.noRoute) {
        return result('unavailable', 'none', {
          totalDistance: 0, totalDuration: 0, geometry: [], segments: [], noRoute: true,
        });
      }

      if (data.error || data.fallback) {
        throw new Error(data.message || 'Routing service unavailable');
      }

      const geometry: Array<[number, number]> = data.geometry.map(
        (coord: [number, number]) => [coord[0], coord[1]] as [number, number]
      );

      // A zero distance with geometry is the server's straight-line fallback, not a road route.
      if (!(data.totalDistance > 0)) {
        return result('approximate', 'straight-line', {
          totalDistance: 0, totalDuration: 0, geometry, segments: [],
        });
      }

      return result('road', typeof data.provider === 'string' ? data.provider : 'road-router', {
        totalDistance: data.totalDistance,
        totalDuration: data.totalDuration,
        geometry,
        segments: data.segments || [],
      });
    } catch (error) {
      console.error('[ROUTING] Backend routing failed, falling back to straight lines:', error);

      return result('approximate', 'straight-line', {
        totalDistance: 0,
        totalDuration: 0,
        geometry: waypoints.map(w => [w.lat, w.lng] as [number, number]),
        segments: [],
      });
    }
  },
};
