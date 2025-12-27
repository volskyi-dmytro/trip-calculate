import type { N8nTripData } from '../types';

// Backend proxy endpoint (replaces direct n8n webhook URL)
const AI_INSIGHTS_ENDPOINT = '/api/ai/insights';

// Client-side cache for recent requests (sessionStorage)
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_KEY_PREFIX = 'ai_cache_';

// Debouncing state
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 2000; // 2 seconds

// Types defining the expected structure from the n8n "Format Final Response" node
interface N8nWaypoint {
  positionOrder: number;
  name: string;
  latitude: number;
  longitude: number;
}

interface N8nResponse {
  success: boolean;
  route: {
    waypoints: N8nWaypoint[];
    settings: {
      fuelConsumption?: number;
      fuelCostPerLiter?: number;
      currency?: string;
      passengers?: number;
    };
  };
  message?: string;
}

/**
 * Sends a natural language query to the backend AI proxy and returns structured trip data.
 * Includes client-side caching and debouncing for better UX.
 * @param query The user's natural language input (e.g. "Trip to Paris")
 * @param language Language code (default: 'en')
 * @returns Structured trip data or null if the request fails
 */
export const planTripWithN8n = async (query: string, language: string = 'en'): Promise<N8nTripData | null> => {
  // Debounce: Prevent too-frequent requests
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL_MS) {
    const waitTime = MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest;
    console.log(`Debouncing: waiting ${waitTime}ms before next request`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  lastRequestTime = Date.now();

  // Check client-side cache first
  const cacheKey = generateCacheKey(query, language);
  const cachedData = getCachedResponse(cacheKey);
  if (cachedData) {
    console.log('Using cached AI response (client-side)');
    return cachedData;
  }

  try {
    // Get CSRF token from cookie for Spring Security
    const csrfToken = getCsrfToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    // Add CSRF token header if available
    if (csrfToken) {
      headers['X-XSRF-TOKEN'] = csrfToken;
    }

    const response = await fetch(AI_INSIGHTS_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: query, language }),
      credentials: 'include', // Include cookies for authentication
    });

    if (!response.ok) {
      // Handle rate limiting
      if (response.status === 429) {
        const errorData = await response.json().catch(() => ({}));
        const resetTime = errorData.resetTime;
        const limitType = errorData.limitType || 'unknown';

        if (resetTime) {
          const resetDate = new Date(resetTime);
          const now = new Date();
          const minutesUntilReset = Math.ceil((resetDate.getTime() - now.getTime()) / 1000 / 60);
          throw new Error(`Rate limit exceeded. ${limitType} limit reached. Please try again in ${minutesUntilReset} minutes.`);
        }
        throw new Error('Rate limit exceeded. Please try again later.');
      }

      throw new Error(`AI service error: ${response.status} ${response.statusText}`);
    }

    const rawData = await response.json();
    console.log("Raw AI Response:", rawData);

    // Check for cache headers
    const cacheStatus = response.headers.get('X-Cache');
    if (cacheStatus) {
      console.log(`Backend cache: ${cacheStatus}`);
    }

    // Normalize data if it comes as an array (common in n8n execution data) or single object
    const data: N8nResponse = Array.isArray(rawData) ? rawData[0] : rawData;

    if (!data.route || !data.route.waypoints) {
      console.warn("N8n response missing route data", data);
      return null;
    }

    const waypoints = data.route.waypoints.sort((a, b) => a.positionOrder - b.positionOrder);

    const result: N8nTripData = {};

    // Map Settings
    if (data.route.settings) {
      if (data.route.settings.fuelConsumption) result.consumption = data.route.settings.fuelConsumption;
      if (data.route.settings.fuelCostPerLiter) result.price = data.route.settings.fuelCostPerLiter;
      if (data.route.settings.currency) result.currency = data.route.settings.currency;
      if (data.route.settings.passengers) result.passengers = data.route.settings.passengers;
    }

    // Map Locations (Origin = First, Destination = Last)
    if (waypoints.length > 0) {
      const start = waypoints[0];
      const end = waypoints[waypoints.length - 1];

      // Origin
      result.originName = start.name;
      result.originLocation = {
        display_name: start.name,
        lat: start.latitude,
        lon: start.longitude
      };

      // Destination (only if different from start or multiple points exist)
      if (waypoints.length > 1) {
        result.destinationName = end.name;
        result.destinationLocation = {
          display_name: end.name,
          lat: end.latitude,
          lon: end.longitude
        };
      }

      // Intermediate Waypoints (Indices 1 to Length-2)
      if (waypoints.length > 2) {
        result.waypoints = waypoints.slice(1, waypoints.length - 1).map(wp => ({
          display_name: wp.name,
          lat: wp.latitude,
          lon: wp.longitude
        }));
      }
    }

    // Cache the successful result (client-side)
    cacheResponse(cacheKey, result);

    return result;

  } catch (error) {
    console.error('Failed to plan trip with AI:', error);
    // Re-throw rate limit errors so they can be displayed to the user
    if (error instanceof Error && error.message.includes('Rate limit exceeded')) {
      throw error;
    }
    return null;
  }
};

/**
 * Get CSRF token from cookie for Spring Security
 */
function getCsrfToken(): string | null {
  const name = 'XSRF-TOKEN=';
  const decodedCookie = decodeURIComponent(document.cookie);
  const cookies = decodedCookie.split(';');

  for (let cookie of cookies) {
    cookie = cookie.trim();
    if (cookie.indexOf(name) === 0) {
      return cookie.substring(name.length);
    }
  }
  return null;
}

/**
 * Generate cache key from query and language
 * Uses Unicode-safe encoding to support all characters including Cyrillic
 */
function generateCacheKey(query: string, language: string): string {
  const normalized = query.toLowerCase().trim().replace(/\s+/g, ' ');
  // Use encodeURIComponent for Unicode safety, then btoa for base64 encoding
  const unicodeSafe = encodeURIComponent(normalized + '|' + language);
  return `${CACHE_KEY_PREFIX}${btoa(unicodeSafe)}`;
}

/**
 * Get cached response from sessionStorage
 */
function getCachedResponse(cacheKey: string): N8nTripData | null {
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (!cached) return null;

    const { data, timestamp } = JSON.parse(cached);
    const now = Date.now();

    // Check if cache is still valid
    if (now - timestamp > CACHE_TTL_MS) {
      sessionStorage.removeItem(cacheKey);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error reading from cache:', error);
    return null;
  }
}

/**
 * Cache response in sessionStorage
 */
function cacheResponse(cacheKey: string, data: N8nTripData): void {
  try {
    const cacheEntry = {
      data,
      timestamp: Date.now()
    };
    sessionStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
  } catch (error) {
    console.error('Error writing to cache:', error);
  }
}
