export interface GeocodingResult {
  name: string;
  city?: string;
  town?: string;
  village?: string;
  suburb?: string;
  county?: string;
  state?: string;
  country?: string;
}

export const geocodingService = {
  /**
   * Reverse geocode coordinates to get location name
   * Uses Nominatim API (free, no API key required)
   * @param lat Latitude
   * @param lng Longitude
   * @returns Human-readable location name
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

      // Extract best name from address components
      const address = data.address;
      const name =
        address.road ||
        address.suburb ||
        address.village ||
        address.town ||
        address.city ||
        address.county ||
        address.state ||
        data.display_name ||
        `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

      return name;
    } catch (error) {
      console.error('Geocoding error:', error);
      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
  },
};
