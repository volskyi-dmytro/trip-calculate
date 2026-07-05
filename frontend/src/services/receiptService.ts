import { api } from './api';
import type { Receipt, ReceiptPayload } from '../types/Receipt';

const API_BASE = '/api/receipts';

export const receiptUrl = (slug: string): string =>
  `${window.location.origin}/r/${slug}`;

/**
 * Reduce a route polyline to <=maxPoints coords rounded to 5 decimals (~1m).
 * The receipt page draws a decorative SVG sketch — full precision is waste.
 */
export const downsampleGeometry = (
  coords: Array<[number, number]>,
  maxPoints = 200,
): string | undefined => {
  if (!coords || coords.length < 2) return undefined;
  const step = Math.max(1, Math.ceil(coords.length / maxPoints));
  const sampled = coords.filter((_, i) => i % step === 0);
  const last = coords[coords.length - 1];
  if (sampled[sampled.length - 1] !== last) {
    sampled.push(last);
  }
  return JSON.stringify(
    sampled.map(([lat, lng]) => [
      Math.round(lat * 1e5) / 1e5,
      Math.round(lng * 1e5) / 1e5,
    ]),
  );
};

export const receiptService = {
  create: async (payload: ReceiptPayload): Promise<Receipt> => {
    const response = await api.post(API_BASE, payload);
    return response.data;
  },

  get: async (slug: string): Promise<Receipt> => {
    const response = await api.get(`${API_BASE}/${slug}`);
    return response.data;
  },

  /** Fire-and-forget conversion metric; never block navigation on it. */
  registerCta: (slug: string): void => {
    api.post(`${API_BASE}/${slug}/cta`).catch(() => {});
  },

  listMine: async (): Promise<Receipt[]> => {
    const response = await api.get(API_BASE);
    return response.data;
  },

  remove: async (slug: string): Promise<void> => {
    await api.delete(`${API_BASE}/${slug}`);
  },
};
