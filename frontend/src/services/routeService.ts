import { api } from './api';

const API_BASE = '/api/routes';

export interface Waypoint {
  id?: number;
  positionOrder: number;
  name: string;
  latitude: number;
  longitude: number;
}

export interface Route {
  id?: number;
  name: string;
  fuelConsumption: number;
  fuelCostPerLiter: number;
  currency: string;
  passengerCount?: number;
  totalDistance?: number;
  totalCost?: number;
  fuelType?: string;
  departureDate?: string; // YYYY-MM-DD
  totalDurationMinutes?: number;
  /** Server-computed provenance. 'legacy' = saved before provenance existed (straight-line totals). */
  distanceQuality?: 'road' | 'approximate' | 'legacy';
  distanceSource?: string;
  calculationVersion?: string;
  calculatedAt?: string;
  /** Optional: what the client displayed; the server verifies it and rejects mismatches. */
  snapshot?: { distanceKm: number; quality: 'road' | 'approximate' };
  waypoints: Waypoint[];
  createdAt?: string;
  updatedAt?: string;
  /** Update only: the updatedAt this edit started from; the server answers 409 ROUTE_CHANGED if the row moved on. */
  expectedUpdatedAt?: string;
}

export const routeService = {
  /**
   * Get all routes for the authenticated user
   */
  getUserRoutes: async (): Promise<Route[]> => {
    const response = await api.get(API_BASE);
    return response.data;
  },

  /**
   * Get a single route by ID
   */
  getRoute: async (id: number): Promise<Route> => {
    const response = await api.get(`${API_BASE}/${id}`);
    return response.data;
  },

  /**
   * Create a new route
   */
  createRoute: async (route: Route): Promise<Route> => {
    const response = await api.post(API_BASE, route);
    return response.data;
  },

  /**
   * Update an existing route
   */
  updateRoute: async (id: number, route: Route): Promise<Route> => {
    const response = await api.put(`${API_BASE}/${id}`, route);
    return response.data;
  },

  /**
   * Delete a route
   */
  deleteRoute: async (id: number): Promise<void> => {
    await api.delete(`${API_BASE}/${id}`);
  }
};
