import type { Language } from '../types';

export const SUPPORTED_LOCALES: readonly Language[] = ['en', 'uk'];

export function isSupportedLocale(value: string | undefined): value is Language {
  return value !== undefined && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Strips a leading /en or /uk segment, if present.
 *  "/en/route-planner" -> "/route-planner", "/uk" -> "/" */
export function stripLocalePrefix(pathname: string): string {
  const match = pathname.match(/^\/(en|uk)(\/.*)?$/);
  if (!match) return pathname;
  return match[2] ?? '/';
}

/** Builds a locale-prefixed path, replacing any existing locale segment.
 *  withLocalePrefix('/route-planner', 'uk') -> '/uk/route-planner' */
export function withLocalePrefix(pathname: string, locale: Language): string {
  const rest = stripLocalePrefix(pathname);
  const normalizedRest = rest === '/' ? '' : rest;
  return `/${locale}${normalizedRest}`;
}
