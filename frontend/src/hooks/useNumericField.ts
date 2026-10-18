import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';

export interface NumericFieldOptions {
  /** Normalize committed values while preserving the raw in-progress edit. */
  normalize?: (value: number) => number;
  min?: number;
  max?: number;
  /** Committed value used when the field is left empty/unparseable on blur.
   *  Defaults to `min` if set, else 0. */
  fallback?: number;
  /** Display this committed value as an empty field instead of the literal
   *  number (e.g. a fresh form showing blank fields instead of "0"s). */
  emptyEquals?: number;
}

/** True while `raw` is a string the user could still be mid-typing a valid
 *  number into (empty, a bare sign, or a trailing decimal point). These must
 *  never be force-parsed to 0 — that's what snaps the field back and
 *  corrupts the next keystrokes (see quick-calc/calculator P0 audit finding). */
export function isPartialNumericInput(raw: string): boolean {
  return raw === '' || raw === '-' || raw === '.' || raw === '-.';
}

/** Parses user-typed numbers, accepting a decimal comma ("10,5"), grouping
 *  spaces ("1 000,5") and "1,000.5". Returns null for anything that is not a
 *  plain number so callers can flag it instead of silently treating it as 0. */
export function parseNumericInput(raw: string): number | null {
  let s = raw.replace(/[\s\u00a0\u202f]/g, '');
  // Both separators present: commas are grouping. Otherwise a lone comma is the decimal mark.
  s = s.includes('.') ? s.replace(/,/g, '') : s.replace(',', '.');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  return Number(s);
}

export function clampNumeric(n: number, min?: number, max?: number): number {
  let v = n;
  if (min !== undefined) v = Math.max(min, v);
  if (max !== undefined) v = Math.min(max, v);
  return v;
}

/** What the field commits to once it loses focus: the clamped parsed number,
 *  or `fallback` when raw is empty/unparseable. */
export function resolveNumericBlur(raw: string, { min, max, fallback = min ?? 0 }: NumericFieldOptions): number {
  const parsed = parseNumericInput(raw);
  if (parsed === null) return fallback;
  return clampNumeric(parsed, min, max);
}

/**
 * Backs a controlled numeric text input (use with `type="text" inputMode="decimal|numeric"`,
 * not `type="number"` — browsers report `e.target.value` as `""` for
 * `type="number"` while the text is a not-yet-valid partial number, which
 * defeats the point). Lets the user freely clear/retype the field instead of
 * snapping back to 0/min on every keystroke. Valid keystrokes commit
 * immediately via `onChange`; clamping and the empty-field fallback only
 * happen on blur.
 */
export function useNumericField(
  value: number,
  onChange: (value: number) => void,
  options: NumericFieldOptions = {},
) {
  const { min, max, emptyEquals } = options;
  const display = (v: number) => (v === emptyEquals ? '' : String(v));
  const [raw, setRaw] = useState(() => display(value));
  const focused = useRef(false);
  // True while the text is non-empty but not a number: surfaced as aria-invalid so the form can
  // show a message instead of the old silent 0 / stale total.
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (!focused.current) {
      setRaw(display(value));
      setInvalid(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, emptyEquals]);

  const fallbackValue = options.fallback ?? min ?? 0;
  const commit = (n: number) => onChange(options.normalize ? options.normalize(n) : n);

  return {
    value: raw,
    'aria-invalid': invalid ? (true as const) : undefined,
    onFocus: () => {
      focused.current = true;
    },
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      setRaw(next);
      if (isPartialNumericInput(next)) {
        setInvalid(false);
        return;
      }
      const parsed = parseNumericInput(next);
      setInvalid(parsed === null);
      // Invalid text commits the fallback so no stale result sits next to it.
      commit(parsed === null ? fallbackValue : clampNumeric(parsed, min, max));
    },
    onBlur: () => {
      focused.current = false;
      const clamped = resolveNumericBlur(raw, options);
      const resolved = options.normalize ? options.normalize(clamped) : clamped;
      onChange(resolved);
      // Keep the offending text visible (with the error) rather than overwriting it with 0.
      if (parseNumericInput(raw) === null && raw.trim() !== '' && !isPartialNumericInput(raw)) return;
      setInvalid(false);
      setRaw(display(resolved));
    },
  };
}
