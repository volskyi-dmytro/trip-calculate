import { describe, expect, it } from 'vitest'

// User-facing text lives in the dictionaries under src/i18n, where the parity
// tests check that English and Ukrainian stay in step. A Cyrillic letter in any
// other source file is a translation that bypassed them.
const sources = import.meta.glob<string>(
  ['../../**/*.{ts,tsx}', '!../../i18n/**', '!../../**/__tests__/**'],
  { query: '?raw', import: 'default', eager: true },
)
const CYRILLIC = /[Ѐ-ӿ]/

describe('inline translations', () => {
  it('scans the app sources', () => {
    expect(Object.keys(sources)).toContain('../../components/RoutePlanner.tsx')
  })

  it('keeps Ukrainian text out of components (use src/i18n)', () => {
    const offenders = Object.entries(sources).flatMap(([file, text]) =>
      text
        .split('\n')
        .map((line, i) => ({ line: line.trim(), at: `${file.replace('../../', '')}:${i + 1}` }))
        .filter(({ line }) => CYRILLIC.test(line) && !line.startsWith('//'))
        .map(({ line, at }) => `${at}: ${line}`),
    )
    expect(offenders).toEqual([])
  })
})
