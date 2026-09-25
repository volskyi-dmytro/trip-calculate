import { describe, expect, it } from 'vitest';
import { formatDocumentTitle } from '../useDocumentTitle';
import { translations } from '../../i18n/common';

describe('formatDocumentTitle', () => {
  it('appends the site name to the page title', () => {
    expect(formatDocumentTitle('Page not found')).toBe('Page not found | Trip Calculate');
  });

  it('falls back to the bare site name while there is no title yet', () => {
    expect(formatDocumentTitle(null)).toBe('Trip Calculate');
  });

  // The server renders these titles for crawlers (SpaShellController); after
  // client navigation the tab must show the same text.
  it.each([
    ['en', 'pageTitle.home', 'Road Trip Fuel Cost Calculator for Europe — Split Costs | Trip Calculate'],
    ['uk', 'pageTitle.home', 'Калькулятор вартості поїздки на авто — пальне і поділ витрат | Trip Calculate'],
    ['en', 'pageTitle.routePlanner', 'Map Route Planner with Fuel Prices & AI Assistant | Trip Calculate'],
    ['uk', 'pageTitle.routePlanner', 'Планувальник маршруту на карті з пальним і погодою — AI-асистент | Trip Calculate'],
  ] as const)('%s %s matches the server-rendered title', (lang, key, expected) => {
    expect(formatDocumentTitle(translations[lang][key])).toBe(expected);
  });
});
