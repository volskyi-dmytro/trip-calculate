import { describe, it, expect } from 'vitest'
import { formatMoney } from '../money'

describe('formatMoney', () => {
  it('formats USD in English with a currency symbol and two decimals', () => {
    expect(formatMoney(202.7, 'USD', 'en')).toBe('$202.70')
  })

  it('falls back to "<amount> <currency>" when Intl rejects the currency code', () => {
    expect(formatMoney(12, '$', 'en')).toBe('12.00 $')
  })

  it('uses a decimal comma for Ukrainian and differs from English', () => {
    const uk = formatMoney(202.7, 'USD', 'uk')
    expect(uk).toContain('202,70')
    expect(uk).not.toBe(formatMoney(202.7, 'USD', 'en'))
  })
})
