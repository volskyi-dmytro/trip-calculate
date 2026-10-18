import { useEffect, useId, useRef, useState } from 'react'
import type { ComponentProps } from 'react'
import { Input } from './ui/input'
import { geocodingService, type Place } from '../services/geocodingService'

interface Props extends Omit<ComponentProps<typeof Input>, 'onChange' | 'onKeyDown' | 'value'> {
  value: string
  onChange: (value: string) => void
  /** User chose a suggestion (click, or arrows + Enter). */
  onPick: (place: Place) => void
  /** Enter with no highlighted suggestion: caller geocodes the raw text. */
  onSubmit: () => void
  language: string
  label: string
}

const MIN_CHARS = 3
// Nominatim is queued at 1 req/s anyway; the debounce just avoids queueing every keystroke.
const DEBOUNCE_MS = 400

/** Text input with an ARIA 1.2 combobox/listbox of geocoder suggestions. */
export function PlaceCombobox({ value, onChange, onPick, onSubmit, language, label, ...inputProps }: Props) {
  const listId = useId()
  const [places, setPlaces] = useState<Place[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  // Text we set ourselves (after a pick) must not trigger another search.
  const skipFor = useRef<string | null>(null)

  useEffect(() => {
    if (skipFor.current === value) return
    skipFor.current = null
    const q = value.trim()
    if (q.length < MIN_CHARS) { setPlaces([]); setOpen(false); return }
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      const found = await geocodingService.searchPlaces(q, language, ctrl.signal)
      if (ctrl.signal.aborted) return // a newer keystroke owns the list
      setPlaces(found); setActive(-1); setOpen(found.length > 0)
    }, DEBOUNCE_MS)
    return () => { clearTimeout(timer); ctrl.abort() }
  }, [value, language])

  const pick = (p: Place) => {
    skipFor.current = p.name
    setOpen(false); setPlaces([])
    onChange(p.name)
    onPick(p)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && places.length) {
      e.preventDefault(); setOpen(true); setActive(a => (a + 1) % places.length)
    } else if (e.key === 'ArrowUp' && places.length) {
      e.preventDefault(); setOpen(true); setActive(a => (a <= 0 ? places.length - 1 : a - 1))
    } else if (e.key === 'Escape') {
      setOpen(false); setActive(-1)
    } else if (e.key === 'Enter') {
      if (open && active >= 0) { e.preventDefault(); pick(places[active]) }
      else { setOpen(false); onSubmit() }
    }
  }

  return (
    <>
      <Input
        {...inputProps}
        type="text"
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-auto rounded-md border shadow-lg"
          // Opaque surface tokens: the panel behind is frosted glass, so a translucent list lets the
          // next field's label show through the options.
          style={{ background: 'var(--surface)', color: 'var(--text)', borderColor: 'var(--border-strong)' }}
        >
          {places.map((p, i) => (
            <li
              key={`${p.lat},${p.lng},${p.displayName}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown (not click) so the input's blur doesn't close the list first.
              onMouseDown={e => { e.preventDefault(); pick(p) }}
              className="min-h-11 cursor-pointer px-3 py-2 text-sm"
              style={i === active ? { background: 'var(--accent-soft)' } : undefined}
            >
              <span className="font-medium">{p.name}</span>
              <span className="block truncate text-xs opacity-70">{p.displayName}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
