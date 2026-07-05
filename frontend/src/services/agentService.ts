import type { AgentTripData } from '../types';

// Spring Boot proxy endpoint in front of the Python LangGraph agent
const AI_INSIGHTS_ENDPOINT = '/api/ai/insights';

// Client-side cache for recent requests (sessionStorage)
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_KEY_PREFIX = 'ai_cache_';

// Debouncing state
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 2000; // 2 seconds

// Types mirroring the agent's ParseRouteResponse schema (agent/app/schema.py)
interface AgentWaypoint {
  positionOrder: number;
  name: string;
  latitude: number;
  longitude: number;
}

interface AgentRouteResponse {
  success: boolean;
  route: {
    waypoints: AgentWaypoint[];
    settings: {
      fuelConsumption?: number;
      fuelCostPerLiter?: number;
      currency?: string;
      passengers?: number;
    };
  };
  message?: string;
  error?: string;
  skippedLocations?: { name: string; reason?: string }[];
}

/** A waypoint already on the user's map, sent so the agent can apply
 * modification requests ("add a stop in X") to the existing route. */
export interface CurrentRouteWaypoint {
  name: string;
  latitude: number;
  longitude: number;
}

export interface AgentParseResult {
  data: AgentTripData | null;
  /** Agent-provided reason when data is null (already localized by the agent). */
  error?: string;
}

/**
 * Sends a natural language query to the backend AI proxy and returns structured trip data.
 * Includes client-side caching and debouncing for better UX.
 * @param query The user's natural language input (e.g. "Trip to Paris")
 * @param language Language code (default: 'en')
 * @param currentRoute Waypoints already on the map — included so the agent can merge modifications
 * @returns Structured trip data, or null data with the agent's error message
 */
export const parseRouteWithAgent = async (
  query: string,
  language: string = 'en',
  currentRoute: CurrentRouteWaypoint[] = [],
): Promise<AgentParseResult> => {
  // Debounce: Prevent too-frequent requests
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL_MS) {
    const waitTime = MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest;
    console.log(`Debouncing: waiting ${waitTime}ms before next request`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  lastRequestTime = Date.now();

  // Check client-side cache first — only for from-scratch requests; a
  // modification answer is specific to the route it was asked against
  const cacheable = currentRoute.length === 0;
  const cacheKey = generateCacheKey(query, language);
  if (cacheable) {
    const cachedData = getCachedResponse(cacheKey);
    if (cachedData) {
      console.log('Using cached AI response (client-side)');
      return { data: cachedData };
    }
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
      body: JSON.stringify({
        message: query,
        language,
        ...(currentRoute.length > 0 ? { currentRoute } : {}),
      }),
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

    // Check backend cache header (set by AiInsightsController)
    const cacheStatus = response.headers.get('X-Cache-Status');
    if (cacheStatus) {
      console.log(`Backend cache: ${cacheStatus}`);
    }

    const data: AgentRouteResponse = Array.isArray(rawData) ? rawData[0] : rawData;

    if (!data.success || !data.route || !data.route.waypoints) {
      console.warn("Agent response missing route data", data.error ?? data);
      // Surface the agent's reason (e.g. the off-topic guard message)
      // instead of collapsing every failure into one generic toast
      return { data: null, error: typeof data.error === 'string' ? data.error : undefined };
    }

    const waypoints = data.route.waypoints.sort((a, b) => a.positionOrder - b.positionOrder);

    const result: AgentTripData = {};

    // Map Settings
    if (data.route.settings) {
      if (data.route.settings.fuelConsumption) result.consumption = data.route.settings.fuelConsumption;
      if (data.route.settings.fuelCostPerLiter) result.price = data.route.settings.fuelCostPerLiter;
      if (data.route.settings.currency) result.currency = data.route.settings.currency;
      if (data.route.settings.passengers) result.passengers = data.route.settings.passengers;
    }

    // Surface locations the agent had to skip so the UI can tell the user
    if (data.skippedLocations && data.skippedLocations.length > 0) {
      result.skippedLocations = data.skippedLocations;
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
    if (cacheable) {
      cacheResponse(cacheKey, result);
    }

    return { data: result };

  } catch (error) {
    console.error('Failed to plan trip with AI:', error);
    // Re-throw rate limit errors so they can be displayed to the user
    if (error instanceof Error && error.message.includes('Rate limit exceeded')) {
      throw error;
    }
    return { data: null };
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
function getCachedResponse(cacheKey: string): AgentTripData | null {
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
function cacheResponse(cacheKey: string, data: AgentTripData): void {
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
