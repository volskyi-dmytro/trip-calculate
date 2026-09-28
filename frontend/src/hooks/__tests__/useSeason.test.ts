import { describe, expect, it } from 'vitest';
import { getSeason } from '../useSeason';

describe('getSeason', () => {
  const expected = [
    'winter', 'winter', 'spring', 'spring', 'spring', 'summer',
    'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter',
  ];

  it.each(expected.map((season, month) => [month, season]))(
    'month index %i -> %s',
    (month, season) => {
      expect(getSeason(new Date(2026, month as number, 15))).toBe(season);
    }
  );

  it('flips exactly at local month boundaries', () => {
    expect(getSeason(new Date(2026, 1, 28, 23, 59))).toBe('winter');
    expect(getSeason(new Date(2026, 2, 1, 0, 0))).toBe('spring');
    expect(getSeason(new Date(2026, 4, 31, 23, 59))).toBe('spring');
    expect(getSeason(new Date(2026, 5, 1))).toBe('summer');
    expect(getSeason(new Date(2026, 7, 31, 23, 59))).toBe('summer');
    expect(getSeason(new Date(2026, 8, 1))).toBe('autumn');
    expect(getSeason(new Date(2026, 10, 30, 23, 59))).toBe('autumn');
    expect(getSeason(new Date(2026, 11, 1))).toBe('winter');
  });
});
