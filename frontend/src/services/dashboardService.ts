import { api } from './api';

export interface UserProfile {
  id: number;
  email: string;
  name: string;
  displayName?: string;
  pictureUrl: string;
  createdAt: string;
  lastLogin: string;
  role: 'USER' | 'ADMIN';
  preferredLanguage: string;
  defaultFuelConsumption?: number;
  emailNotificationsEnabled: boolean;
  routePlannerAccess: boolean;
}

export interface UserStats {
  totalRoutes: number;
  totalWaypoints: number;
  totalDistance: number;
  totalFuelCost: number;
  accountAgeDays: number;
  mostUsedCurrency?: string;
}

export interface RouteListItem {
  id: number;
  name: string;
  waypointCount: number;
  totalDistance: number;
  totalCost: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserDashboard {
  profile: UserProfile;
  stats: UserStats;
  recentRoutes: RouteListItem[];
}

export interface UpdateProfileRequest {
  displayName?: string;
  preferredLanguage?: string;
  defaultFuelConsumption?: number;
  emailNotificationsEnabled?: boolean;
}

export const dashboardService = {
  /**
   * Get complete dashboard data
   */
  async getDashboard(): Promise<UserDashboard> {
    const response = await api.get('/api/user/dashboard');
    return response.data;
  },

  /**
   * Get user profile
   */
  async getProfile(): Promise<UserProfile> {
    const response = await api.get('/api/user/dashboard/profile');
    return response.data;
  },

  /**
   * Update user profile
   */
  async updateProfile(data: UpdateProfileRequest): Promise<UserProfile> {
    const response = await api.put('/api/user/dashboard/profile', data);
    return response.data;
  },

  /**
   * Get user statistics
   */
  async getStats(): Promise<UserStats> {
    const response = await api.get('/api/user/dashboard/stats');
    return response.data;
  },

  /**
   * Get user's routes
   */
  async getRoutes(limit: number = 20): Promise<RouteListItem[]> {
    const response = await api.get('/api/user/dashboard/routes', {
      params: { limit },
    });
    return response.data;
  },

  /**
   * Delete user account
   */
  async deleteAccount(): Promise<void> {
    await api.delete('/api/user/dashboard/account');
  },
};
