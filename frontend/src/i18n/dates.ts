import { formatDistanceToNow } from 'date-fns';
import { enUS, uk } from 'date-fns/locale';
import type { Language } from '../types';

const DATE_FNS_LOCALES = { en: enUS, uk } as const;

/** "3 days ago" / "3 дні тому" in the active UI language. */
export function timeAgo(date: string | number | Date, language: Language): string {
  const text = formatDistanceToNow(new Date(date), { addSuffix: true, locale: DATE_FNS_LOCALES[language] });
  // date-fns 4.1 spells "дні" with a Latin "i"; swap any Latin i that follows a Cyrillic letter.
  return language === 'uk' ? text.replace(/(?<=[\u0400-\u04FF])i/g, 'і') : text;
}
