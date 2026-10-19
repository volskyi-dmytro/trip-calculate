import { formatMoney } from '../lib/format';
// Pure what-if arithmetic for the quick calculator. Deterministic, no I/O:
// every scenario is priced on the SAME distance as the baseline.
import { calculateRouteCost } from './routeCost';

export interface CostInputs {
  distanceKm: number;
  consumption: number; // L/100 km
  price: number; // per litre, in the baseline currency
  passengers: number;
}

export interface CostResult {
  total: number;
  perPerson: number;
}

/** A scenario overrides only what it sets; anything undefined inherits the baseline. */
export type ScenarioOverrides = Partial<Pick<CostInputs, 'consumption' | 'price' | 'passengers'>>;

export interface ScenarioRow {
  result: CostResult | null; // null = invalid inputs, never a fake zero
  /** Rounded (2dp) differences vs the baseline; null when either side is invalid. */
  deltaTotal: number | null;
  deltaPerPerson: number | null;
}

export const MAX_SCENARIOS = 3;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const isNonNegative = (n: number) => Number.isFinite(n) && n >= 0;

/** Same formula as QuickCalculator's baseline. Returns null for invalid input. */
export function computeCost(i: CostInputs): CostResult | null {
  if (!isNonNegative(i.distanceKm) || !isNonNegative(i.consumption) || !isNonNegative(i.price)) return null;
  if (!Number.isInteger(i.passengers) || i.passengers < 1) return null;
  const { total, perPerson } = calculateRouteCost(i.distanceKm, i.consumption, i.price, i.passengers);
  if (!Number.isFinite(total)) return null;
  return { total, perPerson };
}

/** Parses user text for a numeric override. '' -> undefined (inherit baseline),
 *  invalid -> 'invalid'. Accepts a decimal comma (uk keyboards). */
export function parseOverride(raw: string, integer = false): number | undefined | 'invalid' {
  const s = raw.trim().replace(',', '.');
  if (s === '') return undefined;
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return 'invalid';
  const n = Number(s);
  if (!Number.isFinite(n) || (integer && !Number.isInteger(n))) return 'invalid';
  return n;
}

function stripUndefined(s: ScenarioOverrides): ScenarioOverrides {
  return Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined));
}

/** Baseline is never modified: rows are computed from copies. */
export function compareScenarios(baseline: CostInputs, scenarios: ScenarioOverrides[]): ScenarioRow[] {
  const base = computeCost(baseline);
  return scenarios.slice(0, MAX_SCENARIOS).map((s) => {
    const result = computeCost({ ...baseline, ...stripUndefined(s) });
    const ok = base && result;
    return {
      result,
      deltaTotal: ok ? round2(round2(result.total) - round2(base.total)) : null,
      deltaPerPerson: ok ? round2(round2(result.perPerson) - round2(base.perPerson)) : null,
    };
  });
}

/** Same format as the calculator's own figures. */
export const formatAmount = (n: number, currency: string, locale = 'en') => formatMoney(n, currency, locale);

export function formatDelta(n: number, currency: string, locale = 'en'): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${formatMoney(Math.abs(n), currency, locale)}`;
}
