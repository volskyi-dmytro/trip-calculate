import { nominatimFetch } from './nominatimQueue'
import { isCoordinateLikeName } from '../utils/waypointName'

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

export interface Place extends ForwardGeocodeResult {
  /** Short label for the waypoint (Nominatim `name`), e.g. "Ternopil". */
  name: string;
  addressType: string;
}

const REGION_TYPES = new Set(['state', 'region', 'province', 'state_district', 'county', 'country']);
const SETTLEMENT_TYPES = new Set(['city', 'town', 'village', 'hamlet', 'municipality']);

export const geocodingService = {
  /**
   * Reverse geocode coordinates to get location name with city and street
   * Uses Nominatim API (free, no API key required)
   * @param lat Latitude
   * @param lng Longitude
   * @param language UI language for the returned place names
   * @returns Human-readable location name in "City, Street" format
   */
  async reverseGeocode(lat: number, lng: number, language = 'en'): Promise<string> {
    try {
      const response = await nominatimFetch(
        `https://nominatim.openstreetmap.org/reverse?` +
        `format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=${encodeURIComponent(language)}`,
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
   * Up to 5 candidate places for a free-text query, in the UI language. The planner shows
   * these as suggestions; `limit=1` used to hand back whatever Nominatim ranked first, which
   * for a bare city name is often the oblast or a rural hromada.
   */
  async searchPlaces(query: string, language = 'en', signal?: AbortSignal): Promise<Place[]> {
    try {
      const response = await nominatimFetch(
        `https://nominatim.openstreetmap.org/search?` +
        `format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1` +
        `&accept-language=${encodeURIComponent(language)}`,
        { headers: { 'User-Agent': 'TripCalculate/1.0' }, signal },
      );
      if (!response.ok) throw new Error('Geocoding failed');
      const data: Array<Record<string, string>> = await response.json();
      const seen = new Set<string>();
      return data
        .filter(r => !seen.has(r.display_name) && seen.add(r.display_name))
        .map(r => ({
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lon),
          displayName: r.display_name,
          name: r.name || r.display_name.split(',')[0],
          addressType: r.addresstype ?? '',
        }));
    } catch (error) {
      if ((error as Error).name !== 'AbortError') console.error('Place search error:', error);
      return [];
    }
  },

  /**
   * Forward geocoding for "Enter without picking a suggestion": the top hit, except that a
   * region-sized top hit (oblast/county) yields to the first settlement, since the user typed a place to drive to.
   */
  async forwardGeocode(address: string, language = 'en'): Promise<ForwardGeocodeResult | null> {
    const places = await geocodingService.searchPlaces(address, language);
    if (places.length === 0) return null;
    const best = REGION_TYPES.has(places[0].addressType)
      ? places.find(p => SETTLEMENT_TYPES.has(p.addressType)) ?? places[0]
      : places[0];
    return { lat: best.lat, lng: best.lng, displayName: best.displayName };
  },

  /**
   * Name for a saved waypoint whose stored name is just coordinates. Successful lookups are
   * cached per ~100 m cell so reopening routes doesn't re-hit Nominatim; null means "keep the coordinates".
   */
  async resolveCoordinateName(lat: number, lng: number, language = 'en'): Promise<string | null> {
    const key = `${language}:${lat.toFixed(3)},${lng.toFixed(3)}`;
    const hit = resolvedNames.get(key);
    if (hit) return hit;
    const name = await geocodingService.reverseGeocode(lat, lng, language);
    if (isCoordinateLikeName(name)) return null; // geocoder fell back to coordinates
    resolvedNames.set(key, name);
    return name;
  },
};

const resolvedNames = new Map<string, string>();
