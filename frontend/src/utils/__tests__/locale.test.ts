import { describe, it, expect } from 'vitest';
import { isSupportedLocale, stripLocalePrefix, withLocalePrefix } from '../locale';

describe('isSupportedLocale', () => {
  it('accepts en and uk', () => {
    expect(isSupportedLocale('en')).toBe(true);
    expect(isSupportedLocale('uk')).toBe(true);
  });

  it('rejects anything else, including undefined', () => {
    expect(isSupportedLocale('fr')).toBe(false);
    expect(isSupportedLocale('r')).toBe(false);
    expect(isSupportedLocale(undefined)).toBe(false);
  });
});

describe('stripLocalePrefix', () => {
  it('removes a leading /en or /uk segment', () => {
    expect(stripLocalePrefix('/en/route-planner')).toBe('/route-planner');
    expect(stripLocalePrefix('/uk')).toBe('/');
  });

  it('leaves paths without a locale prefix untouched', () => {
    expect(stripLocalePrefix('/route-planner')).toBe('/route-planner');
    expect(stripLocalePrefix('/r/abc12345')).toBe('/r/abc12345');
  });
});

describe('withLocalePrefix', () => {
  it('prefixes a bare path with the given locale', () => {
    expect(withLocalePrefix('/route-planner', 'en')).toBe('/en/route-planner');
  });

  it('re-prefixes a path that already carries the other locale', () => {
    expect(withLocalePrefix('/en/route-planner', 'uk')).toBe('/uk/route-planner');
  });

  it('handles the bare root path in either direction', () => {
    expect(withLocalePrefix('/', 'en')).toBe('/en');
    expect(withLocalePrefix('/uk', 'en')).toBe('/en');
  });
});
