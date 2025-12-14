/**
 * Coordinate Helper Utilities
 *
 * Leaflet uses [lat, lng] format (latitude first)
 * Mapbox uses [lng, lat] format (longitude first)
 *
 * These helpers convert between the two formats to ensure compatibility
 * during the Leaflet → Mapbox GL JS migration.
 */

export type LeafletCoordinate = [number, number]; // [lat, lng]
export type MapboxCoordinate = [number, number];  // [lng, lat]

/**
 * Convert Leaflet coordinate format [lat, lng] to Mapbox format [lng, lat]
 * @param coord - Leaflet coordinate [lat, lng]
 * @returns Mapbox coordinate [lng, lat]
 */
export const leafletToMapbox = ([lat, lng]: LeafletCoordinate): MapboxCoordinate => {
  return [lng, lat];
};

/**
 * Convert Mapbox coordinate format [lng, lat] to Leaflet format [lat, lng]
 * @param coord - Mapbox coordinate [lng, lat]
 * @returns Leaflet coordinate [lat, lng]
 */
export const mapboxToLeaflet = ([lng, lat]: MapboxCoordinate): LeafletCoordinate => {
  return [lat, lng];
};

/**
 * Convert array of Leaflet coordinates to Mapbox coordinates
 * @param coords - Array of Leaflet coordinates [[lat, lng], ...]
 * @returns Array of Mapbox coordinates [[lng, lat], ...]
 */
export const leafletArrayToMapbox = (coords: LeafletCoordinate[]): MapboxCoordinate[] => {
  return coords.map(leafletToMapbox);
};

/**
 * Convert array of Mapbox coordinates to Leaflet coordinates
 * @param coords - Array of Mapbox coordinates [[lng, lat], ...]
 * @returns Array of Leaflet coordinates [[lat, lng], ...]
 */
export const mapboxArrayToLeaflet = (coords: MapboxCoordinate[]): LeafletCoordinate[] => {
  return coords.map(mapboxToLeaflet);
};
