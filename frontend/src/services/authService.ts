import { api, fetchCsrfToken } from './api';
import type { UserResponse } from '../types';

export const authService = {
  getCurrentUser: async (): Promise<UserResponse> => {
    const response = await api.get<UserResponse>('/api/user/me');
    return response.data;
  },

  checkStatus: async (): Promise<boolean> => {
    try {
      const response = await api.get('/api/user/status');
      return response.data.authenticated;
    } catch {
      return false;
    }
  },

  logout: async (): Promise<void> => {
    try {
      // Get CSRF token
      const token = await fetchCsrfToken();

      if (!token) {
        console.error('No CSRF token available');
        window.location.href = '/';
        return;
      }

      // Create form data with CSRF token
      const formData = new FormData();
      formData.append('_csrf', token);

      // Call logout endpoint
      await api.post('/logout', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      // Redirect to homepage
      window.location.href = '/';
    } catch (error) {
      console.error('Logout error:', error);
      // Fallback: redirect to homepage
      window.location.href = '/';
    }
  },
};
