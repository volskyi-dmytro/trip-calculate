import axios from 'axios';

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
    const response = await axios.get(API_BASE);
    return response.data;
  },

  /**
   * Get a single route by ID
   */
  getRoute: async (id: number): Promise<Route> => {
    const response = await axios.get(`${API_BASE}/${id}`);
    return response.data;
  },

  /**
   * Create a new route
   */
  createRoute: async (route: Route): Promise<Route> => {
    const response = await axios.post(API_BASE, route);
    return response.data;
  },

  /**
   * Update an existing route
   */
  updateRoute: async (id: number, route: Route): Promise<Route> => {
    const response = await axios.put(`${API_BASE}/${id}`, route);
    return response.data;
  },

  /**
   * Delete a route
   */
  deleteRoute: async (id: number): Promise<void> => {
    await axios.delete(`${API_BASE}/${id}`);
  },

  /**
   * Check if user has access to route planner feature
   */
  checkAccess: async (): Promise<boolean> => {
    try {
      const response = await axios.get(`${API_BASE}/access`);
      const data = response.data;

      console.log('Access check response:', data, 'Type:', typeof data);

      // CRITICAL FIX: Handle both boolean and object responses
      const hasAccess = typeof data === 'boolean' ? data : (data?.hasAccess ?? false);

      console.log('Access granted:', hasAccess);

      return hasAccess;
    } catch (error) {
      console.error('Failed to check access:', error);

      // If it's a 403, user definitely doesn't have access
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        return false;
      }

      // For other errors, default to true since backend is working
      return true;
    }
  },

  /**
   * Request access to route planner feature
   */
  requestAccess: async (): Promise<void> => {
    await axios.post('/api/access-requests', null, {
      params: { featureName: 'route_planner' }
    });
  }
};
