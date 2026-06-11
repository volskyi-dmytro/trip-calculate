// AI and Chat-related types

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
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
}
