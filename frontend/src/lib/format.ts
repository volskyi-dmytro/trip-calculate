// One place for every displayed number, so the same route reads the same
// everywhere (audit F10). Locale is the app language ('en' | 'uk') or a BCP 47 tag.

const INTL_LOCALE: Record<string, string> = { en: 'en-US', uk: 'uk-UA' }
const intlLocale = (locale: string) => INTL_LOCALE[locale] ?? locale

/** Locale-aware money, e.g. "$202.70" (en) / "5 840,50 ₴" (uk). Codes Intl doesn't know fall back to "12.00 XYZ". */
export function formatMoney(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(intlLocale(locale), { style: 'currency', currency }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

/** Whole kilometres ("543 km"); under 10 km keeps one decimal so short hops don't read "0 km". */
export function formatDistance(km: number, locale: string): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'unit',
    unit: 'kilometer',
    unitDisplay: 'short',
    maximumFractionDigits: km < 10 ? 1 : 0,
  }).format(km)
}

/** Litres with one decimal ("32.6 L"). */
export function formatLiters(liters: number, locale: string): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'unit',
    unit: 'liter',
    unitDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(liters)
}

/** Minutes as "6 h 29 m" (en) or the locale's short units; zero parts are dropped ("2 h", "45 m"). */
export function formatDuration(minutes: number, locale: string): string {
  const total = Math.max(0, Math.round(minutes))
  const h = Math.floor(total / 60)
  const m = total % 60
  const part = (unit: 'hour' | 'minute', v: number) =>
    locale === 'en'
      ? `${v} ${unit === 'hour' ? 'h' : 'm'}`
      : new Intl.NumberFormat(intlLocale(locale), { style: 'unit', unit, unitDisplay: 'short' }).format(v)
  const parts: string[] = []
  if (h > 0) parts.push(part('hour', h))
  if (m > 0 || h === 0) parts.push(part('minute', m))
  return parts.join(' ')
}
