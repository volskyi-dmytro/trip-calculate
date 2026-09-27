/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Language } from '../../../types'
import { receiptService } from '../../../services/receiptService'

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
vi.mock('../../../services/receiptService', () => ({
  receiptService: { create: vi.fn() },
  receiptUrl: (slug: string) => `https://trip-calculate.online/r/${slug}`,
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true

const { ShareReceiptModal } = await import('../ShareReceiptModal')

const payload = {
  distanceKm: 540, fuelConsumption: 7.5, fuelPrice: 58, currency: 'UAH', people: 4,
  locale: 'en', originLabel: 'Kyiv', destinationLabel: 'Lviv',
} as unknown as Parameters<typeof ShareReceiptModal>[0]['payload']

const receipt = {
  slug: 'abc123', originLabel: 'Kyiv', destinationLabel: 'Lviv',
  distanceKm: 540, fuelConsumption: 7.5, fuelPrice: 58, currency: 'UAH', people: 4,
  totalCost: 2349, costPerPerson: 587, locale: 'en', routeGeometry: null,
  createdAt: '2026-09-27T00:00:00Z', expiresAt: null, viewCount: 0,
}

const mounted: Array<() => void> = []
afterEach(() => {
  for (const cleanup of mounted.splice(0)) cleanup()
  vi.mocked(receiptService.create).mockReset()
  language = 'en'
})

async function renderCreatedModal() {
  vi.mocked(receiptService.create).mockResolvedValue(receipt)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(<ShareReceiptModal payload={payload} isOpen onClose={() => {}} />)
  })
  const createBtn = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Create link'))
  await act(async () => {
    createBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await Promise.resolve()
  })

  mounted.push(() => {
    act(() => root.unmount())
    container.remove()
  })
  return container
}

describe('ShareReceiptModal share actions', () => {
  it('opens Telegram share with the link and route label', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const container = await renderCreatedModal()

    const telegramBtn = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Telegram'))
    telegramBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/t\.me\/share\/url\?url=.*abc123.*&text=.*Kyiv/),
      '_blank',
      'noopener,noreferrer',
    )
    openSpy.mockRestore()
  })

  it('opens WhatsApp share with the link and route label', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const container = await renderCreatedModal()

    const whatsappBtn = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('WhatsApp'))
    whatsappBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/wa\.me\/\?text=.*abc123/),
      '_blank',
      'noopener,noreferrer',
    )
    openSpy.mockRestore()
  })

  it('copies the link and shows the Copied feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const container = await renderCreatedModal()

    const copyBtn = container.querySelector('button[aria-label="Copy"]') as HTMLButtonElement
    await act(async () => {
      copyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    expect(writeText).toHaveBeenCalledWith('https://trip-calculate.online/r/abc123')
  })
})
