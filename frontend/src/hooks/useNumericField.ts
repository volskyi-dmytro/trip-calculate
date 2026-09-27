import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';

export interface NumericFieldOptions {
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

export function clampNumeric(n: number, min?: number, max?: number): number {
  let v = n;
  if (min !== undefined) v = Math.max(min, v);
  if (max !== undefined) v = Math.min(max, v);
  return v;
}

/** What the field commits to once it loses focus: the clamped parsed number,
 *  or `fallback` when raw is empty/unparseable. */
export function resolveNumericBlur(raw: string, { min, max, fallback = min ?? 0 }: NumericFieldOptions): number {
  const parsed = Number(raw);
  if (raw.trim() === '' || Number.isNaN(parsed)) return fallback;
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

  useEffect(() => {
    if (!focused.current) setRaw(display(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, emptyEquals]);

  return {
    value: raw,
    onFocus: () => {
      focused.current = true;
    },
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      setRaw(next);
      if (isPartialNumericInput(next)) return;
      const parsed = Number(next);
      if (!Number.isNaN(parsed)) onChange(clampNumeric(parsed, min, max));
    },
    onBlur: () => {
      focused.current = false;
      const resolved = resolveNumericBlur(raw, options);
      setRaw(display(resolved));
      onChange(resolved);
    },
  };
}
