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

export async function loadCatalog(): Promise<CatalogEntry[]> {
  const module = await import('../data/carCatalog.json');
  return module.default as CatalogEntry[];
}
