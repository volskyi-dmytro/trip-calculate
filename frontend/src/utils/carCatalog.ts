import { FUEL_WORDS } from '../i18n/fuelWords';
// FuelType is declared here (single source of truth for Task 6). Task 7's
// `types/Car.ts` re-exports this type rather than redeclaring it.
export type FuelType = 'petrol' | 'diesel' | 'lpg';

export interface CatalogVariant {
  fuelType: FuelType;
  consumption: number; // real-world mixed cycle, L/100km
  label: string;       // engine variant, e.g. "1.9 TDI"
}

export interface CatalogEntry {
  id: string;
  make: string;
  model: string;
  years: string;
  aliases: string[];   // uk/ru/latin transliterations, lowercase
  variants: CatalogVariant[];
}

const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');

export function searchCatalog(query: string, entries: CatalogEntry[], limit = 8): CatalogEntry[] {
  const q = normalize(query);
  if (q.length < 2) return [];
  const scored = entries
    .map((entry) => {
      const haystacks = [
        normalize(`${entry.make} ${entry.model}`),
        normalize(entry.make),
        normalize(entry.model),
        ...entry.aliases.map(normalize),
      ];
      // startsWith beats includes so "oct" ranks Octavia above e.g. "Vectra"
      const starts = haystacks.some((h) => h.startsWith(q));
      const contains = haystacks.some((h) => h.includes(q));
      return { entry, score: starts ? 2 : contains ? 1 : 0 };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((r) => r.entry);
}

// Case- and diacritic-insensitive ("Škoda" == "skoda"), single-spaced.
export const foldText = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

/**
 * The catalog car a free-text description names, with one unambiguous
 * variant: an engine label in the text ("1.9 JTD"), else a fuel word, else the
 * model's only variant. Null when the car isn't in the catalog or the variant
 * can't be told apart — only then is an AI estimate appropriate. Keeps one
 * source of truth: "Fiat Doblo 1.9 JTD" is the catalog's 6.0, never a fresh
 * AI guess of 6.5.
 */
export function matchCatalogCar(
  description: string,
  entries: CatalogEntry[],
): { entry: CatalogEntry; variant: CatalogVariant } | null {
  const text = ` ${foldText(description)} `;
  const entry = entries.find((e) =>
    [`${e.make} ${e.model}`, ...e.aliases].some((name) => text.includes(` ${foldText(name)} `)),
  );
  if (!entry) return null;
  const byLabel = entry.variants.filter((v) => text.includes(` ${foldText(v.label)} `));
  if (byLabel.length === 1) return { entry, variant: byLabel[0] };
  const byFuel = entry.variants.filter((v) =>
    FUEL_WORDS[v.fuelType].some((w) => text.includes(` ${w} `)));
  if (byFuel.length === 1) return { entry, variant: byFuel[0] };
  return entry.variants.length === 1 ? { entry, variant: entry.variants[0] } : null;
}

export async function loadCatalog(): Promise<CatalogEntry[]> {
  const module = await import('../data/carCatalog.json');
  return module.default as CatalogEntry[];
}
