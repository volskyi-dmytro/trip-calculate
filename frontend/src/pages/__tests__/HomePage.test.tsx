/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HomePage } from '../HomePage'
import { cityRouteService } from '../../services/cityRouteService'

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))
vi.mock('../../contexts/LanguageContext', async () => {
  const { translations } = await import('../../i18n/common')
  return { useLanguage: () => ({ language: 'uk', t: (key: string) => translations.uk[key] ?? key }) }
})
vi.mock('../../components/common/Header', () => ({ Header: () => <header>Header</header> }))
vi.mock('../../components/common/Footer', () => ({ Footer: () => <footer>Footer</footer> }))
vi.mock('../../components/QuickCalculator', () => ({ QuickCalculator: () => <div /> }))
vi.mock('../../components/calculator/CalculatorModal', () => ({ CalculatorModal: () => null }))
vi.mock('../../services/cityRouteService', () => ({ cityRouteService: { list: vi.fn() } }))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const route = { slug: 'kyiv-lviv', from: { uk: 'Київ', en: 'Kyiv' }, to: { uk: 'Львів', en: 'Lviv' }, distanceKm: 540 }
const cleanups: Array<() => void> = []
afterEach(() => {
  for (const c of cleanups.splice(0)) c()
  vi.mocked(cityRouteService.list).mockReset()
  document.getElementById('city-routes-data')?.remove()
  document.getElementById('fuel-price-data')?.remove()
})

function island(id: string, payload: unknown) {
  const el = document.head.appendChild(document.createElement('script'))
  el.type = 'application/json'
  el.id = id
  el.textContent = JSON.stringify(payload)
}

async function renderPage() {
  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  await act(async () => {
    root.render(<HomePage />)
    await new Promise((r) => setTimeout(r, 0))
  })
  cleanups.push(() => act(() => root.unmount()))
  return container
}

describe('HomePage popular routes', () => {
  it('renders crawlable links from the server-embedded list without calling the API', async () => {
    island('city-routes-data', [route])

    const container = await renderPage()

    expect(cityRouteService.list).not.toHaveBeenCalled()
    expect(container.querySelector('a[href="/uk/route/kyiv-lviv"]')?.textContent).toBe('Київ → Львів')
  })

  it('falls back to the API after a client-side arrival', async () => {
    vi.mocked(cityRouteService.list).mockResolvedValue([route])

    const container = await renderPage()

    expect(cityRouteService.list).toHaveBeenCalledOnce()
    expect(container.querySelector('a[href="/uk/route/kyiv-lviv"]')).not.toBeNull()
  })

  it('prices the table and the worked example with the embedded live fuel price', async () => {
    island('city-routes-data', [route])
    island('fuel-price-data', { pricePerLiter: 60, date: '2026-10-31T06:00:00Z', consumptionL100: 7.5, passengers: 4 })

    const container = await renderPage()
    const text = (container.textContent ?? '').replace(/\s/g, ' ')

    // 540 km × 7.5 L/100 km = 40.5 L; × 60 = 2430 UAH; ÷ 4 = 607.5, shown as whole hryvnias.
    const cells = [...container.querySelectorAll('#popular-routes tbody td')].map((td) => td.textContent?.replace(/\s/g, ' '))
    expect(cells).toEqual(['540 км', '2 430 грн', '608 грн'])
    expect(text).toContain('540 × 7,5 ÷ 100 = 40,5 л')
    expect(text).toContain('minfin.com.ua')
  })

  it('labels the price as indicative when no live price was embedded', async () => {
    island('city-routes-data', [route])

    const text = (await renderPage()).textContent ?? ''

    expect(text).toContain('орієнтовна')
    expect(text).not.toContain('minfin.com.ua на')
  })
})
