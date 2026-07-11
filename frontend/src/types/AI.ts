// AI and Chat-related types

import type { WeatherData } from './weather'

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  // 'result' renders as the TripResultCard in the planner chat; content
  // stays as the plain-text fallback for renderers that don't know kinds
  kind?: 'text' | 'result';
}

export interface Location {
  lat: number;
  lon: number;
  display_name: string;
}

// Structured trip data extracted by the LangGraph agent (via /api/ai/insights)
export interface AgentTripData {
  // Text fallbacks
  originName?: string;
  destinationName?: string;

  // Pre-geocoded locations from the agent
  originLocation?: Location;
  destinationLocation?: Location;

  // Intermediate stops
  waypoints?: Location[];

  passengers?: number;
  consumption?: number;
  price?: number;
  currency?: string;

  // Locations the agent could not geocode (even after its retry pass)
  skippedLocations?: { name: string; reason?: string }[];

  // Live fuel-price advisory from the agent's fuel tool. Shape mirrors
  // services/fuelPriceService.ts's FuelSuggestion — redeclared inline here
  // (rather than imported) to avoid a types -> services -> components -> types cycle.
  fuelData?: {
    price: number;
    currency: string;
    stale: boolean;
    fetchedAt: string;
    source: string;
  };

  // ISO YYYY-MM-DD departure date the agent parsed from chat (valid,
  // not in the past). Absent = user didn't mention one = keep current.
  departureDate?: string;

  // Advisory corridor forecast from the agent's weather tool
  weatherData?: WeatherData;
}
