export interface ReceiptPayload {
  originLabel?: string;
  destinationLabel?: string;
  distanceKm: number;
  fuelConsumption: number;
  fuelPrice: number;
  currency: string;
  /** Total people splitting the cost, driver included. */
  people: number;
  locale: string;
  /** JSON-stringified array of [lat, lng] pairs (see downsampleGeometry). */
  routeGeometry?: string;
}

export interface Receipt {
  slug: string;
  originLabel: string | null;
  destinationLabel: string | null;
  distanceKm: number;
  fuelConsumption: number;
  fuelPrice: number;
  currency: string;
  people: number;
  totalCost: number;
  costPerPerson: number;
  locale: string;
  routeGeometry: string | null;
  createdAt: string;
  expiresAt: string | null;
  viewCount: number;
}
