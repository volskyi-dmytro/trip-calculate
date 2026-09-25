import { describe, expect, it } from 'vitest'
import { legalTranslations, type LegalBlock, type LegalDocument } from '../legal'

// Shape of a document without its words: section ids, block kinds, list
// lengths, table sizes and tokens must match between languages.
const shape = (doc: LegalDocument) =>
  doc.sections.map((s) => ({
    id: s.id,
    blocks: s.blocks.map((b: LegalBlock) => {
      const texts = b.kind === 'p' ? [b.text] : b.kind === 'list' ? b.items : [...b.head, ...b.rows.flat()]
      const tokens = texts.join(' ').match(/\{email\}|\*\*/g)?.length ?? 0
      if (b.kind === 'p') return { kind: 'p', tokens }
      if (b.kind === 'list') return { kind: 'list', items: b.items.length, tokens }
      return { kind: 'table', cols: b.head.length, rows: b.rows.map((r) => r.length), tokens }
    }),
  }))

describe('legal documents', () => {
  for (const page of ['privacy', 'terms'] as const) {
    it(`${page}: English and Ukrainian have the same structure`, () => {
      expect(shape(legalTranslations.uk[page])).toEqual(shape(legalTranslations.en[page]))
    })

    it(`${page}: nothing is left for the owner to fill in`, () => {
      for (const lang of ['en', 'uk'] as const) {
        expect(JSON.stringify(legalTranslations[lang][page])).not.toMatch(/OWNER INPUT|LEGAL REVIEW|\[verify|перевірити\]/)
      }
    })
  }

  it('privacy policy has a #cookies section for the footer link', () => {
    expect(legalTranslations.en.privacy.sections.some((s) => s.id === 'cookies')).toBe(true)
  })

  it('every table row has as many cells as its header', () => {
    for (const lang of ['en', 'uk'] as const) {
      for (const page of ['privacy', 'terms'] as const) {
        for (const s of legalTranslations[lang][page].sections) {
          for (const b of s.blocks) {
            if (b.kind === 'table') for (const row of b.rows) expect(row.length, `${lang}:${s.id}`).toBe(b.head.length)
          }
        }
      }
    }
  })
})
