import type { FuelType } from '../utils/carCatalog';

/** Words that name a fuel in a free-text car description (both languages),
 *  used to pick a catalog variant; engine codes imply diesel. */
export const FUEL_WORDS: Record<FuelType, string[]> = {
  petrol: ['petrol', 'gasoline', 'бензин'],
  diesel: ['diesel', 'дизель', 'tdi', 'jtd', 'cdi', 'crdi', 'hdi', 'dci', 'tdci'],
  lpg: ['lpg', 'газ', 'autogas'],
};
