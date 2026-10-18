import { describe, expect, it } from 'vitest'
import { formatDistance, formatDuration, formatLiters, formatMoney } from './format'

// Normalise no-break spaces; Ukrainian unit words are percent-encoded because
// src/ keeps Cyrillic text in src/i18n (see noInlineTranslations.test).
const norm = (s: string) => s.replace(new RegExp('[\\u00a0\\u202f]', 'g'), ' ')
const word = (encoded: string) => decodeURIComponent(encoded)
const KM = word('%D0%BA%D0%BC')
const LITRE = word('%D0%BB')
const HOUR = word('%D0%B3%D0%BE%D0%B4')
const MIN = word('%D1%85%D0%B2')

describe('format', () => {
  it('formats money per locale and falls back for unknown codes', () => {
    expect(norm(formatMoney(1634.78, 'UAH', 'en'))).toBe('UAH 1,634.78')
    expect(norm(formatMoney(1634.78, 'UAH', 'uk'))).toBe(`1 634,78 ${word('%E2%82%B4')}`)
    expect(formatMoney(12, '$', 'en')).toBe('12.00 $')
  })

  it('rounds distance to whole km, one decimal under 10 km', () => {
    expect(norm(formatDistance(542.59, 'en'))).toBe('543 km')
    expect(norm(formatDistance(542.59, 'uk'))).toBe(`543 ${KM}`)
    expect(norm(formatDistance(1234.4, 'en'))).toBe('1,234 km')
    expect(norm(formatDistance(4.26, 'en'))).toBe('4.3 km')
  })

  it('formats litres with the locale decimal separator', () => {
    expect(norm(formatLiters(32.64, 'en'))).toBe('32.6 L')
    expect(norm(formatLiters(32.64, 'uk'))).toBe(`32,6 ${LITRE}`)
  })

  it('formats duration, carrying rounded minutes and dropping zero parts', () => {
    expect(formatDuration(389, 'en')).toBe('6 h 29 m')
    expect(norm(formatDuration(389, 'uk'))).toBe(`6 ${HOUR} 29 ${MIN}`)
    expect(formatDuration(119.6, 'en')).toBe('2 h')
    expect(formatDuration(45, 'en')).toBe('45 m')
    expect(formatDuration(0, 'en')).toBe('0 m')
  })
})
