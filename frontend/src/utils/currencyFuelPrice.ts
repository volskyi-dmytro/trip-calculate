import { api } from '../services/api';

/** Currencies the backend's `/api/fuel-prices` can convert into (see
 * FuelPriceController#CURRENCIES). PLN isn't priced there yet. */
const LIVE_CURRENCIES = new Set(['UAH', 'USD', 'EUR']);

// Ukraine is refreshed daily by the agent's minfin fetcher regardless of the
// trip's actual route, so it's a safe always-there reference country for a
// "what does fuel roughly cost" default when there's no route yet.
const REFERENCE_COUNTRY = 'UA';

/** Best-effort live petrol price, already converted server-side to `currency`.
 * Returns null (never throws) when the currency/route has no data — callers
 * should fall back to `convertFuelPrice`. */
export async function suggestFuelPrice(currency: string): Promise<number | null> {
  if (!LIVE_CURRENCIES.has(currency)) return null;
  try {
    const { data } = await api.get('/api/fuel-prices', {
      params: { countries: REFERENCE_COUNTRY, type: 'petrol', currency },
    });
    const price = data?.prices?.[0]?.pricePerLiter;
    return typeof price === 'number' && price > 0 ? price : null;
  } catch {
    return null;
  }
}

// ponytail: static approximate cross-rates, only used when live data is
// unavailable (e.g. PLN, or the request above failed). These will drift —
// upgrade path is a backend FX-rate endpoint or adding PLN to
// FuelPriceController#CURRENCIES.
const FX_TO_UAH: Record<string, number> = {
  UAH: 1,
  USD: 41,
  EUR: 47,
  PLN: 11,
};

/** Converts a price the user already typed from one currency to another using
 * the static approximate table above. Identity when either currency is unknown. */
export function convertFuelPrice(value: number, from: string, to: string): number {
  const fromRate = FX_TO_UAH[from];
  const toRate = FX_TO_UAH[to];
  if (!fromRate || !toRate || from === to) return value;
  return Math.round((value * fromRate) / toRate * 100) / 100;
}
