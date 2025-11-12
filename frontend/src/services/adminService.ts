import { api } from './api';

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  newUsersLast24h: number;
  newUsersLast7d: number;
  newUsersLast30d: number;
  totalRoutes: number;
  totalWaypoints: number;
  pendingAccessRequests: number;
  usersWithRoutePlanner: number;
}

export interface UserManagement {
  id: number;
  email: string;
  name: string;
  displayName?: string;
  role: 'USER' | 'ADMIN';
  createdAt: string;
  lastLogin: string;
  routePlannerAccess: boolean;
  routeCount: number;
}

export interface AccessRequest {
  id: number;
  userId: number;
  userEmail: string;
  userName: string;
  featureName: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
  processedAt?: string;
  processedBy?: string;
}

export interface UpdateUserRoleRequest {
  role: 'USER' | 'ADMIN';
}

export const adminService = {
  /**
   * Get system-wide statistics
   */
  async getSystemStats(): Promise<AdminStats> {
    const response = await api.get('/api/admin/stats');
    return response.data;
  },

  /**
   * Get all users
   */
  async getAllUsers(): Promise<UserManagement[]> {
    const response = await api.get('/api/admin/users');
    return response.data;
  },

  /**
   * Get user details by ID
   */
  async getUserDetails(userId: number): Promise<UserManagement> {
    const response = await api.get(`/api/admin/users/${userId}`);
    return response.data;
  },

  /**
   * Update user role
   */
  async updateUserRole(
    userId: number,
    data: UpdateUserRoleRequest
  ): Promise<UserManagement> {
    const response = await api.put(`/api/admin/users/${userId}/role`, data);
    return response.data;
  },

  /**
   * Grant route planner access
   */
  async grantAccess(userId: number): Promise<void> {
    await api.post(`/api/admin/users/${userId}/grant-access`);
  },

  /**
   * Revoke route planner access
   */
  async revokeAccess(userId: number): Promise<void> {
    await api.post(`/api/admin/users/${userId}/revoke-access`);
  },

  /**
   * Delete user
   */
  async deleteUser(userId: number): Promise<void> {
    await api.delete(`/api/admin/users/${userId}`);
  },

  /**
   * Get all access requests
   */
  async getAllAccessRequests(): Promise<AccessRequest[]> {
    const response = await api.get('/api/admin/access-requests');
    return response.data;
  },

  /**
   * Get pending access requests
   */
  async getPendingAccessRequests(): Promise<AccessRequest[]> {
    const response = await api.get('/api/admin/access-requests/pending');
    return response.data;
  },

  /**
   * Approve access request
   */
  async approveAccessRequest(requestId: number): Promise<AccessRequest> {
    const response = await api.post(
      `/api/admin/access-requests/${requestId}/approve`
    );
    return response.data;
  },

  /**
   * Deny access request
   */
  async denyAccessRequest(requestId: number): Promise<AccessRequest> {
    const response = await api.post(
      `/api/admin/access-requests/${requestId}/deny`
    );
    return response.data;
  },
};
