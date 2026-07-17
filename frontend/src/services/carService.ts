import { api } from './api';
import type { FuelType } from '../utils/carCatalog';
import type { GarageCar } from '../types/Car';

const API_BASE = '/api/cars';

export interface SaveCarRequest {
  name: string;
  makeModel: string | null;
  fuelType: FuelType;
  fuelConsumption: number;
  isDefault?: boolean;
  source: string;
}

export interface EstimateResult {
  makeModel: string;
  fuelType: FuelType;
  consumptionL100km: number;
}

export const carService = {
  /**
   * Get all garage cars for the authenticated user
   */
  list: async (): Promise<GarageCar[]> => {
    const response = await api.get(API_BASE);
    return response.data;
  },

  /**
   * Create a new garage car
   */
  create: async (req: SaveCarRequest): Promise<GarageCar> => {
    const response = await api.post(API_BASE, req);
    return response.data;
  },

  /**
   * Update an existing garage car
   */
  update: async (id: number, req: SaveCarRequest): Promise<GarageCar> => {
    const response = await api.put(`${API_BASE}/${id}`, req);
    return response.data;
  },

  /**
   * Delete a garage car
   */
  remove: async (id: number): Promise<void> => {
    await api.delete(`${API_BASE}/${id}`);
  },

  /**
   * Set a garage car as the user's default
   */
  setDefault: async (id: number): Promise<GarageCar> => {
    const response = await api.put(`${API_BASE}/${id}/default`, null);
    return response.data;
  },

  /**
   * AI-estimate consumption from a free-text description
   */
  estimate: async (description: string, language: string): Promise<EstimateResult> => {
    const response = await api.post(`${API_BASE}/estimate`, { description, language });
    return response.data;
  },
};
