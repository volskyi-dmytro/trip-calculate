import axios from 'axios';

const rawBaseUrl = (import.meta.env.VITE_API_URL || '').trim();
const trimmedBaseUrl = rawBaseUrl.replace(/\/+$/, '');

export const API_BASE_URL = trimmedBaseUrl;

export const api = axios.create({
  baseURL: trimmedBaseUrl || undefined,
  withCredentials: true, // CRITICAL: Include cookies for session
  headers: {
    'Content-Type': 'application/json',
  },
});

// CSRF token storage
let csrfToken: string | null = null;

export const fetchCsrfToken = async (): Promise<string | null> => {
  try {
    const response = await api.get('/api/user/csrf');
    csrfToken = response.data.token;
    return csrfToken;
  } catch (error) {
    console.error('Failed to fetch CSRF token:', error);
    return null;
  }
};

// Add CSRF token to POST, PUT, DELETE requests
api.interceptors.request.use(
  async (config) => {
    if (['post', 'put', 'delete'].includes(config.method?.toLowerCase() || '')) {
      if (!csrfToken) {
        await fetchCsrfToken();
      }
      if (csrfToken) {
        config.headers['X-CSRF-TOKEN'] = csrfToken;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle 401 errors (unauthorized)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // User is not authenticated
      console.log('User is not authenticated');
    }
    return Promise.reject(error);
  }
);
