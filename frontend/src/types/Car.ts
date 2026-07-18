export type { FuelType } from '../utils/carCatalog';
import type { FuelType } from '../utils/carCatalog';

export interface CarSelection {
  name: string;
  makeModel: string | null;
  fuelType: FuelType;
  consumption: number; // L/100km
  source: 'catalog' | 'ai' | 'preset' | 'manual';
}

export interface GarageCar {
  id: number;
  name: string;
  makeModel: string | null;
  fuelType: FuelType;
  fuelConsumption: number;
  isDefault: boolean;
  source: string;
}
