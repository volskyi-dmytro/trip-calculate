import { describe, expect, it } from 'vitest'
import { PLURAL_SUFFIX, pluralKey, translate, translatePlural, translations } from '../common'
import { routePlannerTranslations } from '../routePlanner'

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort()

// Strip CLDR plural suffixes so `x_one`/`x_few`/... count as one logical key `x`.
const baseKeys = (dict: Record<string, string>) =>
  new Set(Object.keys(dict).map((k) => k.replace(PLURAL_SUFFIX, '')))

const leafPaths = (obj: object, prefix = ''): string[] =>
  Object.entries(obj).flatMap(([k, v]) =>
    v !== null && typeof v === 'object' ? leafPaths(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  )

describe('shared dictionary', () => {
  it('has the same logical keys in English and Ukrainian', () => {
    expect([...baseKeys(translations.uk)].sort()).toEqual([...baseKeys(translations.en)].sort())
  })

  it('uses the same placeholders in both languages', () => {
    for (const key of Object.keys(translations.en)) {
      if (PLURAL_SUFFIX.test(key)) continue
      expect(placeholders(translations.uk[key]), key).toEqual(placeholders(translations.en[key]))
    }
  })

  it('uses the same placeholders in every plural form', () => {
    for (const lang of ['en', 'uk'] as const) {
      for (const [key, value] of Object.entries(translations[lang])) {
        if (!PLURAL_SUFFIX.test(key)) continue
        const reference = translations.en[key.replace(PLURAL_SUFFIX, '_other')]
        expect(placeholders(value), `${lang}:${key}`).toEqual(placeholders(reference))
      }
    }
  })

  it('has every plural form each language needs', () => {
    const plurals = [...baseKeys(translations.en)].filter((k) => !(k in translations.en))
    for (const key of plurals) {
      for (const form of ['one', 'other']) expect(translations.en, key).toHaveProperty([`${key}_${form}`])
      for (const form of ['one', 'few', 'many', 'other']) expect(translations.uk, key).toHaveProperty([`${key}_${form}`])
    }
  })

  it('has no empty values', () => {
    for (const lang of ['en', 'uk'] as const) {
      for (const [key, value] of Object.entries(translations[lang])) expect(value.trim(), `${lang}:${key}`).not.toBe('')
    }
  })
})

describe('route planner dictionary', () => {
  it('has the same keys in English and Ukrainian', () => {
    expect(leafPaths(routePlannerTranslations.uk).sort()).toEqual(leafPaths(routePlannerTranslations.en).sort())
  })

  it('uses the same placeholders in both languages', () => {
    const leaf = (obj: object, path: string) =>
      path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], obj) as string
    for (const path of leafPaths(routePlannerTranslations.en)) {
      expect(placeholders(leaf(routePlannerTranslations.uk, path)), path)
        .toEqual(placeholders(leaf(routePlannerTranslations.en, path)))
    }
  })
})

describe('translate', () => {
  it('returns the Ukrainian value', () => {
    expect(translate('uk', 'header.login')).toBe(translations.uk['header.login'])
  })

  it('falls back to English when a Ukrainian value is missing', () => {
    const dict = { en: { only: 'English text' }, uk: {} }
    expect(translate('uk', 'only', dict)).toBe('English text')
  })

  it('returns the key only when no language has it', () => {
    expect(translate('uk', 'no.such.key')).toBe('no.such.key')
  })
})

describe('translatePlural', () => {
  const dict = {
    en: { 'p_one': '{count} passenger', 'p_other': '{count} passengers' },
    uk: {
      'p_one': '{count} пасажир',
      'p_few': '{count} пасажири',
      'p_many': '{count} пасажирів',
      'p_other': '{count} пасажира',
    },
  }

  it.each([
    [1, '1 пасажир'],
    [2, '2 пасажири'],
    [4, '4 пасажири'],
    [5, '5 пасажирів'],
    [11, '11 пасажирів'],
    [21, '21 пасажир'],
    [22, '22 пасажири'],
    [1.5, '1,5 пасажира'],
  ])('picks the Ukrainian form for %s', (count, expected) => {
    expect(translatePlural('uk', 'p', count, dict)).toBe(expected)
  })

  it.each([
    [1, '1 passenger'],
    [4, '4 passengers'],
  ])('picks the English form for %s', (count, expected) => {
    expect(translatePlural('en', 'p', count, dict)).toBe(expected)
  })

  it('builds keys with CLDR suffixes', () => {
    expect(pluralKey('p', 'few')).toBe('p_few')
  })

  it('declines real dictionary entries', () => {
    expect(translatePlural('uk', 'dashboard.stats.days', 1)).toBe('1 день')
    expect(translatePlural('uk', 'dashboard.stats.days', 3)).toBe('3 дні')
    expect(translatePlural('uk', 'dashboard.stats.days', 25)).toBe('25 днів')
    expect(translatePlural('uk', 'common.passengers', 4)).toBe('4 пасажири')
    expect(translatePlural('uk', 'common.passengersGenitive', 1)).toBe('1 пасажира')
    expect(translatePlural('uk', 'common.passengersGenitive', 4)).toBe('4 пасажирів')
    expect(translatePlural('uk', 'common.passengersGenitive', 21)).toBe('21 пасажира')
    expect(translatePlural('en', 'common.passengers', 1)).toBe('1 passenger')
  })
})
