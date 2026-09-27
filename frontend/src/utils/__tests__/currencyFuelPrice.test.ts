import { describe, expect, it, vi, beforeEach } from 'vitest';
import { convertFuelPrice, suggestFuelPrice } from '../currencyFuelPrice';
import { api } from '../../services/api';

describe('convertFuelPrice', () => {
  it('converts using the static cross-rate table', () => {
    // EUR->UAH != identity: 1.75 EUR/L should become a plausibly larger UAH number
    expect(convertFuelPrice(1.75, 'EUR', 'UAH')).toBeCloseTo((1.75 * 47) / 1, 2);
  });

  it('is the identity when converting a currency to itself', () => {
    expect(convertFuelPrice(58, 'UAH', 'UAH')).toBe(58);
  });

  it('falls back to the original value for an unknown currency', () => {
    expect(convertFuelPrice(10, 'XYZ', 'UAH')).toBe(10);
  });
});

describe('suggestFuelPrice', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null for a currency the backend does not price (e.g. PLN)', async () => {
    const spy = vi.spyOn(api, 'get');
    await expect(suggestFuelPrice('PLN')).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns the live price when the backend has one', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: { currency: 'EUR', fuelType: 'petrol', prices: [{ pricePerLiter: 1.62 }] },
    } as never);
    await expect(suggestFuelPrice('EUR')).resolves.toBe(1.62);
  });

  it('returns null when the backend has no priced rows', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({ data: { prices: [] } } as never);
    await expect(suggestFuelPrice('USD')).resolves.toBeNull();
  });

  it('returns null instead of throwing on a network error', async () => {
    vi.spyOn(api, 'get').mockRejectedValueOnce(new Error('network down'));
    await expect(suggestFuelPrice('UAH')).resolves.toBeNull();
  });
});
