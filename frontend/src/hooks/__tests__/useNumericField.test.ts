/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { clampNumeric, isPartialNumericInput, parseNumericInput, resolveNumericBlur, useNumericField } from '../useNumericField';

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

// QA F1: decimal comma must parse; garbage must be flagged, never silently 0.
describe('parseNumericInput', () => {
  it.each([
    ['10,5', 10.5],
    ['10.5', 10.5],
    ['1 000,5', 1000.5],
    ['1\u00a0000,5', 1000.5],
    ['1,000.5', 1000.5],
    ['-3', -3],
  ])('parses %j as %d', (raw, want) => {
    expect(parseNumericInput(raw)).toBe(want);
  });

  it.each(['abc', '10,5ab', '1.2.3', '10,5,5', '--1'])('rejects %j', (raw) => {
    expect(parseNumericInput(raw)).toBeNull();
  });
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Field = ReturnType<typeof useNumericField>;

/** Minimal renderHook: createRoot + act, as the other component tests do. */
function mount(value: number, onChange: (n: number) => void, opts = { min: 0 }) {
  const ref = { current: null as unknown as Field };
  function Probe() {
    ref.current = useNumericField(value, onChange, opts);
    return null;
  }
  act(() => createRoot(document.createElement('div')).render(createElement(Probe)));
  return ref;
}
const type = (f: { current: Field }, v: string) =>
  act(() => f.current.onChange({ target: { value: v } } as never));

describe('useNumericField with comma / invalid input', () => {
  it('commits 10,5 as 10.5 and does not flag it', () => {
    const onChange = vi.fn();
    const f = mount(0, onChange);
    type(f, '10,5');
    expect(onChange).toHaveBeenLastCalledWith(10.5);
    expect(f.current['aria-invalid']).toBeUndefined();
  });

  it('flags 10,5ab, keeps the text on blur, and resets the committed value so no stale total remains', () => {
    const onChange = vi.fn();
    const f = mount(10.5, onChange);
    type(f, '10,5ab');
    expect(f.current['aria-invalid']).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(0);
    act(() => f.current.onBlur());
    expect(f.current.value).toBe('10,5ab');
    expect(f.current['aria-invalid']).toBe(true);
  });

  it('empty blur falls back without an error flag', () => {
    const f = mount(5, vi.fn());
    type(f, '');
    act(() => f.current.onBlur());
    expect(f.current['aria-invalid']).toBeUndefined();
  });
});
