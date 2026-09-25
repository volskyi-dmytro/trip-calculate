import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Language } from '../../../types'

let language: Language = 'en'
vi.mock('../../../contexts/LanguageContext', async () => {
  const { translate } = await import('../../../i18n/common')
  return { useLanguage: () => ({ language, t: (key: string) => translate(language, key) }) }
})
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../../ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}))

const { ShareReceiptModal } = await import('../ShareReceiptModal')

const payload = {
  distanceKm: 540, fuelConsumption: 7.5, fuelPrice: 58, currency: 'UAH', people: 4,
  totalCost: 2349, costPerPerson: 587, locale: 'en',
  originLabel: 'вулиця Хрещатик, 1, Київ',
} as unknown as Parameters<typeof ShareReceiptModal>[0]['payload']

const render = (lang: Language) => {
  language = lang
  return renderToStaticMarkup(<ShareReceiptModal payload={payload} isOpen onClose={() => {}} />)
}

describe('ShareReceiptModal', () => {
  it('warns that the link is public and suggests coarse labels (EN)', () => {
    const html = render('en')
    expect(html).toContain('Anyone with this link can see the receipt, including the route on the map.')
    expect(html).toContain('use a city or landmark instead of your home address')
  })

  it('warns that the link is public and suggests coarse labels (UK)', () => {
    const html = render('uk')
    expect(html).toContain('Будь-хто з цим посиланням зможе переглянути квитанцію, зокрема маршрут на мапі.')
    expect(html).toContain('вкажіть місто чи орієнтир замість домашньої адреси')
  })

  it('binds the From/To labels to their inputs', () => {
    const html = render('en')
    expect(html).toMatch(/<label[^>]*for="receipt-origin"/)
    expect(html).toMatch(/<input[^>]*id="receipt-origin"/)
    expect(html).toMatch(/<label[^>]*for="receipt-destination"/)
  })

  it('does not pre-fill a street address into the public receipt', () => {
    const html = render('uk') // payload origin is "вулиця Хрещатик, 1, Київ"
    expect(html).not.toContain('Хрещатик')
  })

  it('still pre-fills plain place names', () => {
    language = 'en'
    const html = renderToStaticMarkup(
      <ShareReceiptModal payload={{ ...payload, originLabel: 'Kyiv', destinationLabel: 'Lviv' }} isOpen onClose={() => {}} />,
    )
    expect(html).toMatch(/id="receipt-origin"[^>]*value="Kyiv"/)
    expect(html).toMatch(/id="receipt-destination"[^>]*value="Lviv"/)
  })

  it('keeps only the place from a geocoder name like "Kyiv, Ukraine"', () => {
    language = 'en'
    const html = renderToStaticMarkup(
      <ShareReceiptModal
        payload={{ ...payload, originLabel: 'Kyiv, Kyiv Oblast, Ukraine', destinationLabel: 'Lviv, Ukraine' }}
        isOpen
        onClose={() => {}}
      />,
    )
    expect(html).toMatch(/id="receipt-origin"[^>]*value="Kyiv"/)
    expect(html).toMatch(/id="receipt-destination"[^>]*value="Lviv"/)
  })
})
