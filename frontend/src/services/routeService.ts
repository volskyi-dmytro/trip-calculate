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
  waypoints: Waypoint[];
  createdAt?: string;
  updatedAt?: string;
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
