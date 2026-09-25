import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { timeAgo } from '../dates'

describe('timeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-25T12:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('speaks Ukrainian', () => {
    expect(timeAgo('2026-09-22T12:00:00Z', 'uk')).toBe('3 дні тому')
    expect(timeAgo(new Date('2026-09-20T12:00:00Z'), 'uk')).toBe('5 днів тому')
  })

  it('speaks English', () => {
    expect(timeAgo('2026-09-22T12:00:00Z', 'en')).toBe('3 days ago')
  })
})
