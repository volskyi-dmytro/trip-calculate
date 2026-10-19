import { describe, expect, it } from 'vitest'
import { formatMoney, formatPrice } from '../format'

describe('formatPrice', () => {
  it('keeps the third decimal of a per-litre price (en)', () => {
    expect(formatPrice(85.995, 'UAH', 'en')).toMatch(/85\.995/)
    expect(formatMoney(85.995, 'UAH', 'en')).not.toMatch(/85\.995/) // totals stay at 2 decimals
  })

  it('keeps the third decimal in Ukrainian formatting', () => {
    expect(formatPrice(85.995, 'UAH', 'uk')).toMatch(/85,995/)
  })

  it('pads to two decimals when there are fewer', () => {
    expect(formatPrice(1.5, 'EUR', 'en')).toBe('€1.50')
  })

  it('falls back for unknown currency codes', () => {
    expect(formatPrice(1.234, 'XYZZY', 'en')).toBe('1.234 XYZZY')
  })
})
