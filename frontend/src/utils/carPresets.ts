import type { FuelType } from './carCatalog';

export interface CarPreset {
  id: string;
  labelEn: string;
  labelUk: string;
  consumption: Record<FuelType, number>;
}

export const CAR_PRESETS: CarPreset[] = [
  { id: 'city',      labelEn: 'City car',        labelUk: 'Міське авто',  consumption: { petrol: 5.5,  diesel: 4.5, lpg: 6.5 } },
  { id: 'sedan',     labelEn: 'Sedan / compact', labelUk: 'Легкове',      consumption: { petrol: 7.5,  diesel: 6.0, lpg: 8.5 } },
  { id: 'crossover', labelEn: 'Crossover',       labelUk: 'Кросовер',     consumption: { petrol: 8.5,  diesel: 7.0, lpg: 9.5 } },
  { id: 'suv',       labelEn: 'SUV / 4x4',       labelUk: 'Позашляховик', consumption: { petrol: 11.0, diesel: 9.0, lpg: 12.5 } },
  { id: 'minivan',   labelEn: 'Minivan / bus',   labelUk: 'Мінівен',      consumption: { petrol: 10.5, diesel: 8.5, lpg: 12.0 } },
];
