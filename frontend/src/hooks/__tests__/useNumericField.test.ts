import { describe, expect, it } from 'vitest';
import { clampNumeric, isPartialNumericInput, resolveNumericBlur } from '../useNumericField';

describe('isPartialNumericInput', () => {
  it.each(['', '-', '.', '-.'])('treats %j as still-typing, not zero', (raw) => {
    expect(isPartialNumericInput(raw)).toBe(true);
  });

  it.each(['0', '300', '3.5', '-3'])('treats %j as a resolvable number', (raw) => {
    expect(isPartialNumericInput(raw)).toBe(false);
  });
});

describe('clampNumeric', () => {
  it('clamps to min and max', () => {
    expect(clampNumeric(-5, 1)).toBe(1);
    expect(clampNumeric(50, 1, 10)).toBe(10);
    expect(clampNumeric(5, 1, 10)).toBe(5);
  });
});

describe('resolveNumericBlur', () => {
  it('clearing a field then blurring falls back instead of corrupting on the next type', () => {
    // This is the P0 bug: the field must stay empty while editing rather
    // than silently becoming "0"/min on every keystroke.
    expect(resolveNumericBlur('', { min: 0 })).toBe(0);
    expect(resolveNumericBlur('', { min: 1 })).toBe(1);
  });

  it('typing "300" after clearing resolves to 300, not "0300"', () => {
    expect(resolveNumericBlur('300', { min: 0 })).toBe(300);
  });

  it('clamps an out-of-range value on blur', () => {
    expect(resolveNumericBlur('999', { min: 1, max: 25 })).toBe(25);
    expect(resolveNumericBlur('-5', { min: 1 })).toBe(1);
  });

  it('uses an explicit fallback over min when given', () => {
    expect(resolveNumericBlur('', { min: 0, fallback: 8.5 })).toBe(8.5);
  });

  it('falls back on unparseable text', () => {
    expect(resolveNumericBlur('abc', { min: 1 })).toBe(1);
  });
});
