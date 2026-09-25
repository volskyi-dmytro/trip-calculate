import type { FuelType } from './carCatalog';

// Labels live in src/i18n/common.ts under `carPreset.<id>`.
export interface CarPreset {
  id: 'city' | 'sedan' | 'crossover' | 'suv' | 'minivan';
  consumption: Record<FuelType, number>;
}

export const CAR_PRESETS: CarPreset[] = [
  { id: 'city',      consumption: { petrol: 5.5,  diesel: 4.5, lpg: 6.5 } },
  { id: 'sedan',     consumption: { petrol: 7.5,  diesel: 6.0, lpg: 8.5 } },
  { id: 'crossover', consumption: { petrol: 8.5,  diesel: 7.0, lpg: 9.5 } },
  { id: 'suv',       consumption: { petrol: 11.0, diesel: 9.0, lpg: 12.5 } },
  { id: 'minivan',   consumption: { petrol: 10.5, diesel: 8.5, lpg: 12.0 } },
];
