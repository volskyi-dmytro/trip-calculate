// A geocoder (ours or the AI's own) can fail and fall back to raw
// coordinates as the "name" — e.g. "50.74507, 25.32008". That's never a
// name a rider should see; detect it and swap in a fallback label instead.
const COORDINATE_LIKE = /^-?\d{1,3}(\.\d+)?,\s*-?\d{1,3}(\.\d+)?$/

export function isCoordinateLikeName(name: string): boolean {
  return COORDINATE_LIKE.test(name.trim())
}

export function displayWaypointName(name: string, fallback: string): string {
  return isCoordinateLikeName(name) ? fallback : name
}
