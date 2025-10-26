import { api } from './api';
import type { Trip, TripResult } from '../types';

export const calculatorService = {
  calculateExpenses: async (trip: Trip): Promise<TripResult> => {
    const response = await api.post<TripResult>('/calculate', trip);
    return response.data;
  },
};
