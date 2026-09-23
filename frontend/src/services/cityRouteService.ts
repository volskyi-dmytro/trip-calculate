import { api } from './api';
import type { Language } from '../types';

const API_BASE = '/api/city-routes';

export interface CityRouteSummary {
  slug: string;
  from: { uk: string; en: string };
  to: { uk: string; en: string };
}

export interface CityRouteRelated {
  slug: string;
  fromName: string;
  toName: string;
}

export interface CityRouteDetail {
  slug: string;
  fromName: string;
  toName: string;
  distanceKm: number;
  durationMin: number;
  distanceSource: 'live' | 'estimate';
  fuelType: 'petrol';
  fuelPricePerLiter: number | null;
  fuelPriceDate: string | null;
  currency: string;
  consumptionL100: number;
  passengers: number;
  totalCost: number | null;
  perPassenger: number | null;
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  related: CityRouteRelated[];
}

export const cityRouteService = {
  /** All published city routes — used for internal linking (home page, sitemap-style listings). */
  list: async (): Promise<CityRouteSummary[]> => {
    const response = await api.get<CityRouteSummary[]>(API_BASE);
    return response.data;
  },

  /** A single route's facts, localized. Throws (with response.status 404) for an unknown slug. */
  get: async (slug: string, locale: Language): Promise<CityRouteDetail> => {
    const response = await api.get<CityRouteDetail>(`${API_BASE}/${slug}`, {
      params: { locale },
    });
    return response.data;
  },
};
