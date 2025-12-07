import type { N8nTripData } from '../types';

// Get webhook URL from environment variables
const N8N_WEBHOOK_URL = import.meta.env.VITE_N8N_WEBHOOK_URL || '';

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
 * Sends a natural language query to the n8n webhook and returns structured trip data.
 * @param query The user's natural language input (e.g. "Trip to Paris")
 * @returns Structured trip data or null if the request fails
 */
export const planTripWithN8n = async (query: string): Promise<N8nTripData | null> => {
  if (!N8N_WEBHOOK_URL) {
    console.error('N8N_WEBHOOK_URL not configured. Please set VITE_N8N_WEBHOOK_URL in your .env.local file.');
    return null;
  }

  try {
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: query }),
    });

    if (!response.ok) {
      throw new Error(`N8n Error: ${response.status} ${response.statusText}`);
    }

    const rawData = await response.json();
    console.log("Raw N8n Response:", rawData);

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

    return result;

  } catch (error) {
    console.error('Failed to plan trip with AI:', error);
    return null;
  }
};
