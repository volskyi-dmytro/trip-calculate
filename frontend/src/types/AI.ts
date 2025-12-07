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

// N8n Response Types
export interface N8nTripData {
  // Text fallbacks
  originName?: string;
  destinationName?: string;

  // Pre-geocoded locations from n8n
  originLocation?: Location;
  destinationLocation?: Location;

  // Intermediate stops
  waypoints?: Location[];

  passengers?: number;
  consumption?: number;
  price?: number;
  currency?: string;
}

// Gemini Insights Response
export interface InsightResponse {
  content: string;
  suggestedStops: string[];
}
