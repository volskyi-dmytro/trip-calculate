/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CityRoutePage } from '../CityRoutePage'
import { cityRouteService } from '../../services/cityRouteService'

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useParams: () => ({ slug: 'kyiv-lviv' }),
}))
vi.mock('../../contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', t: (key: string) => key, tn: (key: string, count: number) => `${key}:${count}` }),
}))
vi.mock('../../components/common/Header', () => ({ Header: () => <header>Header</header> }))
vi.mock('../../components/common/Footer', () => ({ Footer: () => <footer>Footer</footer> }))
vi.mock('../../components/QuickCalculator', () => ({
  QuickCalculator: () => <div data-testid="quick-calculator" />,
}))
vi.mock('../../services/cityRouteService', () => ({
  cityRouteService: { get: vi.fn() },
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true

const mounted: Array<() => void> = []
afterEach(() => {
  for (const cleanup of mounted.splice(0)) cleanup()
  vi.mocked(cityRouteService.get).mockReset()
  document.getElementById('city-route-data')?.remove()
})

function embedIsland(slug: string, locale: string, data: object) {
  const script = document.createElement('script')
  script.type = 'application/json'
  script.id = 'city-route-data'
  script.dataset.slug = slug
  script.dataset.locale = locale
  script.textContent = JSON.stringify(data)
  document.head.appendChild(script)
}

async function renderPage() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(<CityRoutePage />)
    await new Promise((r) => setTimeout(r, 0))
  })
  mounted.push(() => {
    act(() => root.unmount())
    container.remove()
  })

  return container
}

const routeDetail = {
  slug: 'kyiv-lviv',
  fromName: 'Kyiv',
  toName: 'Lviv',
  distanceKm: 540,
  durationMin: 390,
  distanceSource: 'live' as const,
  fuelType: 'petrol' as const,
  fuelPricePerLiter: 58.2,
  fuelPriceDate: '2026-09-20',
  currency: 'UAH',
  consumptionL100: 7.5,
  passengers: 4,
  totalCost: 2354.4,
  perPassenger: 588.6,
  from: { lat: 50.45, lng: 30.52 },
  to: { lat: 49.84, lng: 24.03 },
  related: [{ slug: 'kyiv-odesa', fromName: 'Kyiv', toName: 'Odesa' }],
}

describe('CityRoutePage', () => {
  it('renders key facts from the API response', async () => {
    vi.mocked(cityRouteService.get).mockResolvedValue(routeDetail)

    const container = await renderPage()

    expect(container.querySelector('h1')?.textContent).toContain('Kyiv → Lviv')
    expect(container.textContent).toContain('540 km')
    expect(container.textContent).toContain('58.2 UAH/L')
    expect(container.textContent).toContain('2354 UAH')
    expect(container.querySelector('[data-testid="quick-calculator"]')).not.toBeNull()
    expect(container.textContent).toContain('Kyiv → Odesa')
  })

  it('renders a not-found state for an unknown slug', async () => {
    vi.mocked(cityRouteService.get).mockRejectedValue({ response: { status: 404 } })

    const container = await renderPage()

    expect(container.textContent).toContain('cityRoute.notFound.title')
    expect(container.querySelector('a[href="/en"]')).not.toBeNull()
  })

  it('renders from the server-embedded data without calling the API', async () => {
    embedIsland('kyiv-lviv', 'en', routeDetail)

    const container = await renderPage()

    expect(cityRouteService.get).not.toHaveBeenCalled()
    expect(container.querySelector('h1')?.textContent).toContain('Kyiv → Lviv')
    expect(container.textContent).toContain('540 km')
  })

  it('ignores embedded data that belongs to another route or language', async () => {
    embedIsland('kyiv-odesa', 'en', { ...routeDetail, slug: 'kyiv-odesa', toName: 'Odesa' })
    vi.mocked(cityRouteService.get).mockResolvedValue(routeDetail)

    const container = await renderPage()

    expect(cityRouteService.get).toHaveBeenCalledOnce()
    expect(container.querySelector('h1')?.textContent).toContain('Kyiv → Lviv')
  })

  it('does not claim the route is missing when loading merely failed', async () => {
    // e.g. a 429 from rate limiting: search engines must not read this as "not found"
    vi.mocked(cityRouteService.get).mockRejectedValue({ response: { status: 429 } })

    const container = await renderPage()

    expect(container.querySelector('h1')?.textContent).toBe('cityRoute.error.title')
    expect(container.textContent).not.toContain('cityRoute.notFound.title')
  })
})
