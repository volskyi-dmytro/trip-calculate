import { describe, expect, it } from 'vitest'

// Read via node:fs: vitest blanks ?raw CSS imports, and @types/node is not installed (non-literal import keeps tsc quiet).
const fsModule: string = 'node:fs'
const { readFileSync } = await import(/* @vite-ignore */ fsModule)
const css: string = readFileSync(new URL('../global.css', import.meta.url), 'utf8')

// Guards F1-F3: text tokens and filled-accent pairs must keep WCAG AA (4.5:1) in both themes.
const block = (re: RegExp) => css.match(re)![1]
const light = block(/:root \{([\s\S]*?)\n\}/)
const dark = block(/body\[data-theme="dark"\],\s*\.dark \{([\s\S]*?)\n\}/)
const token = (b: string, name: string) => b.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))![1]

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5]
    .map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

describe.each([
  ['light', light],
  ['dark', dark],
])('%s theme tokens', (_name, b) => {
  it('--text-3 is readable on bg, surface and surface-2', () => {
    for (const bg of ['bg', 'surface', 'surface-2']) {
      expect(ratio(token(b, 'text-3'), token(b, bg))).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('--on-accent is readable on --accent and --accent-hover', () => {
    expect(ratio(token(b, 'on-accent'), token(b, 'accent'))).toBeGreaterThanOrEqual(4.5)
    expect(ratio(token(b, 'on-accent'), token(b, 'accent-hover'))).toBeGreaterThanOrEqual(4.5)
  })
  it('--accent is readable as text on surface', () => {
    expect(ratio(token(b, 'accent'), token(b, 'surface'))).toBeGreaterThanOrEqual(4.5)
  })
})

it('Tailwind primary follows the theme accent', () => {
  expect(css).toMatch(/@theme inline \{[^}]*--color-primary: var\(--accent\)/)
  expect(css).toMatch(/--color-primary-foreground: var\(--on-accent\)/)
})