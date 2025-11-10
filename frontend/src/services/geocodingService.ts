export interface LocationDetails {
  city: string;
  street: string;
  fullName: string;
}

export interface ForwardGeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
}

export const geocodingService = {
  /**
   * Reverse geocode coordinates to get location name with city and street
   * Uses Nominatim API (free, no API key required)
   * @param lat Latitude
   * @param lng Longitude
   * @returns Human-readable location name in "City, Street" format
   */
  async reverseGeocode(lat: number, lng: number): Promise<string> {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?` +
        `format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'TripCalculate/1.0', // Required by Nominatim
          },
        }
      );

      if (!response.ok) {
        console.warn('Geocoding failed, using coordinates');
        return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      }

      const data = await response.json();
      const address = data.address;

      // Extract city (try multiple fields for best coverage)
      const city =
        address.city ||
        address.town ||
        address.village ||
        address.municipality ||
        address.county ||
        address.state ||
        'Unknown Location';

      // Extract street/location
      const street =
        address.road ||
        address.suburb ||
        address.neighbourhood ||
        address.hamlet ||
        address.pedestrian ||
        address.residential ||
        '';

      // Create full name in "City, Street" format
      if (!street || street === city) {
        // If no street or street equals city, just return city
        return city;
      }

      return `${city}, ${street}`;
    } catch (error) {
      console.error('Geocoding error:', error);
      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
  },

  /**
   * Forward geocoding: Convert address to coordinates
   * @param address Address or place name to search for
   * @returns Coordinates and display name, or null if not found
   */
  async forwardGeocode(address: string): Promise<ForwardGeocodeResult | null> {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?` +
        `format=json&q=${encodeURIComponent(address)}&limit=1&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'TripCalculate/1.0',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Geocoding failed');
      }

      const data = await response.json();

      if (data.length === 0) {
        return null; // No results found
      }

      const result = data[0];

      return {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        displayName: result.display_name,
      };
    } catch (error) {
      console.error('Forward geocoding error:', error);
      return null;
    }
  },
};
