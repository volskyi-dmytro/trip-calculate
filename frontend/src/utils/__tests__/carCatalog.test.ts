import { describe, it, expect } from 'vitest';
import { searchCatalog, type CatalogEntry } from '../carCatalog';
import { CAR_PRESETS } from '../carPresets';
import catalog from '../../data/carCatalog.json';

const entries = catalog as CatalogEntry[];

describe('searchCatalog', () => {
  it('finds Octavia by Latin partial', () => {
    expect(searchCatalog('octav', entries).map(e => e.id)).toContain('skoda-octavia-a5');
  });
  it('finds Octavia by Ukrainian alias', () => {
    expect(searchCatalog('октав', entries).map(e => e.id)).toContain('skoda-octavia-a5');
  });
  it('finds Lanos by make+model query', () => {
    expect(searchCatalog('daewoo lan', entries).length).toBeGreaterThan(0);
  });
  it('returns empty for 1-char query', () => {
    expect(searchCatalog('o', entries)).toEqual([]);
  });
  it('caps results at the limit', () => {
    expect(searchCatalog('a', entries, 8).length).toBeLessThanOrEqual(8);
  });
});

describe('catalog data integrity', () => {
  it('has at least 100 entries', () => {
    expect(entries.length).toBeGreaterThanOrEqual(100);
  });
  it('has unique ids', () => {
    expect(new Set(entries.map(e => e.id)).size).toBe(entries.length);
  });
  it('every variant is a valid fuel type within bounds', () => {
    for (const entry of entries) {
      expect(entry.variants.length).toBeGreaterThan(0);
      expect(entry.aliases.length).toBeGreaterThan(0);
      for (const v of entry.variants) {
        expect(['petrol', 'diesel', 'lpg']).toContain(v.fuelType);
        expect(v.consumption).toBeGreaterThanOrEqual(3.0);
        expect(v.consumption).toBeLessThanOrEqual(25.0);
      }
    }
  });
});

describe('presets', () => {
  it('all preset values within bounds', () => {
    for (const p of CAR_PRESETS) {
      for (const v of Object.values(p.consumption)) {
        expect(v).toBeGreaterThanOrEqual(3.0);
        expect(v).toBeLessThanOrEqual(25.0);
      }
    }
  });
});
