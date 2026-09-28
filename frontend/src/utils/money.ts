/** Locale-aware money, e.g. "$202.70" (en) / "5 840,50 UAH-symbol" (uk). Falls back to
 *  "12.00 XYZ" for codes Intl doesn't know (older rows stored symbols). */
export function formatMoney(amount: number, currency: string, language: string): string {
  try {
    return new Intl.NumberFormat(language === 'uk' ? 'uk-UA' : 'en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
